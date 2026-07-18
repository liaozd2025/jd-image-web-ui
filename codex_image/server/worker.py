from __future__ import annotations

import base64
import signal
import threading
from uuid import uuid4

from codex_image.client import OpenAIImagesImageClient, OpenAIResponsesImageClient
from codex_image.client_types import ResponsesInputFile

from .assets import AssetRepository
from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .department_providers import DepartmentProviderRepository
from .migrations import MigrationRunner
from .provider_secrets import ProviderSecretCipher
from .shared_assets import SharedAssetRepository
from .tasks import ClaimedGenerationTask, GenerationTaskRepository
from .volume import check_file_volume


MAX_REFERENCE_BYTES = 32 * 1024 * 1024
MAX_PROMPT_ASSET_BYTES = 8 * 1024 * 1024


class HeartbeatWorker:
    def __init__(self, settings: ServerSettings) -> None:
        self.settings = settings
        connections = PostgresConnections(
            settings.database_url,
            connect_timeout_seconds=settings.database_connect_timeout_seconds,
        )
        self.migrations = MigrationRunner(connections)
        self.runtime = ServerRuntimeRepository(connections)
        self.provider_cipher = ProviderSecretCipher.from_encoded_key(settings.master_key)
        self.assets = AssetRepository(connections, settings.data_root)
        self.shared_assets = SharedAssetRepository(connections, settings.data_root)
        self.departments = DepartmentProviderRepository(connections, self.provider_cipher)
        self.tasks = GenerationTaskRepository(
            connections,
            self.provider_cipher,
            settings.data_root,
            assets=self.assets,
            shared_assets=self.shared_assets,
            departments=self.departments,
        )
        self.instance_id = str(uuid4())
        self.stop_event = threading.Event()
        self.volume_id: str | None = None
        self.schema_ready = False
        self.reconciled = False
        self.heartbeat_thread: threading.Thread | None = None

    def stop(self) -> None:
        self.stop_event.set()

    def run_forever(self) -> None:
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, name="worker-heartbeat", daemon=True)
        self.heartbeat_thread.start()
        try:
            while not self.stop_event.is_set():
                if not self.schema_ready:
                    self.schema_ready = self.migrations.try_apply()
                    if self.schema_ready:
                        self.provider_cipher.ensure_database_key(self.runtime.connections)
                file_volume = check_file_volume(self.settings.data_root, component="worker")
                self.volume_id = file_volume.get("volume_id")
                if self.schema_ready and self.volume_id is not None and not self.reconciled:
                    if not self.runtime.worker_is_alive(
                        volume_id=self.volume_id,
                        ttl_seconds=self.settings.worker_heartbeat_ttl_seconds,
                        instance_id=self.instance_id,
                    ):
                        for interrupted in self.tasks.reconcile_running_tasks():
                            self.tasks.settle_quota(interrupted, consumed=False)
                        self.reconciled = True
                if self.schema_ready:
                    try:
                        self._process_one_task()
                    except Exception:
                        pass
                self.stop_event.wait(self.settings.worker_heartbeat_interval_seconds)
        finally:
            self.stop_event.set()
            if self.heartbeat_thread is not None:
                self.heartbeat_thread.join(timeout=max(1.0, self.settings.worker_heartbeat_interval_seconds * 2))
            if self.volume_id is not None:
                try:
                    self.runtime.record_worker_heartbeat(
                        volume_id=self.volume_id,
                        instance_id=self.instance_id,
                        ready=False,
                    )
                except Exception:
                    pass

    def _heartbeat_loop(self) -> None:
        while not self.stop_event.is_set():
            if self.schema_ready and self.volume_id is not None:
                try:
                    self.runtime.record_worker_heartbeat(
                        volume_id=self.volume_id,
                        instance_id=self.instance_id,
                        ready=True,
                    )
                except Exception:
                    pass
            self.stop_event.wait(self.settings.worker_heartbeat_interval_seconds)

    def _process_one_task(self) -> None:
        claimed = self.tasks.claim_next_task()
        if claimed is None:
            return
        if claimed.task.cancel_requested:
            try:
                cancelled = self.tasks.cancel_claimed_task(claimed.task, attempt_id=claimed.attempt_id)
            except Exception:
                return
            self.tasks.settle_quota(cancelled, consumed=False)
            return
        if claimed.configuration_error or claimed.api_key is None:
            failed = self.tasks.fail_task(
                claimed.task,
                attempt_id=claimed.attempt_id,
                error_message=claimed.configuration_error or "active provider credential is unavailable",
            )
            self.tasks.settle_quota(failed, consumed=False)
            return
        try:
            client = self._provider_client(claimed)
            parameters = claimed.task.request_parameters
            reference_images: list[str] = []
            reference_files: list[ResponsesInputFile] = []
            if claimed.task.input_media_type and claimed.task.input_media_type.startswith("image/"):
                input_path = self.tasks.input_path(claimed.task)
                input_data = input_path.read_bytes()
                encoded = base64.b64encode(input_data).decode("ascii")
                reference_images = [f"data:{claimed.task.input_media_type};base64,{encoded}"]
            all_asset_snapshots = claimed.task.asset_versions + claimed.task.shared_asset_versions
            reference_bytes = 0
            for snapshot in all_asset_snapshots:
                asset_path = self.tasks.asset_reference_path(claimed.task, snapshot)
                asset_kind = str(snapshot.get("asset_kind"))
                if asset_kind in {"image", "reference"}:
                    asset_data = asset_path.read_bytes()
                    reference_bytes += len(asset_data)
                    if reference_bytes > MAX_REFERENCE_BYTES:
                        raise RuntimeError("task reference assets exceed the server memory limit")
                    encoded = base64.b64encode(asset_data).decode("ascii")
                    reference_images.append(f"data:{snapshot.get('mime_type')};base64,{encoded}")
                elif asset_kind == "file":
                    file_data = asset_path.read_bytes()
                    reference_bytes += len(file_data)
                    if reference_bytes > MAX_REFERENCE_BYTES:
                        raise RuntimeError("task reference assets exceed the server memory limit")
                    encoded = base64.b64encode(file_data).decode("ascii")
                    reference_files.append(
                        ResponsesInputFile(
                            filename=str(snapshot.get("original_filename") or "reference-file"),
                            mime_type=str(snapshot.get("mime_type") or "application/octet-stream"),
                            file_data=f"data:{snapshot.get('mime_type')};base64,{encoded}",
                        )
                    )
            prompt = claimed.task.prompt
            prompt_asset_bytes = 0
            for snapshot in all_asset_snapshots:
                if str(snapshot.get("asset_kind")) not in {"template", "prompt"}:
                    continue
                asset_path = self.tasks.asset_reference_path(claimed.task, snapshot)
                prompt_asset_bytes += asset_path.stat().st_size
                if prompt_asset_bytes > MAX_PROMPT_ASSET_BYTES:
                    raise RuntimeError("task prompt assets exceed the server memory limit")
                prompt = f"{prompt}\n\n{asset_path.read_text(encoding='utf-8')}"
            output_count = max(1, min(4, int(parameters.get("n") or 1)))
            common_parameters = {
                "prompt": prompt,
                "main_model": str(parameters.get("main_model") or claimed.task.model_id),
                "model": claimed.task.model_id,
                "reference_images": reference_images or None,
                "size": str(parameters.get("size") or "1024x1024"),
                "quality": str(parameters.get("quality") or "auto"),
                "output_format": str(parameters.get("output_format") or "png"),
                "moderation": str(parameters.get("moderation") or "auto"),
                "output_compression": parameters.get("output_compression"),
            }
            if claimed.api_mode == "images":
                results = client.generate_images(**common_parameters, n=output_count)
            else:
                results = [
                    client.generate_image(
                        **common_parameters,
                        reference_files=reference_files or None,
                        web_search=bool(parameters.get("web_search")),
                    )
                    for _ in range(output_count)
                ]
            completed = self.tasks.complete_task_outputs(
                claimed.task,
                attempt_id=claimed.attempt_id,
                outputs=[
                    (
                        result.image_bytes,
                        str(parameters.get("output_format") or result.output_format or "png"),
                        result.revised_prompt,
                    )
                    for result in results
                ],
            )
            self.tasks.settle_quota(completed, consumed=completed.status == "completed")
        except Exception as error:
            safe_error = str(error).replace(claimed.api_key, "<redacted credential>")
            try:
                failed = self.tasks.fail_task(claimed.task, attempt_id=claimed.attempt_id, error_message=safe_error)
            except Exception:
                return
            self.tasks.settle_quota(failed, consumed=False)

    @staticmethod
    def _provider_client(claimed: ClaimedGenerationTask):
        if claimed.api_mode == "images":
            return OpenAIImagesImageClient(
                api_key=claimed.api_key or "",
                base_url=claimed.base_url or "",
                image_model=claimed.task.model_id,
            )
        if claimed.api_mode == "responses":
            return OpenAIResponsesImageClient(
                api_key=claimed.api_key or "",
                base_url=claimed.base_url or "",
                image_model=claimed.task.model_id,
            )
        raise RuntimeError("provider API mode is unsupported")


def main() -> int:
    worker = HeartbeatWorker(ServerSettings.from_env())
    signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    signal.signal(signal.SIGINT, lambda *_: worker.stop())
    worker.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

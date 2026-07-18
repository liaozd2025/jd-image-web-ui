from __future__ import annotations

import signal
import base64
import threading
from uuid import uuid4

from codex_image.client import OpenAIImagesImageClient, OpenAIResponsesImageClient

from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .migrations import MigrationRunner
from .provider_secrets import ProviderSecretCipher
from .tasks import ClaimedGenerationTask, GenerationTaskRepository
from .volume import check_file_volume


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
        self.tasks = GenerationTaskRepository(
            connections,
            self.provider_cipher,
            settings.data_root,
        )
        self.instance_id = str(uuid4())
        self.stop_event = threading.Event()
        self.volume_id: str | None = None
        self.schema_ready = False

    def stop(self) -> None:
        self.stop_event.set()

    def run_forever(self) -> None:
        try:
            while not self.stop_event.is_set():
                if not self.schema_ready:
                    self.schema_ready = self.migrations.try_apply()
                    if self.schema_ready:
                        self.provider_cipher.ensure_database_key(self.runtime.connections)
                        self.tasks.reconcile_running_tasks()
                if self.schema_ready:
                    try:
                        self._process_one_task()
                    except Exception:
                        pass
                file_volume = check_file_volume(self.settings.data_root, component="worker")
                self.volume_id = file_volume.get("volume_id")
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
        finally:
            if self.volume_id is not None:
                try:
                    self.runtime.record_worker_heartbeat(
                        volume_id=self.volume_id,
                        instance_id=self.instance_id,
                        ready=False,
                    )
                except Exception:
                    pass

    def _process_one_task(self) -> None:
        claimed = self.tasks.claim_next_task()
        if claimed is None:
            return
        if claimed.configuration_error or claimed.api_key is None:
            self.tasks.fail_task(
                claimed.task,
                claimed.configuration_error or "personal provider credential is unavailable",
            )
            return
        try:
            client = self._provider_client(claimed)
            parameters = claimed.task.request_parameters
            reference_images: list[str] = []
            if claimed.task.input_media_type and claimed.task.input_media_type.startswith("image/"):
                input_path = self.tasks.input_path(claimed.task)
                input_data = input_path.read_bytes()
                encoded = base64.b64encode(input_data).decode("ascii")
                reference_images = [f"data:{claimed.task.input_media_type};base64,{encoded}"]
            result = client.generate_image(
                prompt=claimed.task.prompt,
                model=claimed.task.model_id,
                reference_images=reference_images or None,
                size=str(parameters.get("size") or "1024x1024"),
                quality=str(parameters.get("quality") or "auto"),
                output_format=str(parameters.get("output_format") or "png"),
            )
            self.tasks.complete_task(
                claimed.task,
                image_bytes=result.image_bytes,
                output_format=str(parameters.get("output_format") or result.output_format or "png"),
                revised_prompt=result.revised_prompt,
            )
        except Exception as error:
            safe_error = str(error).replace(claimed.api_key, "<redacted credential>")
            self.tasks.fail_task(claimed.task, safe_error)

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

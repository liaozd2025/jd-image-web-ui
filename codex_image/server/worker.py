from __future__ import annotations

import base64
from io import BytesIO
import signal
import threading
from typing import cast
from uuid import uuid4

from codex_image.client import OpenAIImagesImageClient, OpenAIResponsesImageClient
from codex_image.client_types import ImageResult, ResponsesInputFile
from codex_image.generation.catalog import get_model_manifest
from codex_image.generation.resolver import BindingResolver
from codex_image.generation.service import GenerationService
from codex_image.generation.types import GenerationCommand, GenerationOperation, ImageInput
from codex_image.providers.contracts import ProviderConnection, ProviderModelBinding
from codex_image.providers.registry import default_registry

from .assets import AssetRepository
from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .department_providers import DepartmentProviderRepository
from .migrations import MigrationRunner
from .model_capabilities import get_model_capability_profile
from .model_validation import ClaimedModelValidation, ModelValidationRepository
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
        self.model_validations = ModelValidationRepository(connections)
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
                        if not self._process_one_validation():
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
            canonical_runtime = (
                claimed.task.generation_snapshot.get("runtime") == "canonical"
                and claimed.task.generation_snapshot.get("model_family_id") == "gemini-image"
            )
            client = None if canonical_runtime else self._provider_client(claimed)
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
            requested_output_indices = parameters.get("output_indices")
            if isinstance(requested_output_indices, list) and len(requested_output_indices) == output_count:
                output_indices = [int(item) for item in requested_output_indices]
            else:
                output_indices = list(range(1, output_count + 1))
            failures: list[tuple[int, str]] = []
            if canonical_runtime:
                results = []
                while len(results) < len(output_indices):
                    try:
                        batch = self._execute_canonical_generation(
                            claimed,
                            prompt=prompt,
                            reference_images=reference_images,
                            reference_files=reference_files,
                        )
                    except Exception as error:
                        failures = [
                            (output_index, str(error))
                            for output_index in output_indices[len(results) :]
                        ]
                        break
                    if not batch:
                        failures = [
                            (output_index, "provider returned no images")
                            for output_index in output_indices[len(results) :]
                        ]
                        break
                    results.extend(batch)
                successful_output_indices = output_indices[: len(results)]
                if len(results) < len(output_indices) and not failures:
                    failures.extend(
                        (output_index, "provider returned fewer images than requested")
                        for output_index in output_indices[len(results) :]
                    )
                results = results[: len(output_indices)]
                actual_seeds = [None] * len(results)
            elif claimed.api_mode == "images":
                seed_profile = claimed.task.capability_snapshot.get("seed")
                seed_profile = seed_profile if isinstance(seed_profile, dict) else {}
                base_seed = parameters.get("seed") if seed_profile.get("supported") else None
                prompt_optimization_mode = str(parameters.get("prompt_optimization_mode") or "off")
                uses_volcengine_ark = (
                    claimed.task.capability_snapshot.get("protocol_adapter")
                    == "volcengine-ark-images"
                )
                phase_features = claimed.task.capability_snapshot.get("phase_features")
                phase_features = phase_features if isinstance(phase_features, dict) else {}
                results = []
                actual_seeds: list[int | None] = []
                successful_output_indices: list[int] = []
                for output_index in output_indices:
                    actual_seed = (
                        self._output_seed(int(base_seed), output_index - 1, seed_profile)
                        if base_seed is not None
                        else None
                    )
                    request_parameters = dict(common_parameters)
                    if uses_volcengine_ark:
                        request_parameters.update(
                            {
                                "seed": actual_seed,
                                "prompt_optimization_mode": prompt_optimization_mode,
                                "watermark": False,
                                "sequential_image_generation": (
                                    "disabled"
                                    if phase_features.get("sequential_generation")
                                    else None
                                ),
                                "stream": False if phase_features.get("streaming") else None,
                            }
                        )
                    try:
                        results.append(client.generate_images(**request_parameters, n=1)[0])
                        actual_seeds.append(actual_seed)
                        successful_output_indices.append(output_index)
                    except Exception as error:
                        failures.append((output_index, str(error)))
            else:
                results = []
                successful_output_indices = []
                for output_index in output_indices:
                    try:
                        results.append(
                            client.generate_image(
                                **common_parameters,
                                reference_files=reference_files or None,
                                web_search=bool(parameters.get("web_search")),
                            )
                        )
                        successful_output_indices.append(output_index)
                    except Exception as error:
                        failures.append((output_index, str(error)))
                actual_seeds = [None] * len(results)
            if not results:
                raise RuntimeError(failures[0][1] if failures else "provider returned no image results")
            safe_failures = [
                (index, message.replace(claimed.api_key, "<redacted credential>"))
                for index, message in failures
            ]
            completed = self.tasks.complete_task_outputs(
                claimed.task,
                attempt_id=claimed.attempt_id,
                outputs=[
                    (
                        result.image_bytes,
                        _resolved_output_format(
                            result,
                            parameters.get("output_format"),
                            canonical_runtime=canonical_runtime,
                        ),
                        result.revised_prompt,
                        {
                            "index": successful_output_indices[index],
                            "seed": actual_seeds[index],
                        },
                    )
                    for index, result in enumerate(results)
                ],
                final_status="partial_failed" if failures else "completed",
                error_message=(
                    "; ".join(f"result {index}: {message}" for index, message in safe_failures)
                    if safe_failures
                    else None
                ),
                failed_output_indices=[index for index, _ in failures],
            )
            self.tasks.settle_quota(
                completed,
                consumed=completed.status in {"completed", "partial_failed"},
            )
        except Exception as error:
            safe_error = str(error).replace(claimed.api_key, "<redacted credential>")
            try:
                failed = self.tasks.fail_task(claimed.task, attempt_id=claimed.attempt_id, error_message=safe_error)
            except Exception:
                return
            self.tasks.settle_quota(failed, consumed=False)

    @staticmethod
    def _execute_canonical_generation(
        claimed: ClaimedGenerationTask,
        *,
        prompt: str,
        reference_images: list[str],
        reference_files: list[ResponsesInputFile],
    ) -> list[ImageResult]:
        snapshot = claimed.task.generation_snapshot
        canonical_model_id = str(snapshot.get("canonical_model_id") or "")
        provider_version_id = claimed.task.provider_version_id
        binding = ProviderModelBinding(
            id=str(snapshot.get("binding_id") or claimed.task.generation_model_id or ""),
            provider_id=provider_version_id,
            canonical_model_id=canonical_model_id,
            remote_model_id=str(snapshot.get("remote_model_id") or claimed.task.model_id),
            protocol_profile=str(snapshot.get("protocol_profile") or ""),
            parameter_codec=str(snapshot.get("parameter_codec") or ""),
            operations=frozenset(
                str(value) for value in snapshot.get("supported_operations") or ()
            ),
            append_aspect_ratio_prompt=bool(
                snapshot.get("append_aspect_ratio_prompt", False)
            ),
        )
        provider = ProviderConnection(
            id=provider_version_id,
            name=str(snapshot.get("provider_key") or provider_version_id),
            base_url=str(claimed.base_url or ""),
            api_key=str(claimed.api_key or ""),
            concurrency=1,
            bindings=(binding,),
        )
        effective_prompt = prompt
        if binding.append_aspect_ratio_prompt:
            ratio = str(
                (snapshot.get("requested_parameters") or {}).get("canvas.aspect_ratio")
                if isinstance(snapshot.get("requested_parameters"), dict)
                else ""
            )
            if ratio:
                effective_prompt = f"{prompt}\n\nAspect ratio: {ratio}"
        command = GenerationCommand(
            operation=cast(
                GenerationOperation,
                claimed.task.request_parameters.get("mode", "generate"),
            ),
            canonical_model_id=canonical_model_id,
            provider_id=provider_version_id,
            binding_id=binding.id,
            prompt=effective_prompt,
            parameters=dict(snapshot.get("requested_parameters") or {}),
            image_inputs=tuple(ImageInput(value) for value in reference_images),
            reference_files=tuple(reference_files),
            main_model=str(claimed.task.request_parameters.get("main_model") or ""),
        )
        manifest = get_model_manifest(canonical_model_id)
        registry = default_registry()
        resolver = BindingResolver(
            models={manifest.id: manifest},
            providers={provider.id: provider},
            registry=registry,
        )
        plan = resolver.resolve(command)
        result = GenerationService(resolver, registry).execute_plan_once(plan)
        converted: list[ImageResult] = []
        for asset in result.assets:
            metadata = dict(asset.metadata)
            mime_type = str(asset.mime_type or "image/png").split(";", 1)[0].lower()
            output_format = mime_type.split("/", 1)[1] if "/" in mime_type else "png"
            if output_format == "jpg":
                output_format = "jpeg"
            size = str(metadata.get("size") or "")
            if not size and asset.width and asset.height:
                size = f"{asset.width}x{asset.height}"
            tool_usage = dict(metadata.get("tool_usage") or {})
            if result.text_parts:
                tool_usage["text_parts"] = list(result.text_parts)
            if result.provider_metadata:
                tool_usage["provider_metadata"] = dict(result.provider_metadata)
            converted.append(
                ImageResult(
                    image_bytes=asset.image_bytes,
                    revised_prompt=asset.revised_prompt,
                    output_format=output_format,
                    size=size,
                    background=str(metadata.get("background") or "auto"),
                    quality=str(metadata.get("quality") or "auto"),
                    usage=dict(result.usage),
                    tool_usage=tool_usage,
                )
            )
        return converted

    @staticmethod
    def _output_seed(base_seed: int, output_index: int, seed_profile: dict[str, object]) -> int:
        minimum = int(seed_profile.get("minimum") or 0)
        maximum = int(seed_profile.get("maximum") or 2147483647)
        return minimum + ((base_seed - minimum + output_index) % (maximum - minimum + 1))

    def _process_one_validation(self) -> bool:
        claimed = self.model_validations.claim_next()
        if claimed is None:
            return False
        api_key = ""
        try:
            api_key = self.departments.resolve_api_key(
                provider_version_id=claimed.provider_version_id
            )
            client = self._validation_client(claimed, api_key=api_key)
            parameters = claimed.request_parameters
            common_parameters = {
                "prompt": "A simple blue circle on a plain white background.",
                "main_model": claimed.model_id,
                "model": claimed.model_id,
                "reference_images": None,
                "size": str(parameters["size"]),
                "quality": "auto",
                "output_format": str(parameters["output_format"]),
                "moderation": "auto",
                "output_compression": None,
            }
            if claimed.api_mode == "images":
                profile = get_model_capability_profile(claimed.capability_profile_id)
                adapter_parameters = {}
                if profile.get("protocol_adapter") == "volcengine-ark-images":
                    phase_features = profile.get("phase_features")
                    phase_features = phase_features if isinstance(phase_features, dict) else {}
                    adapter_parameters = {
                        "prompt_optimization_mode": str(
                            parameters.get("prompt_optimization_mode") or "off"
                        ),
                        "watermark": bool(parameters.get("watermark", False)),
                        "sequential_image_generation": (
                            "disabled" if phase_features.get("sequential_generation") else None
                        ),
                        "stream": False if phase_features.get("streaming") else None,
                    }
                result = client.generate_images(
                    **common_parameters,
                    n=1,
                    **adapter_parameters,
                )[0]
            else:
                result = client.generate_image(
                    **common_parameters,
                    reference_files=None,
                    web_search=False,
                )
            from PIL import Image

            with Image.open(BytesIO(result.image_bytes)) as image:
                image.verify()
            self.model_validations.complete(
                claimed,
                provider_request_id=result.provider_request_id,
            )
        except Exception as error:
            safe_error = str(error).replace(api_key, "<redacted credential>") if api_key else str(error)
            self.model_validations.fail(claimed, error_message=safe_error)
        return True

    @staticmethod
    def _provider_client(claimed: ClaimedGenerationTask):
        if claimed.api_mode == "images":
            return OpenAIImagesImageClient(
                api_key=claimed.api_key or "",
                base_url=claimed.base_url or "",
                image_model=claimed.task.model_id,
                protocol_adapter=str(
                    claimed.task.capability_snapshot.get("protocol_adapter") or "openai-compatible"
                ),
            )
        if claimed.api_mode == "responses":
            return OpenAIResponsesImageClient(
                api_key=claimed.api_key or "",
                base_url=claimed.base_url or "",
                image_model=claimed.task.model_id,
            )
        raise RuntimeError("provider API mode is unsupported")

    @staticmethod
    def _validation_client(claimed: ClaimedModelValidation, *, api_key: str):
        if claimed.api_mode == "images":
            profile = get_model_capability_profile(claimed.capability_profile_id)
            return OpenAIImagesImageClient(
                api_key=api_key,
                base_url=claimed.base_url,
                image_model=claimed.model_id,
                protocol_adapter=str(profile.get("protocol_adapter") or "openai-compatible"),
            )
        if claimed.api_mode == "responses":
            return OpenAIResponsesImageClient(
                api_key=api_key,
                base_url=claimed.base_url,
                image_model=claimed.model_id,
            )
        raise RuntimeError("provider API mode is unsupported")


def _resolved_output_format(
    result: ImageResult,
    requested_output_format: object,
    *,
    canonical_runtime: bool,
) -> str:
    if canonical_runtime:
        return str(result.output_format or requested_output_format or "png")
    return str(requested_output_format or result.output_format or "png")


def main() -> int:
    worker = HeartbeatWorker(ServerSettings.from_env())
    signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    signal.signal(signal.SIGINT, lambda *_: worker.stop())
    worker.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

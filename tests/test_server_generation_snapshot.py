from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from codex_image.server.model_capabilities import get_model_capability_profile
from codex_image.server.tasks import TaskConfigurationError, _resolve_generation_snapshot
from codex_image.server.tasks import ClaimedGenerationTask
from codex_image.server.worker import HeartbeatWorker, _resolved_output_format
from codex_image.providers.registry import default_registry
from tests.helpers import FakeResponse, FakeTransport


def _generation_model(**overrides):
    value = {
        "generation_model_id": "generation-model-1",
        "model_id": "vendor/gemini-3.1-flash-image",
        "capability_profile_id": "nano-banana-2",
        "capability_profile_version": 1,
        "model_family_id": "gemini-image",
        "canonical_model_id": "nano-banana-2",
        "protocol_profile": "gemini_generate_content",
        "parameter_codec": "gemini_generate_content_image",
        "supported_operations": ["generate", "edit"],
        "append_aspect_ratio_prompt": False,
    }
    value.update(overrides)
    return value


class ServerGenerationSnapshotTests(unittest.TestCase):
    def test_submitted_canonical_parameters_are_revalidated_and_frozen(self) -> None:
        profile = get_model_capability_profile("nano-banana-2")
        canonical = {
            "canvas.aspect_ratio": "8:1",
            "canvas.resolution": "4K",
            "output.count": 2,
            "gemini.safety_settings": {
                "HARM_CATEGORY_HARASSMENT": "BLOCK_LOW_AND_ABOVE",
            },
            "gemini.google_search": False,
        }
        request_parameters = {
            "mode": "generate",
            "size": "4096x4096",
            "resolution": "4k",
            "ratio": "8:1",
            "n": 2,
            "output_format": "png",
            "canonical_parameters": canonical,
        }

        snapshot = _resolve_generation_snapshot(
            provider_version_id="provider-1",
            provider_key="gemini",
            generation_model=_generation_model(),
            capability_snapshot=profile,
            request_parameters=request_parameters,
            prompt="draw a panorama",
            reference_image_count=0,
            reference_file_count=0,
        )

        self.assertEqual(snapshot["requested_parameters"], canonical)
        self.assertNotIn("canonical_parameters", snapshot["actual_parameters"])

        with self.assertRaisesRegex(TaskConfigurationError, "Unknown parameter"):
            _resolve_generation_snapshot(
                provider_version_id="provider-1",
                provider_key="gemini",
                generation_model=_generation_model(),
                capability_snapshot=profile,
                request_parameters={
                    **request_parameters,
                    "canonical_parameters": {**canonical, "api_key": "must-not-pass"},
                },
                prompt="draw a panorama",
                reference_image_count=0,
                reference_file_count=0,
            )
        with self.assertRaisesRegex(TaskConfigurationError, "Unknown object parameter"):
            _resolve_generation_snapshot(
                provider_version_id="provider-1",
                provider_key="gemini",
                generation_model=_generation_model(),
                capability_snapshot=profile,
                request_parameters={
                    **request_parameters,
                    "canonical_parameters": {
                        **canonical,
                        "gemini.safety_settings": {"api_key": "must-not-pass"},
                    },
                },
                prompt="draw a panorama",
                reference_image_count=0,
                reference_file_count=0,
            )

    def test_canonical_provider_media_type_overrides_requested_extension(self) -> None:
        result = SimpleNamespace(output_format="png")

        self.assertEqual(
            _resolved_output_format(
                result,  # type: ignore[arg-type]
                "webp",
                canonical_runtime=True,
            ),
            "png",
        )
        self.assertEqual(
            _resolved_output_format(
                result,  # type: ignore[arg-type]
                "webp",
                canonical_runtime=False,
            ),
            "webp",
        )

    def test_server_resolves_canonical_parameters_from_database_binding(self) -> None:
        profile = get_model_capability_profile("nano-banana-2")
        request_parameters = {
            "mode": "edit",
            "size": "2048x2048",
            "resolution": "2k",
            "ratio": "16:9",
            "n": 2,
            "output_format": "png",
            "web_search": True,
        }

        snapshot = _resolve_generation_snapshot(
            provider_version_id="provider-1",
            provider_key="gemini",
            generation_model=_generation_model(),
            capability_snapshot=profile,
            request_parameters=request_parameters,
            prompt="draw a rabbit",
            reference_image_count=1,
            reference_file_count=0,
        )

        self.assertEqual(snapshot["runtime"], "canonical")
        self.assertEqual(snapshot["remote_model_id"], "vendor/gemini-3.1-flash-image")
        self.assertEqual(
            snapshot["requested_parameters"],
            {
                "canvas.aspect_ratio": "16:9",
                "canvas.resolution": "2K",
                "output.count": 2,
                "gemini.safety_settings": {
                    "HARM_CATEGORY_HARASSMENT": "OFF",
                    "HARM_CATEGORY_HATE_SPEECH": "OFF",
                    "HARM_CATEGORY_SEXUALLY_EXPLICIT": "OFF",
                    "HARM_CATEGORY_DANGEROUS_CONTENT": "OFF",
                },
                "gemini.google_search": True,
            },
        )
        self.assertEqual(snapshot["actual_parameters"], request_parameters)

    def test_server_rejects_binding_operation_and_reference_file_mismatch(self) -> None:
        profile = get_model_capability_profile("nano-banana-2")
        base = dict(
            provider_version_id="provider-1",
            provider_key="gemini",
            capability_snapshot=profile,
            request_parameters={
                "mode": "edit",
                "size": "1024x1024",
                "resolution": "standard",
                "ratio": "1:1",
                "n": 1,
                "output_format": "png",
            },
            prompt="edit a rabbit",
            reference_image_count=1,
        )
        with self.assertRaisesRegex(TaskConfigurationError, "binding does not support"):
            _resolve_generation_snapshot(
                **base,
                generation_model=_generation_model(supported_operations=["generate"]),
                reference_file_count=0,
            )
        with self.assertRaisesRegex(TaskConfigurationError, "reference files"):
            _resolve_generation_snapshot(
                **base,
                generation_model=_generation_model(),
                reference_file_count=1,
            )

    def test_worker_executes_frozen_gemini_plan_with_official_auth(self) -> None:
        transport = FakeTransport(
            [
                FakeResponse(
                    status=200,
                    body=Path(
                        "tests/fixtures/providers/gemini_generate_content_response.json"
                    ).read_bytes(),
                )
            ]
        )
        task = SimpleNamespace(
            provider_version_id="provider-1",
            generation_model_id="generation-model-1",
            model_id="vendor/gemini-3.1-flash-image",
            request_parameters={"mode": "generate", "main_model": ""},
            generation_snapshot={
                "runtime": "canonical",
                "model_family_id": "gemini-image",
                "canonical_model_id": "nano-banana-2",
                "remote_model_id": "vendor/gemini-3.1-flash-image",
                "provider_key": "gemini",
                "binding_id": "generation-model-1",
                "protocol_profile": "gemini_generate_content",
                "parameter_codec": "gemini_generate_content_image",
                "supported_operations": ["generate", "edit"],
                "append_aspect_ratio_prompt": False,
                "requested_parameters": {
                    "canvas.aspect_ratio": "16:9",
                    "canvas.resolution": "2K",
                    "output.count": 1,
                    "gemini.safety_settings": {},
                    "gemini.google_search": False,
                },
            },
        )
        claimed = ClaimedGenerationTask(
            task=task,  # type: ignore[arg-type]
            attempt_id="attempt-1",
            api_mode="images",
            base_url="https://generativelanguage.googleapis.com/v1beta",
            api_key="gemini-secret",
        )

        with patch(
            "codex_image.server.worker.default_registry",
            return_value=default_registry(transport=transport),
        ):
            results = HeartbeatWorker._execute_canonical_generation(
                claimed,
                prompt="draw a rabbit",
                reference_images=[],
                reference_files=[],
            )

        self.assertEqual([result.image_bytes for result in results], [b"final-image"])
        request = transport.requests[0]
        self.assertEqual(
            request["url"],
            "https://generativelanguage.googleapis.com/v1beta/models/"
            "vendor%2Fgemini-3.1-flash-image:generateContent",
        )
        self.assertEqual(request["headers"]["x-goog-api-key"], "gemini-secret")
        self.assertNotIn("Authorization", request["headers"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from pathlib import Path

from codex_image.generation.catalog import list_model_families, list_model_manifests
from codex_image.providers.auth import auth_scheme_for_protocol
from codex_image.providers.capabilities import CODEC_CAPABILITIES, protocol_codec_pairs
from codex_image.providers.registry import default_registry


class SupportedModelFamiliesTests(unittest.TestCase):
    def test_catalog_contains_only_gpt_and_gemini_families(self) -> None:
        self.assertEqual(
            [family.id for family in list_model_families()],
            ["gpt-image", "gemini-image"],
        )
        self.assertEqual(
            {model.id for model in list_model_manifests()},
            {
                "gpt-image-2",
                "nano-banana-pro",
                "nano-banana-2",
                "nano-banana-2-lite",
            },
        )

    def test_runtime_does_not_register_retired_model_protocols_or_codecs(self) -> None:
        registry = default_registry()
        with self.assertRaisesRegex(ValueError, "Unknown protocol profile"):
            registry.protocol("xai_images")
        with self.assertRaisesRegex(ValueError, "Unknown parameter codec"):
            registry.codec("grok_xai_images")
        with self.assertRaisesRegex(ValueError, "Unknown parameter codec"):
            registry.codec("grok_openai_images")
        with self.assertRaisesRegex(ValueError, "Unknown protocol profile"):
            registry.protocol("codex_responses")
        with self.assertRaisesRegex(ValueError, "Unknown parameter codec"):
            registry.codec("gpt_codex_responses")
        self.assertFalse(any("grok" in codec_id for codec_id in CODEC_CAPABILITIES))
        self.assertFalse(
            any(
                "xai" in profile or "grok" in codec
                for profile, codec in protocol_codec_pairs()
            )
        )
        with self.assertRaisesRegex(ValueError, "unknown_protocol_auth_scheme"):
            auth_scheme_for_protocol("xai_images")

    def test_only_supported_family_marks_are_shipped(self) -> None:
        marks = Path("codex_image/webui/static/brand/model-marks")
        self.assertTrue((marks / "openai.svg").is_file())
        self.assertTrue((marks / "gemini.svg").is_file())
        self.assertFalse((marks / "grok.svg").exists())


if __name__ == "__main__":
    unittest.main()

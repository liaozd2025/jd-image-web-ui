from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class WebUIGenerationModelContractTests(unittest.TestCase):
    def test_selector_stays_between_prompt_utilities_and_template_management(self) -> None:
        html = (ROOT / "codex_image/webui/static/index.html").read_text(encoding="utf-8")
        row_start = html.index('<div class="prompt-template-row">')
        row_end = html.index("</section>", row_start)
        row = html[row_start:row_end]
        self.assertLess(row.index('id="promptFindButton"'), row.index('id="generationModelField"'))
        self.assertLess(row.index('id="generationModelField"'), row.index('id="promptTemplateButton"'))
        self.assertIn('aria-describedby="generationModelSummary generationModelNotice"', row)

    def test_submission_uses_stable_model_identity_and_explicit_advanced_parameters(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/task-submit.ts").read_text(encoding="utf-8")
        self.assertIn('form.append("generation_model_id"', source)
        self.assertIn('form.append("capability_profile_version"', source)
        self.assertIn('form.append("prompt_optimization_mode"', source)
        self.assertIn('form.append("seed_mode"', source)
        self.assertIn("generationModelConstraintMessage()", source)

    def test_provider_refresh_preserves_the_current_provider_for_model_preference_restore(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/api-provider-settings.ts").read_text(encoding="utf-8")
        self.assertIn("localActiveProviderId", source)
        self.assertIn("normalized.active_provider_id = localActiveProviderId", source)

    def test_capability_driven_controls_do_not_expose_phase_two_or_watermark_ui(self) -> None:
        html = (ROOT / "codex_image/webui/static/index.html").read_text(encoding="utf-8")
        source = (ROOT / "codex_image/webui/frontend/src/generation-model.ts").read_text(encoding="utf-8")
        self.assertIn('id="promptOptimizationMode"', html)
        self.assertIn('id="seedMode"', html)
        self.assertNotIn('id="watermark', html)
        self.assertNotIn("sequential_image_generation", source)
        self.assertNotIn("precise_edit", source)
        self.assertNotIn("streaming", source)
        self.assertIn('fetch("/api/generation-model-preferences"', source)
        self.assertIn("currentImageReferenceCount", source)
        self.assertIn("decorateGenerationModelReferenceThumb", source)
        self.assertIn('"generationModel.referenceOverLimit"', source)
        self.assertIn("n: Math.max(1", source)
        self.assertIn('translate("generationModel.parametersAdjusted")', source)
        self.assertIn('translate("generationModel.seedInvalid")', source)
        self.assertIn("storedProvider.selected_generation_model_id", source)

    def test_every_locale_has_explicit_generation_model_copy(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/generation-model-translations.ts").read_text(encoding="utf-8")
        for locale in ("zh-TW", "zh-HK", "ja", "ko", "es", "pt", "fr", "de", "ru", "it", "hi"):
            self.assertIn(f'{locale}: dictionary(' if "-" not in locale else f'"{locale}": dictionary(', source)
        self.assertIn('"generationModel.referenceOverLimit"', source)
        self.assertIn('"taskActions.retryWithCurrentCapability"', source)
        self.assertIn('"generationModel.summarySeedreamLite"', source)

    def test_dynamic_model_copy_rerenders_on_locale_change(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/generation-model.ts").read_text(encoding="utf-8")
        self.assertIn("profileSummary", source)
        self.assertIn("profile.summary_key", source)
        self.assertIn("LOCALE_CHANGE_EVENT", source)
        self.assertIn("renderGenerationModelSelector(false)", source)

    def test_model_selector_css_has_a_narrow_screen_contract(self) -> None:
        css = (ROOT / "codex_image/webui/static/styles/60-prompt.css").read_text(encoding="utf-8")
        self.assertIn(".generation-model-field", css)
        self.assertIn("@media (max-width: 760px)", css)
        self.assertRegex(css, r"\.prompt-template-row\s*\{[^}]*grid-template-columns:\s*1fr")


if __name__ == "__main__":
    unittest.main()

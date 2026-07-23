from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class WebUIGenerationModelContractTests(unittest.TestCase):
    def test_generation_model_feature_is_initialized_with_the_merged_catalog_ui(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/main.ts").read_text(encoding="utf-8")

        self.assertIn('import { initGenerationModelFeature } from "./generation-model";', source)
        self.assertIn("initGenerationModelFeature();", source)

    def test_selector_stays_between_prompt_utilities_and_template_management(self) -> None:
        html = (ROOT / "codex_image/webui/static/index.html").read_text(encoding="utf-8")
        sidebar = html[html.index('<div class="brand"'):html.index('<div class="sidebar-search">')]
        prompt = html[html.index('<section class="panel prompt-panel"'):html.index('</section>', html.index('<section class="panel prompt-panel"'))]
        output = html[html.index('id="settingsGrid"'):html.index('id="modelParameterGrid"') + 64]

        self.assertLess(sidebar.index('class="brand-name"'), sidebar.index('id="modelFamilyOptions"'))
        self.assertLess(prompt.index('id="promptFindButton"'), prompt.index('id="generationModelField"'))
        self.assertLess(prompt.index('id="generationModelField"'), prompt.index('id="promptTemplateButton"'))
        self.assertIn('id="generationModelSelect"', prompt)
        self.assertIn('aria-describedby="generationModelSummary generationModelNotice"', prompt)
        self.assertLess(output.index('id="concreteModelSelect"'), output.index('id="modelParameterGrid"'))

    def test_submission_uses_stable_model_identity_and_explicit_advanced_parameters(self) -> None:
        submit = (ROOT / "codex_image/webui/frontend/src/task-submit.ts").read_text(encoding="utf-8")
        request = (ROOT / "codex_image/webui/frontend/src/generation-request.ts").read_text(encoding="utf-8")
        server = (ROOT / "codex_image/server/workspace_api.py").read_text(encoding="utf-8")

        self.assertIn('form.append("canonical_model_id"', request)
        self.assertIn('form.append("provider_id"', request)
        self.assertIn('form.append("binding_id"', request)
        self.assertIn('form.append("parameters_json"', request)
        self.assertIn("generation_model_id: selection.bindingId", request)
        self.assertIn("prompt_optimization_mode:", request)
        self.assertIn("seed_mode:", request)
        self.assertIn("appendServerCompatibleGenerationFields(form, selection", submit)
        self.assertIn('form.get("generation_model_id")', server)
        self.assertIn('form.get("binding_id")', server)
        self.assertIn("_canonical_parameters_from_form(form)", server)
        self.assertIn("resolved_canonical_model_id", server)

    def test_provider_refresh_preserves_the_current_provider_for_model_preference_restore(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/api-provider-settings.ts").read_text(encoding="utf-8")
        self.assertIn("localActiveProviderId", source)
        self.assertIn("normalized.active_provider_id = localActiveProviderId", source)

    def test_capability_driven_controls_do_not_expose_phase_two_or_watermark_ui(self) -> None:
        html = (ROOT / "codex_image/webui/static/index.html").read_text(encoding="utf-8")
        parameters = (ROOT / "codex_image/webui/frontend/src/model-parameters.ts").read_text(encoding="utf-8")
        catalog = (ROOT / "codex_image/webui/frontend/src/model-catalog.ts").read_text(encoding="utf-8")
        server = (ROOT / "codex_image/server/workspace_api.py").read_text(encoding="utf-8")

        self.assertIn('id="modelParameterGrid"', html)
        self.assertIn('id="taskParameterInspector"', html)
        self.assertNotIn('id="watermark', html)
        self.assertIn("export function renderModelParameters", parameters)
        self.assertIn('"legacy.prompt_optimization_mode"', server)
        self.assertIn('"legacy.seed_mode"', server)
        self.assertIn('"legacy.seed"', server)
        self.assertIn("get_model_capability_profile", server)
        self.assertIn("applyServerModelPreferences(payload)", catalog)
        self.assertIn("state.parameterDraftsByModel", catalog)

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

    def test_enabled_team_models_are_not_hidden_by_validation_status(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/generation-model.ts").read_text(encoding="utf-8")
        available_models = source[source.index("function availableModels"):source.index("export function currentGenerationModel")]
        self.assertIn("model?.is_enabled !== false", available_models)
        self.assertNotIn("validation_status", available_models)

    def test_catalog_parameter_changes_use_the_catalog_preference_saver(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/generation-model.ts").read_text(encoding="utf-8")
        handler = source[
            source.index("function handleParameterChange"):
            source.index("async function loadProfiles")
        ]

        self.assertIn("if (state.generationCatalog)", handler)
        self.assertIn("queueCurrentModelPreferenceSave", handler)
        self.assertLess(handler.index("queueCurrentModelPreferenceSave"), handler.index("queuePreferenceSave"))

    def test_model_selector_css_has_a_narrow_screen_contract(self) -> None:
        css = (ROOT / "codex_image/webui/static/styles/60-prompt.css").read_text(encoding="utf-8")
        self.assertIn(".generation-model-field", css)
        self.assertIn("@media (max-width: 1100px)", css)
        self.assertRegex(
            css,
            r"@media \(max-width: 1100px\)\s*\{[\s\S]*?\.prompt-template-row\s*\{[^}]*grid-template-areas:\s*\"utilities utilities\"\s*\"model template\"",
        )
        self.assertIn("@media (max-width: 760px)", css)
        self.assertRegex(css, r"\.prompt-template-row\s*\{[^}]*grid-template-columns:\s*1fr")

    def test_long_model_names_use_a_compact_selector_without_squeezing_the_editor(self) -> None:
        source = (ROOT / "codex_image/webui/frontend/src/generation-model.ts").read_text(encoding="utf-8")
        prompt_css = (ROOT / "codex_image/webui/static/styles/60-prompt.css").read_text(encoding="utf-8")
        responsive_css = (ROOT / "codex_image/webui/static/styles/80-utilities-responsive.css").read_text(encoding="utf-8")
        self.assertIn("function compactModelDisplayName", source)
        self.assertIn("option.title = fullLabel", source)
        self.assertRegex(prompt_css, r"\.generation-model-select\s*\{[^}]*max-width:\s*240px")
        self.assertRegex(prompt_css, r"\.generation-model-select\s*\{[^}]*text-overflow:\s*ellipsis")
        self.assertRegex(
            responsive_css,
            r"\.controls-col \.prompt-compose\s*\{[^}]*min-height:\s*96px",
        )


if __name__ == "__main__":
    unittest.main()

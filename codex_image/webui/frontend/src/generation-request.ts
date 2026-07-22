import { canonicalControlValues } from "./model-parameter-drafts";
import { activeParameterValuesFor } from "./model-parameters";
import { selectedProviderBinding } from "./provider-selection";
import { getLegacyBridge } from "./state";
import { usesLegacyWorkspaceControls } from "./workspace-model-compatibility";

export interface CanonicalGenerationSelection {
  canonicalModelId: string;
  providerId: string;
  bindingId: string;
  parameters: Record<string, unknown>;
}

type LegacyTaskParameters = Record<string, unknown>;

const RESOLUTION_SIZES: Record<string, string> = {
  "512": "512x512",
  "1K": "1024x1024",
  "2K": "2048x2048",
  "4K": "4096x4096",
};

function sortedRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(values).sort().map((key) => [key, values[key]]));
}

export function currentGenerationSelection(): CanonicalGenerationSelection {
  const { state, methods } = getLegacyBridge();
  const model = state.generationCatalog?.models.find((item) => item.id === state.selectedModelId);
  if (!model || !state.selectedProviderId) {
    return { canonicalModelId: "", providerId: "", bindingId: "", parameters: {} };
  }
  let draft = state.parameterDraftsByModel[model.id] || {};
  if (usesLegacyWorkspaceControls(model.id, model.family_id) && typeof methods.currentTaskParams === "function") {
    draft = {
      ...draft,
      ...canonicalControlValues(methods.currentTaskParams(), selectedProviderBinding()?.protocol_profile || ""),
    };
    state.parameterDraftsByModel[model.id] = draft;
  }
  return {
    canonicalModelId: model.id,
    providerId: state.selectedProviderId,
    bindingId: selectedProviderBinding()?.id || "",
    parameters: activeParameterValuesFor(model, state.mode, draft),
  };
}

export function appendCanonicalGenerationFields(
  form: FormData,
  selection: CanonicalGenerationSelection,
): void {
  form.append("canonical_model_id", selection.canonicalModelId);
  form.append("provider_id", selection.providerId);
  form.append("binding_id", selection.bindingId);
  form.append("parameters_json", JSON.stringify(sortedRecord(selection.parameters)));
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function serverCompatibleGenerationFields(
  selection: CanonicalGenerationSelection,
  legacy: LegacyTaskParameters,
): Record<string, string> {
  const parameters = selection.parameters;
  const resolution = String(firstDefined(parameters["canvas.resolution"], legacy.resolution, "1K"));
  const outputFormat = String(firstDefined(parameters["output.format"], legacy.output_format, "png"));
  const fields: Record<string, unknown> = {
    api_provider_id: selection.providerId,
    generation_model_id: selection.bindingId,
    size: firstDefined(parameters["canvas.size"], RESOLUTION_SIZES[resolution], legacy.size, "1024x1024"),
    resolution: resolution === "1K" ? "standard" : resolution.toLowerCase(),
    ratio: firstDefined(parameters["canvas.aspect_ratio"], legacy.ratio, "1:1"),
    n: firstDefined(parameters["output.count"], legacy.n, 1),
    quality: firstDefined(parameters["gpt.quality"], legacy.quality, "auto"),
    background: firstDefined(parameters["gpt.background"], legacy.background, "auto"),
    output_format: outputFormat,
    moderation: firstDefined(parameters["gpt.moderation"], legacy.moderation, "auto"),
    web_search: firstDefined(parameters["gemini.google_search"], parameters["gpt.web_search"], legacy.web_search, false),
    prompt_optimization_mode: firstDefined(parameters["legacy.prompt_optimization_mode"], legacy.prompt_optimization_mode, "off"),
    seed_mode: firstDefined(parameters["legacy.seed_mode"], legacy.seed_mode, "random"),
  };
  if (fields.seed_mode === "fixed") {
    fields.seed = firstDefined(parameters["legacy.seed"], legacy.seed);
  }
  if (outputFormat !== "png") {
    fields.output_compression = firstDefined(parameters["gpt.output_compression"], legacy.output_compression, 80);
  }
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));
}

export function appendServerCompatibleGenerationFields(
  form: FormData,
  selection: CanonicalGenerationSelection,
  legacy: LegacyTaskParameters,
): void {
  Object.entries(serverCompatibleGenerationFields(selection, legacy)).forEach(([key, value]) => {
    form.append(key, value);
  });
}

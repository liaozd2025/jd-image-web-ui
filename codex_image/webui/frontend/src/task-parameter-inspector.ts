import { formatTranslation, translate } from "./i18n";
import { migrateParameterValues, renderParameterDefinitionsInto, renderCurrentModelParameters } from "./model-parameters";
import { selectConcreteModel } from "./model-selection";
import { eligibleProviders, selectGenerationProvider } from "./provider-selection";
import { getLegacyBridge } from "./state";
import { taskCanonicalModelId } from "./task-model-summary";
import type { CatalogModel, GenerationCatalog, GenerationSnapshotView, ParameterMigrationReport, WebUITask } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function integer(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function firstDefined(source: Record<string, unknown>, ...keys: string[]): unknown {
  return keys
    .map((key) => source[key])
    .find((value) => value !== undefined && value !== null);
}

function legacyRuntimeRequestedParameters(
  task: WebUITask,
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const params = record(task.params);
  const request = record(task.request);
  const actual = record(snapshot.actual_parameters);
  const source = { ...request, ...params, ...actual };
  const canonical = {
    ...record(request.parameters),
    ...record(request.canonical_parameters),
    ...record(params.canonical_parameters),
    ...record(actual.canonical_parameters),
  };
  const aliases = new Map<string, string[]>([
    ["canvas.size", ["canvas.size", "size"]],
    ["canvas.aspect_ratio", ["canvas.aspect_ratio", "ratio"]],
    ["canvas.resolution", ["canvas.resolution", "resolution"]],
    ["output.count", ["output.count", "n"]],
    ["output.format", ["output.format", "output_format"]],
    ["gpt.quality", ["gpt.quality", "quality"]],
    ["gpt.background", ["gpt.background", "background"]],
    ["gpt.moderation", ["gpt.moderation", "moderation"]],
    ["gpt.output_compression", ["gpt.output_compression", "output_compression"]],
    ["gpt.web_search", ["gpt.web_search", "web_search"]],
    ["gemini.google_search", ["gemini.google_search"]],
    ["legacy.prompt_fidelity", ["legacy.prompt_fidelity", "prompt_fidelity"]],
    ["legacy.prompt_optimization_mode", ["legacy.prompt_optimization_mode", "prompt_optimization_mode"]],
    ["legacy.seed_mode", ["legacy.seed_mode", "seed_mode"]],
    ["legacy.seed", ["legacy.seed", "seed"]],
  ]);
  aliases.forEach((keys, id) => {
    if (canonical[id] !== undefined && canonical[id] !== null) return;
    const value = firstDefined(source, ...keys);
    if (value !== undefined) canonical[id] = value;
  });
  return canonical;
}

export function notifyParameterMigration(report: ParameterMigrationReport): void {
  const count = report.defaulted.length + report.dropped.length;
  if (!count) return;
  getLegacyBridge().methods.showTransientNotice?.(
    formatTranslation("modelParameters.migrated", { count }),
  );
}

function snapshotFromTask(task: WebUITask): GenerationSnapshotView {
  const raw = record(task.generation_snapshot);
  if (!Object.keys(raw).length) return legacyGenerationSnapshot(task);
  const params = record(task.params);
  const request = record(task.request);
  const frozenParameters = record(raw.requested_parameters);
  const providerId = String(
    raw.provider_id
    || params.api_provider_id
    || request.webui_api_provider_id
    || request.api_provider_id
    || raw.provider_version_id
    || raw.provider_key
    || "codex",
  );
  return {
    schema_version: integer(raw.schema_version, 1),
    family_id: String(raw.family_id || raw.model_family_id || "gpt-image"),
    canonical_model_id: String(raw.canonical_model_id || "gpt-image-2"),
    model_manifest_version: integer(raw.model_manifest_version || raw.capability_profile_version, 1),
    provider_id: providerId,
    provider_name: String(
      raw.provider_name
      || task.api_provider_name
      || params.api_provider_name
      || request.webui_api_provider_name
      || request.api_provider_name
      || raw.provider_key
      || (providerId === "codex" ? "Codex" : providerId),
    ),
    binding_id: String(raw.binding_id || "legacy"),
    remote_model_id: String(raw.remote_model_id || raw.canonical_model_id || "gpt-image-2"),
    protocol_profile: String(raw.protocol_profile || "codex_images"),
    parameter_codec: String(raw.parameter_codec || "gpt_codex_images"),
    requested_parameters: Object.keys(frozenParameters).length
      ? frozenParameters
      : legacyRuntimeRequestedParameters(task, raw),
    mapped_request: record(raw.mapped_request),
    legacy: false,
  };
}

export function catalogModelForGenerationSnapshot(
  snapshot: GenerationSnapshotView,
  catalog: GenerationCatalog | null | undefined,
): CatalogModel | undefined {
  if (!catalog) return undefined;
  const aliases = new Set([
    String(snapshot.canonical_model_id || "").trim(),
    String(snapshot.remote_model_id || "").trim(),
  ].filter(Boolean));
  const direct = catalog.models.find((model) => (
    aliases.has(model.id) || aliases.has(model.official_model_id)
  ));
  if (direct) return direct;
  const binding = catalog.providers
    .flatMap((provider) => provider.bindings || [])
    .find((item) => aliases.has(String(item.remote_model_id || "").trim()));
  return binding
    ? catalog.models.find((model) => model.id === binding.canonical_model_id)
    : undefined;
}

export function inspectTaskParameters(task: WebUITask): void {
  const { state, methods } = getLegacyBridge();
  state.inspectedGenerationSnapshot = snapshotFromTask(task);
  methods.renderTaskParameterInspector?.();
}

export function clearTaskParameterInspection(): void {
  const { state, methods } = getLegacyBridge();
  state.inspectedGenerationSnapshot = null;
  methods.renderTaskParameterInspector?.();
  renderCurrentModelParameters();
}

export function legacyGenerationSnapshot(task: WebUITask): GenerationSnapshotView {
  const params = record(task.params);
  const request = record(task.request);
  const requestedParameters: Record<string, unknown> = {
    "canvas.size": String(params.size || request.size || "1024x1024"),
    "gpt.quality": String(params.quality || request.quality || "auto"),
    "output.format": String(params.output_format || request.output_format || "png"),
    "gpt.moderation": String(params.moderation || request.moderation || "auto"),
    "output.count": Math.max(1, Math.min(4, Number(params.n || request.n || 1))),
  };
  const hasParamsBackground = Object.prototype.hasOwnProperty.call(params, "background");
  const hasRequestBackground = Object.prototype.hasOwnProperty.call(request, "background");
  const background = hasParamsBackground ? params.background : request.background;
  if ((hasParamsBackground || hasRequestBackground)
      && background !== null && background !== undefined && String(background).trim()) {
    requestedParameters["gpt.background"] = String(background);
  }
  if (requestedParameters["output.format"] !== "png" && params.output_compression !== undefined) {
    requestedParameters["gpt.output_compression"] = Number(params.output_compression);
  }
  if (params.web_search) requestedParameters["gpt.web_search"] = true;
  const responses = params.api_mode === "responses" || params.codex_mode === "responses"
    || request.api_mode === "responses" || request.codex_mode === "responses";
  const providerId = String(params.api_provider_id || request.api_provider_id || "codex");
  return {
    schema_version: 1,
    family_id: "gpt-image",
    canonical_model_id: "gpt-image-2",
    model_manifest_version: 1,
    provider_id: providerId,
    provider_name: String(params.api_provider_name || request.api_provider_name || (providerId === "codex" ? "Codex" : providerId)),
    binding_id: "legacy-gpt-image-2",
    remote_model_id: String(params.model || request.image_model || request.model || "gpt-image-2"),
    protocol_profile: `${providerId === "codex" ? "codex" : "openai"}_${responses ? "responses" : "images"}`,
    parameter_codec: `gpt_${providerId === "codex" ? "codex" : "openai"}_${responses ? "responses" : "images"}`,
    requested_parameters: requestedParameters,
    mapped_request: request,
    legacy: true,
  };
}

export function taskParameterInspectorTitle(
  snapshot: GenerationSnapshotView,
  catalog?: GenerationCatalog | null,
): string {
  const historyLabel = translate("modelParameters.historyConfiguration");
  const modelName = catalogModelForGenerationSnapshot(snapshot, catalog)?.display_name
    || snapshot.canonical_model_id;
  const providerName = catalog?.providers.find((provider) => provider.id === snapshot.provider_id)?.name
    || snapshot.provider_name;
  return [historyLabel, modelName, providerName].filter(Boolean).join(" · ");
}

const TASK_PARAMETER_INSPECTOR_HIDDEN_IDS = new Set([
  "gpt.background",
  "gpt.output_compression",
]);
const GPT_TASK_PARAMETER_INSPECTOR_ORDER = new Map([
  "canvas.size",
  "gpt.quality",
  "output.format",
  "output.count",
  "gpt.moderation",
  "gpt.web_search",
].map((id, index) => [id, index]));
const TASK_PARAMETER_FALLBACK_LABEL_KEYS = new Map([
  ["canvas.size", "output.size"],
  ["canvas.aspect_ratio", "canvas.aspectRatio"],
  ["canvas.resolution", "canvas.resolution"],
  ["output.count", "output.quantity"],
  ["output.format", "output.format"],
  ["gpt.quality", "output.quality"],
  ["gpt.background", "output.background"],
  ["gpt.moderation", "output.moderation"],
  ["gpt.output_compression", "output.compression"],
  ["gpt.web_search", "output.webSearch"],
  ["gemini.google_search", "gemini.googleSearch"],
  ["legacy.prompt_fidelity", "output.promptMode"],
  ["legacy.prompt_optimization_mode", "generationModel.promptOptimization"],
  ["legacy.seed_mode", "generationModel.seed"],
  ["legacy.seed", "generationModel.seed"],
]);

function taskParameterVisibleInInspector(snapshot: GenerationSnapshotView, parameterId: string): boolean {
  if (TASK_PARAMETER_INSPECTOR_HIDDEN_IDS.has(parameterId)) return false;
  if (parameterId === "gpt.web_search" && !snapshot.protocol_profile.endsWith("_responses")) return false;
  return true;
}

export function taskParameterInspectorModel(
  snapshot: GenerationSnapshotView,
  model: CatalogModel | undefined,
): CatalogModel | undefined {
  if (!model) return undefined;
  const gptImage = snapshot.canonical_model_id === "gpt-image-2";
  const parameters = model.parameters
    .filter((definition) => taskParameterVisibleInInspector(snapshot, definition.id))
    .map((definition) => {
      if (gptImage && definition.id === "gpt.moderation") {
        return { ...definition, group: "generation" as const };
      }
      if (definition.id !== "output.count" || definition.control === "segmented") return definition;
      const minimum = definition.minimum ?? 1;
      const maximum = definition.maximum ?? 4;
      return {
        ...definition,
        control: "segmented" as const,
        allowed_values: Array.from(
          { length: Math.max(0, maximum - minimum + 1) },
          (_item, index) => minimum + index,
        ),
      };
    });
  if (gptImage) {
    parameters.sort((left, right) => (
      (GPT_TASK_PARAMETER_INSPECTOR_ORDER.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (GPT_TASK_PARAMETER_INSPECTOR_ORDER.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  }
  return {
    ...model,
    parameters,
  };
}

export function taskParameterInspectorParameters(
  snapshot: GenerationSnapshotView,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(snapshot.requested_parameters)
      .filter(([id]) => taskParameterVisibleInInspector(snapshot, id)),
  );
}

export function taskParameterInspectionMatchesSelectedModel(
  snapshot: GenerationSnapshotView | null | undefined,
  selectedModelId: string,
): boolean {
  return Boolean(snapshot && snapshot.canonical_model_id === selectedModelId);
}

export type TaskParameterInspectionAction = "preserve" | "inspect" | "clear";

export function taskParameterInspectionAction(
  _task: WebUITask | null | undefined,
  _selectedModelId: string,
  outputSettingsLocked: boolean,
): TaskParameterInspectionAction {
  if (outputSettingsLocked) return "preserve";
  return "clear";
}

export function reconcileTaskParameterInspection(): void {
  const { state, methods } = getLegacyBridge();
  const task = state.tasks.find((item) => String(item.task_id) === String(state.selectedTaskId));
  const action = taskParameterInspectionAction(
    task,
    String(state.selectedModelId || ""),
    Boolean(methods.isOutputSettingsLocked?.()),
  );
  if (action === "inspect" && task) inspectTaskParameters(task);
  else if (action === "clear" && state.inspectedGenerationSnapshot) clearTaskParameterInspection();
}

export function renderTaskParameterInspector(): void {
  const { state, els } = getLegacyBridge();
  const snapshot = state.inspectedGenerationSnapshot;
  const inspector = els.taskParameterInspector as HTMLElement | null;
  const stage = els.outputSettingsStage as HTMLElement | null;
  if (!inspector) return;
  inspector.classList.toggle("hidden", !snapshot);
  inspector.setAttribute("aria-hidden", snapshot ? "false" : "true");
  stage?.classList.toggle("is-inspecting-task", Boolean(snapshot));
  if (!snapshot) {
    els.taskParameterInspectorHeader?.replaceChildren();
    els.taskParameterInspectorGrid?.replaceChildren();
    els.taskParameterInspectorUnknown?.replaceChildren();
    return;
  }
  const title = document.createElement("strong");
  title.textContent = taskParameterInspectorTitle(snapshot, state.generationCatalog);
  const badge = document.createElement("span");
  badge.className = "task-parameter-history-badge";
  badge.textContent = snapshot.legacy ? translate("modelParameters.legacyTask") : translate("modelParameters.historyConfiguration");
  const adopt = document.createElement("button");
  adopt.type = "button";
  adopt.className = "ghost-button text-sm task-parameter-adopt";
  adopt.textContent = translate("output.lock.adoptTask");
  adopt.addEventListener("click", () => {
    const task = state.tasks.find((item) => String(item.task_id) === String(state.selectedTaskId));
    if (task) adoptTaskParameters(task);
  });
  els.taskParameterInspectorHeader?.replaceChildren(title, badge, adopt);
  const model = catalogModelForGenerationSnapshot(snapshot, state.generationCatalog);
  const inspectorModel = taskParameterInspectorModel(snapshot, model);
  const inspectorParameters = taskParameterInspectorParameters(snapshot);
  if (inspectorModel && els.taskParameterInspectorGrid) {
    renderParameterDefinitionsInto(
      els.taskParameterInspectorGrid,
      inspectorModel,
      inspectorParameters,
      { readOnly: true, operation: "generate" },
    );
  } else {
    els.taskParameterInspectorGrid?.replaceChildren();
  }
  const known = new Set(inspectorModel?.parameters.map((definition) => definition.id) || []);
  const unknown = Object.entries(inspectorParameters).filter(([id]) => !known.has(id));
  const list = els.taskParameterInspectorUnknown as HTMLElement | null;
  list?.replaceChildren();
  unknown.forEach(([id, value]) => {
    const term = document.createElement("dt");
    const labelKey = TASK_PARAMETER_FALLBACK_LABEL_KEYS.get(id);
    term.textContent = labelKey ? translate(labelKey) : id;
    const description = document.createElement("dd");
    description.textContent = typeof value === "string" ? value : JSON.stringify(value);
    list?.append(term, description);
  });
  list?.classList.toggle("hidden", unknown.length === 0);
}

export function adoptTaskParameters(task: WebUITask): ParameterMigrationReport {
  const { state, methods } = getLegacyBridge();
  const snapshot = snapshotFromTask(task);
  const model = catalogModelForGenerationSnapshot(snapshot, state.generationCatalog);
  if (!model) {
    return {
      values: {},
      defaulted: [],
      dropped: Object.entries(snapshot.requested_parameters).map(([id, previous]) => ({ id, previous })),
    };
  }
  const report = migrateParameterValues(model, snapshot.requested_parameters);
  methods.setMode?.(task.mode === "edit" && model.operations.includes("edit") ? "edit" : "generate");
  selectConcreteModel(model.id);
  state.parameterDraftsByModel[model.id] = report.values;
  state.parameterDraftVersionsByModel[model.id] = model.version;
  const providers = eligibleProviders(state.generationCatalog!, model.id, state.mode);
  if (providers.some((provider) => provider.id === snapshot.provider_id)) {
    selectGenerationProvider(snapshot.provider_id);
  }
  methods.persistModelSelection?.();
  state.inspectedGenerationSnapshot = null;
  renderTaskParameterInspector();
  renderCurrentModelParameters();
  notifyParameterMigration(report);
  return report;
}

export function initTaskParameterInspectorFeature(): void {
  Object.assign(getLegacyBridge().methods, {
    adoptTaskParameters,
    clearTaskParameterInspection,
    inspectTaskParameters,
    legacyGenerationSnapshot,
    reconcileTaskParameterInspection,
    renderTaskParameterInspector,
  });
}

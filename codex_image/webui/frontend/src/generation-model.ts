import { activeApiProvider } from "./api-provider-settings";
import { getCsrfToken } from "./server-account";
import { getLegacyBridge } from "./state";
import { LOCALE_CHANGE_EVENT, translate } from "./i18n";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;
const profiles = new Map<string, any>();
let preferenceTimer: number | null = null;
let generationModelFeatureInitialized = false;

function availableModels(): any[] {
  const provider = state.apiSettings?.providers?.find(
    (item: any) => item.id === state.selectedProviderId,
  ) || activeApiProvider();
  return (Array.isArray(provider?.models) ? provider.models : []).filter(
    (model: any) => model?.is_enabled !== false,
  );
}

export function currentGenerationModel(): any | null {
  const selectedId = String(
    els.generationModelSelect?.value || state.selectedProviderBindingId || "",
  );
  return availableModels().find((model: any) => model.generation_model_id === selectedId) || null;
}

export function currentGenerationProfile(): any | null {
  const model = currentGenerationModel();
  return model ? profiles.get(model.capability_profile_id) || null : null;
}

function modelParameterPreference(modelId: string): any {
  const entries = state.apiSettings?.model_preferences?.parameters;
  return Array.isArray(entries)
    ? entries.find((item: any) => item?.generation_model_id === modelId)?.parameters || {}
    : {};
}

function currentSize(): string {
  return els.size?.value === "custom"
    ? `${els.customWidth?.value || ""}x${els.customHeight?.value || ""}`
    : String(els.size?.value || "");
}

function currentImageReferenceCount(): number {
  return Array.isArray(state.images)
    ? state.images.filter((item: any) => item?.kind !== "file").length
    : 0;
}

function currentCatalogModel(): any | null {
  return state.generationCatalog?.models.find((model: any) => model.id === state.selectedModelId) || null;
}

function currentReferenceImageLimit(): number {
  const catalogLimit = currentCatalogModel()?.input_constraints?.max_images;
  if (Number.isInteger(catalogLimit) && catalogLimit >= 0) return Number(catalogLimit);
  return Number(currentGenerationProfile()?.max_reference_images ?? Number.MAX_SAFE_INTEGER);
}

function decorateGenerationModelReferenceThumb(wrapper: HTMLElement, index: number): void {
  const maximumReferences = currentReferenceImageLimit();
  const exceedsLimit = index >= maximumReferences;
  wrapper.classList.toggle("generation-model-reference-over-limit", exceedsLimit);
  wrapper.querySelector(".generation-model-reference-limit-badge")?.remove();
  if (!exceedsLimit) return;
  const badge = document.createElement("span");
  badge.className = "generation-model-reference-limit-badge";
  badge.textContent = translate("generationModel.referenceOverLimit");
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-label", translate("generationModel.referenceOverLimitDetail"));
  wrapper.append(badge);
}

function updateGenerationModelReferenceLimits(): void {
  const wrappers = els.imageThumbItems?.querySelectorAll(".thumb") as NodeListOf<HTMLElement> | undefined;
  wrappers?.forEach((wrapper, index) => {
    decorateGenerationModelReferenceThumb(wrapper, index);
  });
}

function sizeSupported(profile: any, size: string): boolean {
  if (!profile || !size) return false;
  if ((profile.sizes || []).includes(size)) return true;
  if (!profile.custom_size) return false;
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const constraints = profile.size_constraints || {};
  const aspect = height ? width / height : 0;
  return width >= Number(constraints.min_dimension || 1)
    && height >= Number(constraints.min_dimension || 1)
    && width <= Number(constraints.max_dimension || Number.MAX_SAFE_INTEGER)
    && height <= Number(constraints.max_dimension || Number.MAX_SAFE_INTEGER)
    && aspect >= Number(constraints.min_aspect_ratio || 0)
    && aspect <= Number(constraints.max_aspect_ratio || Number.MAX_SAFE_INTEGER);
}

function profileSummary(profile: any): string {
  return profile?.summary_key ? translate(String(profile.summary_key)) : String(profile?.summary || "");
}

function compactModelDisplayName(value: unknown, maximumLength = 24): string {
  const characters = Array.from(String(value || "").trim());
  if (characters.length <= maximumLength) return characters.join("");
  const tailLength = 6;
  const headLength = Math.max(1, maximumLength - tailLength - 1);
  return `${characters.slice(0, headLength).join("")}…${characters.slice(-tailLength).join("")}`;
}

export function generationModelConstraintMessage(): string {
  const catalogModel = currentCatalogModel();
  if (catalogModel) {
    if (!(catalogModel.operations || []).includes(state.mode || "generate")) {
      return translate("generationModel.modeUnsupported");
    }
    const maximumReferences = currentReferenceImageLimit();
    if (currentImageReferenceCount() > maximumReferences) {
      return translate("generationModel.tooManyReferences").replace("{count}", String(maximumReferences));
    }
    return "";
  }
  const model = currentGenerationModel();
  if (!model) return translate("generationModel.none");
  const profile = currentGenerationProfile();
  if (!profile) return translate("generationModel.profileUnavailable");
  if (!(profile.task_modes || []).includes(state.mode || "generate")) {
    return translate("generationModel.modeUnsupported");
  }
  const maximumReferences = Number(profile.max_reference_images || 0);
  if (currentImageReferenceCount() > maximumReferences) {
    return translate("generationModel.tooManyReferences").replace("{count}", String(maximumReferences));
  }
  if (!sizeSupported(profile, currentSize())) return translate("generationModel.sizeUnsupported");
  if (!(profile.output_formats || []).includes(String(els.outputFormat?.value || ""))) {
    return translate("generationModel.formatUnsupported");
  }
  if (els.seedMode?.value === "fixed") {
    const seedProfile = profile.seed || {};
    const seed = Number(els.seedValue?.value);
    if (
      !seedProfile.supported
      || !Number.isInteger(seed)
      || seed < Number(seedProfile.minimum ?? 0)
      || seed > Number(seedProfile.maximum ?? 2147483647)
    ) {
      return translate("generationModel.seedInvalid");
    }
  }
  return "";
}

function updateCallNotice(): void {
  const count = Math.max(1, Number.parseInt(els.nInput?.value || "1", 10) || 1);
  const provider = activeApiProvider();
  const text = count > 1
    ? translate("generationModel.independentCalls").replace("{count}", String(count))
    : "";
  if (els.generationCallNotice) {
    els.generationCallNotice.textContent = text;
    els.generationCallNotice.classList.toggle("hidden", !text);
    els.generationCallNotice.dataset.providerScope = provider?.provider_scope || "";
  }
}

function setRadioValue(select: HTMLSelectElement | null, group: HTMLElement | null, value: string): void {
  if (!select) return;
  select.value = value;
  group?.querySelectorAll<HTMLElement>("[data-val]").forEach((button) => {
    const active = button.dataset.val === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function applyProfile(profile: any, model: any, restorePreference: boolean): string {
  let parametersAdjusted = false;
  const preference = modelParameterPreference(model.generation_model_id);
  const supportedResolutions = new Set<string>((profile?.sizes || []).map((size: string) => {
    const dimension = Number.parseInt(size.split("x", 1)[0] || "0", 10);
    return dimension >= 4096 ? "4k" : dimension >= 2048 ? "2k" : "standard";
  }));
  (els.resolutionGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
    button.classList.toggle("hidden", !supportedResolutions.has(String(button.dataset.val || "")));
  });
  const supportedRatios = new Set<string>(profile?.aspect_ratios || []);
  if (supportedRatios.size) {
    (els.ratioGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
      button.classList.toggle("hidden", !supportedRatios.has(String(button.dataset.val || "")));
    });
    if (els.ratio && !supportedRatios.has(String(els.ratio.value || ""))) {
      setRadioValue(els.ratio, els.ratioGroup, String(profile.aspect_ratios[0] || "1:1"));
      parametersAdjusted = true;
    }
  } else {
    (els.ratioGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
      button.classList.remove("hidden");
    });
  }
  const minimumOutputCount = Number(profile?.min_output_count || 1);
  const maximumOutputCount = Number(profile?.max_output_count || minimumOutputCount);
  (els.quantityGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
    button.classList.toggle("hidden", Number(button.dataset.val || 1) > maximumOutputCount);
  });
  const currentOutputCount = Math.max(1, Number.parseInt(els.nInput?.value || "1", 10) || 1);
  const preferredOutputCount = Number.parseInt(String(preference.n || ""), 10);
  const outputCount = restorePreference
    ? (preferredOutputCount >= minimumOutputCount && preferredOutputCount <= maximumOutputCount
      ? preferredOutputCount
      : minimumOutputCount)
    : Math.max(minimumOutputCount, Math.min(maximumOutputCount, currentOutputCount));
  if (outputCount !== currentOutputCount) {
    setRadioValue(els.nInput, els.quantityGroup, String(outputCount));
    parametersAdjusted = true;
  }
  const supportedFormats = new Set<string>(profile?.output_formats || []);
  (els.outputFormatGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
    button.classList.toggle("hidden", !supportedFormats.has(String(button.dataset.val || "")));
  });
  const preferredSize = String(preference.size || "");
  const existingSize = currentSize();
  const defaultSize = String(profile?.default_size || profile?.sizes?.[0] || "1024x1024");
  const selectedSize = restorePreference
    ? (sizeSupported(profile, preferredSize) ? preferredSize : defaultSize)
    : (sizeSupported(profile, existingSize) ? existingSize : defaultSize);
  const syncSize = getLegacyBridge().methods.syncSizeControlsFromSize;
  if (typeof syncSize === "function" && selectedSize !== existingSize) {
    syncSize(selectedSize);
    parametersAdjusted = true;
  }
  const preferredFormat = String(preference.output_format || "");
  const existingFormat = String(els.outputFormat?.value || "");
  const defaultFormat = String(profile?.default_output_format || profile?.output_formats?.[0] || "png");
  const format = restorePreference
    ? (supportedFormats.has(preferredFormat) ? preferredFormat : defaultFormat)
    : (supportedFormats.has(existingFormat) ? existingFormat : defaultFormat);
  if (format !== existingFormat) parametersAdjusted = true;
  if (els.outputFormat) {
    els.outputFormat.value = format;
    (els.outputFormatGroup?.querySelectorAll("[data-val]") as NodeListOf<HTMLElement> | undefined)?.forEach((button) => {
      const active = button.dataset.val === format;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  const promptModes = Array.isArray(profile?.prompt_optimization_modes)
    ? profile.prompt_optimization_modes
    : [];
  if (els.promptOptimizationMode) {
    const existing = String(els.promptOptimizationMode.value || "off");
    els.promptOptimizationMode.innerHTML = "";
    [["off", translate("generationModel.promptOptimizationOff")], ...promptModes.map((mode: string) => [mode, mode === "fast" ? translate("generationModel.promptOptimizationFast") : translate("generationModel.promptOptimizationStandard")])]
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        els.promptOptimizationMode.append(option);
      });
    const preferredMode = restorePreference ? String(preference.prompt_optimization_mode || "off") : existing;
    els.promptOptimizationMode.value = ["off", ...promptModes].includes(preferredMode) ? preferredMode : "off";
    if (els.promptOptimizationMode.value !== existing) parametersAdjusted = true;
  }
  els.promptOptimizationField?.classList.toggle("hidden", !promptModes.length);

  const seedProfile = profile?.seed || {};
  const seedSupported = Boolean(seedProfile.supported);
  els.seedField?.classList.toggle("hidden", !seedSupported);
  const existingSeedMode = String(els.seedMode?.value || "random");
  if (seedSupported) {
    const preferredSeedMode = restorePreference
      ? (preference.seed_mode === "fixed" ? "fixed" : "random")
      : (existingSeedMode === "fixed" ? "fixed" : "random");
    setRadioValue(els.seedMode, els.seedModeGroup, preferredSeedMode);
    if (preferredSeedMode !== existingSeedMode) parametersAdjusted = true;
    if (els.seedValue) {
      els.seedValue.min = String(seedProfile.minimum ?? 0);
      els.seedValue.max = String(seedProfile.maximum ?? 2147483647);
      els.seedValue.value = preferredSeedMode === "fixed" && preference.seed !== undefined
        ? String(preference.seed)
        : els.seedValue.value;
      els.seedValue.classList.toggle("hidden", preferredSeedMode !== "fixed");
    }
  } else {
    setRadioValue(els.seedMode, els.seedModeGroup, "random");
    els.seedValue?.classList.add("hidden");
    if (existingSeedMode !== "random") parametersAdjusted = true;
  }
  return parametersAdjusted ? translate("generationModel.parametersAdjusted") : "";
}

function selectionReason(provider: any): string {
  if (provider.model_selection_reason === "saved_unavailable_default") return translate("generationModel.savedUnavailableSelected");
  if (provider.model_selection_reason === "default") return translate("generationModel.defaultSelected");
  if (provider.model_selection_reason === "first_available") return translate("generationModel.firstAvailableSelected");
  return "";
}

export function renderGenerationModelSelector(restorePreference = true): void {
  if (!els.generationModelSelect) {
    const constraint = generationModelConstraintMessage();
    if (els.generationModelNotice) els.generationModelNotice.textContent = constraint;
    const errors = state.selectedModelId
      ? state.parameterValidationErrorsByModel[state.selectedModelId] || {}
      : {};
    if (els.runButton) {
      els.runButton.disabled = !state.authAvailable || Boolean(constraint) || Object.keys(errors).length > 0;
    }
    updateGenerationModelReferenceLimits();
    return;
  }
  const provider = activeApiProvider();
  const models = availableModels();
  const previous = String(els.generationModelSelect.value || "");
  const requested = models.some((model: any) => model.generation_model_id === previous)
    ? previous
    : String(provider?.selected_generation_model_id || "");
  const selected = models.find((model: any) => model.generation_model_id === requested)
    || models.find((model: any) => model.is_default)
    || models[0]
    || null;
  els.generationModelSelect.innerHTML = "";
  if (!models.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = translate("generationModel.none");
    els.generationModelSelect.append(option);
  }
  for (const model of models) {
    const profile = profiles.get(model.capability_profile_id);
    const option = document.createElement("option");
    option.value = model.generation_model_id;
    const summary = profileSummary(profile);
    const suffix = `${summary ? ` — ${summary}` : ""}${model.is_default ? ` (${translate("generationModel.default")})` : ""}`;
    const fullLabel = `${model.display_name}${suffix}`;
    option.textContent = `${compactModelDisplayName(model.display_name)}${suffix}`;
    option.title = fullLabel;
    els.generationModelSelect.append(option);
  }
  els.generationModelSelect.disabled = models.length <= 1;
  els.generationModelSelect.value = selected?.generation_model_id || "";
  let adjustment = "";
  if (selected) {
    const profile = profiles.get(selected.capability_profile_id);
    els.model.value = selected.model_id;
    els.generationModelSummary.textContent = profileSummary(profile);
    if (profile) adjustment = applyProfile(profile, selected, restorePreference);
  } else {
    els.model.value = "";
    els.generationModelSummary.textContent = "";
  }
  const reason = selected ? selectionReason(provider) : "";
  const constraint = generationModelConstraintMessage();
  if (els.generationModelNotice) {
    els.generationModelNotice.textContent = constraint || [reason, adjustment].filter(Boolean).join(" ");
  }
  if (els.runButton) els.runButton.disabled = !state.authAvailable || Boolean(constraint);
  updateCallNotice();
  updateGenerationModelReferenceLimits();
}

function currentPreferenceParameters(): any {
  return {
    size: currentSize(),
    resolution: String(els.resolution?.value || ""),
    ratio: String(els.ratio?.value || ""),
    orientation: String(els.orientation?.value || ""),
    n: Math.max(1, Number.parseInt(els.nInput?.value || "1", 10) || 1),
    output_format: String(els.outputFormat?.value || "png"),
    prompt_optimization_mode: String(els.promptOptimizationMode?.value || "off"),
    seed_mode: String(els.seedMode?.value || "random"),
    ...(els.seedMode?.value === "fixed" && els.seedValue?.value !== ""
      ? { seed: Number.parseInt(els.seedValue.value, 10) }
      : {}),
  };
}

async function persistPreference(): Promise<void> {
  const provider = activeApiProvider();
  const model = currentGenerationModel();
  if (!provider || !model) return;
  const response = await fetch("/api/generation-model-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
    body: JSON.stringify({
      provider_scope: provider.provider_scope,
      provider_version_id: provider.provider_version_id,
      generation_model_id: model.generation_model_id,
      parameters: currentPreferenceParameters(),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || translate("generationModel.preferenceSaveFailed"));
  const storedProvider = state.apiSettings.providers.find((item: any) => item.id === provider.id);
  if (storedProvider) {
    storedProvider.selected_generation_model_id = model.generation_model_id;
    storedProvider.model_selection_reason = "saved";
  }
  state.apiSettings.model_preferences = data.preferences || state.apiSettings.model_preferences;
}

function queuePreferenceSave(): void {
  if (preferenceTimer !== null) window.clearTimeout(preferenceTimer);
  preferenceTimer = window.setTimeout(() => {
    preferenceTimer = null;
    void persistPreference().catch((error: Error) => {
      if (els.generationModelNotice) els.generationModelNotice.textContent = error.message;
    });
  }, 250);
}

function handleModelChange(): void {
  renderGenerationModelSelector(true);
  queuePreferenceSave();
}

function handleParameterChange(): void {
  if (els.seedMode && els.seedValue) {
    els.seedValue.classList.toggle("hidden", els.seedMode.value !== "fixed");
  }
  renderGenerationModelSelector(false);
  queuePreferenceSave();
}

async function loadProfiles(): Promise<void> {
  const response = await fetch("/api/model-capability-profiles");
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || translate("generationModel.profileUnavailable"));
  for (const profile of data.profiles || []) profiles.set(profile.profile_id, profile);
  renderGenerationModelSelector(true);
}

export function currentGenerationModelParams(): any {
  const model = currentGenerationModel();
  const profile = currentGenerationProfile();
  return {
    generation_model_id: model?.generation_model_id || "",
    capability_profile_version: model?.capability_profile_version || profile?.version || 1,
    prompt_optimization_mode: String(els.promptOptimizationMode?.value || "off"),
    seed_mode: String(els.seedMode?.value || "random"),
    seed: els.seedMode?.value === "fixed" ? String(els.seedValue?.value || "") : "",
  };
}

export function initGenerationModelFeature(): void {
  if (generationModelFeatureInitialized) return;
  generationModelFeatureInitialized = true;
  if (els.generationModelSelect) {
    els.generationModelSelect.addEventListener("change", handleModelChange);
    els.promptOptimizationMode?.addEventListener("change", handleParameterChange);
    els.outputFormat?.addEventListener("change", handleParameterChange);
    els.nInput?.addEventListener("change", handleParameterChange);
    els.resolution?.addEventListener("change", handleParameterChange);
    els.ratio?.addEventListener("change", handleParameterChange);
    els.customWidth?.addEventListener("change", handleParameterChange);
    els.customHeight?.addEventListener("change", handleParameterChange);
    els.seedModeGroup?.addEventListener("click", (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-val]");
      if (!button || !els.seedMode) return;
      setRadioValue(els.seedMode, els.seedModeGroup, String(button.dataset.val || "random"));
      handleParameterChange();
    });
    els.seedValue?.addEventListener("change", handleParameterChange);
  }
  document.addEventListener("generation-model-settings-changed", () => renderGenerationModelSelector(true));
  document.addEventListener(LOCALE_CHANGE_EVENT, () => renderGenerationModelSelector(false));
  document.addEventListener("click", (event: Event) => {
    if ((event.target as HTMLElement).closest("[data-mode], #generateModeButton, #editModeButton")) {
      window.setTimeout(() => renderGenerationModelSelector(false), 0);
    }
  });
  Object.assign(getLegacyBridge().methods, {
    currentGenerationModel,
    currentGenerationProfile,
    currentGenerationModelParams,
    generationModelConstraintMessage,
    decorateGenerationModelReferenceThumb,
    updateGenerationModelReferenceLimits,
    renderGenerationModelSelector,
  });
  void loadProfiles().catch((error: Error) => {
    if (els.generationModelNotice) els.generationModelNotice.textContent = error.message;
    if (els.runButton) els.runButton.disabled = true;
  });
}

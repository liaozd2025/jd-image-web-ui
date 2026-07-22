import { getCsrfToken } from "./server-account";
import { activeParameterValuesFor } from "./model-parameters";
import { getLegacyBridge } from "./state";
import type { GenerationOperation } from "./types";

let preferenceTimer: number | null = null;

export async function persistCurrentModelPreference(): Promise<void> {
  const { state } = getLegacyBridge();
  const catalog = state.generationCatalog;
  const model = catalog?.models.find((item) => item.id === state.selectedModelId);
  const provider = catalog?.providers.find((item) => item.id === state.selectedProviderId);
  const binding = provider?.bindings.find((item) => item.id === state.selectedProviderBindingId);
  if (!catalog || !model || !provider || !binding || provider.builtin
      || !provider.provider_scope || !provider.provider_version_id) return;
  const response = await fetch("/api/generation-model-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
    body: JSON.stringify({
      provider_scope: provider.provider_scope,
      provider_version_id: provider.provider_version_id,
      generation_model_id: binding.id,
      parameters: activeParameterValuesFor(
        model,
        state.mode as GenerationOperation,
        state.parameterDraftsByModel[model.id] || {},
      ),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(String(payload?.detail || "model preference save failed"));
  if (payload?.preferences) catalog.preferences = payload.preferences;
}

export function queueCurrentModelPreferenceSave(): void {
  if (preferenceTimer !== null) window.clearTimeout(preferenceTimer);
  preferenceTimer = window.setTimeout(() => {
    preferenceTimer = null;
    void persistCurrentModelPreference().catch(() => {
      // Task submission persists the same preference, so an autosave failure is recoverable.
    });
  }, 200);
}

export function initModelPreferencesFeature(): void {
  Object.assign(getLegacyBridge().methods, {
    persistCurrentModelPreference,
    queueCurrentModelPreferenceSave,
  });
}

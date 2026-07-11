const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_CONCURRENCY = "4";

function advancedSettingsElement(): HTMLDetailsElement | null {
  return document.querySelector<HTMLDetailsElement>("#apiAdvancedSettings");
}

function imageModelInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("#apiImageModel");
}

function concurrencyInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("#apiImagesConcurrency");
}

export function syncApiAdvancedSettingsSummary(): void {
  const modelSummary = document.querySelector<HTMLElement>("#apiAdvancedImageModelSummary");
  const concurrencySummary = document.querySelector<HTMLElement>("#apiAdvancedConcurrencySummary");
  if (modelSummary) {
    modelSummary.textContent = imageModelInput()?.value.trim() || DEFAULT_IMAGE_MODEL;
  }
  if (concurrencySummary) {
    concurrencySummary.textContent = concurrencyInput()?.value.trim() || DEFAULT_CONCURRENCY;
  }
}

export function resetApiAdvancedSettings(): void {
  const details = advancedSettingsElement();
  if (details) details.open = false;
  syncApiAdvancedSettingsSummary();
}

let apiAdvancedSettingsInitialized = false;

export function initApiAdvancedSettingsFeature(): void {
  if (apiAdvancedSettingsInitialized) return;
  apiAdvancedSettingsInitialized = true;
  imageModelInput()?.addEventListener("input", syncApiAdvancedSettingsSummary);
  concurrencyInput()?.addEventListener("input", syncApiAdvancedSettingsSummary);
  syncApiAdvancedSettingsSummary();
}

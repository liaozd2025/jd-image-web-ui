import { getLegacyBridge } from "./state";

const bridge = getLegacyBridge();
const els = bridge.els;

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function currentAuthSource(): string { return legacyMethod("currentAuthSource"); }
function currentApiMode(): string { return legacyMethod("currentApiMode"); }

export function setModeSpecificElementVisibility(element: any, visible: any): void {
  if (!element) return;
  element.setAttribute("aria-hidden", visible ? "false" : "true");
  if (visible) {
    element.classList.remove("hidden");
    element.classList.remove("mode-collapsed");
    return;
  }
  element.classList.add("mode-collapsed");
  element.classList.add("hidden");
}

function applyModeSettingsVisibility(isDirectApi: any): void {
  setModeSpecificElementVisibility(els.modeSpecificSettings, true);
  setModeSpecificElementVisibility(els.mainModelField, !isDirectApi);
  setModeSpecificElementVisibility(els.apiDirectSettingsNotice, isDirectApi);
  setModeSpecificElementVisibility(els.promptFidelityField, true);
}

export function setModeSettingsVariant(isDirectApi: any): void {
  const slot = els.modeSettingsSlot;
  if (slot) {
    slot.style.height = "";
    slot.classList.remove("is-transitioning");
  }
  applyModeSettingsVisibility(isDirectApi);
}

export function updateModeSpecificSettings(authSource: any = currentAuthSource()): void {
  const isDirectApi = authSource === "api" && currentApiMode() !== "responses";
  setModeSettingsVariant(isDirectApi);
}

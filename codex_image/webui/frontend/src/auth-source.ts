import { getLegacyBridge } from "./state";
import { updateModeSpecificSettings } from "./api-mode-settings";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function setStatus(message: any, type?: any): void { legacyMethod("setStatus", message, type); }
function updateRequestPreview(): void { legacyMethod("updateRequestPreview"); }
function refreshAccountQuota(refresh?: any): Promise<void> { return legacyMethod("refreshAccountQuota", refresh); }
function currentApiMode(): string { return legacyMethod("currentApiMode"); }
function currentApiProviderLabel(): string { return legacyMethod("currentApiProviderLabel"); }
function apiModeLabel(mode: any): string { return legacyMethod("apiModeLabel", mode); }
function openApiSettingsModal(): void { legacyMethod("openApiSettingsModal"); }

export async function refreshHealth(): Promise<void> {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    state.authAvailable = Boolean(data.auth_available);
    state.authStatus = data.auth || null;
    renderAuthSource(state.authStatus);
    els.apiStatus.className = `status-dot ${state.authAvailable ? "ok" : "error"}`;
    els.runButton.disabled = !state.authAvailable;
    if (!state.authAvailable) {
      setStatus("没有检测到 Codex 登录态", "error");
    }
    updateRequestPreview();
  } catch (error: any) {
    state.authAvailable = false;
    els.apiStatus.className = "status-dot error";
    els.runButton.disabled = true;
    setStatus(error.message, "error");
  }
}

export async function setAuthSource(source: any): Promise<void> {
  state.pendingAuthSource = source;
  applyAuthSourceSelection(source);
  updateRequestPreview();
  try {
    const response = await fetch("/api/auth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "授权来源切换失败");
    }
    state.pendingAuthSource = null;
    state.authStatus = data;
    state.authAvailable = Boolean(data.auth_available);
    renderAuthSource(data);
    els.apiStatus.className = `status-dot ${state.authAvailable ? "ok" : "error"}`;
    els.runButton.disabled = !state.authAvailable;
    setStatus(authSourceDetailText(data), state.authAvailable ? "ok" : "error");
    await refreshAccountQuota(false);
    updateRequestPreview();
  } catch (error: any) {
    state.pendingAuthSource = null;
    renderAuthSource(state.authStatus);
    updateRequestPreview();
    setStatus(error.message || "授权来源切换失败", "error");
  }
}

export function handleAuthSourceClick(event: any): void {
  const button = event.target.closest?.("[data-auth-source]");
  if (!button) return;
  const source = button.dataset.authSource;
  if (source === "api" && currentAuthSource() === "api") {
    openApiSettingsModal();
    return;
  }
  setAuthSource(source);
}

export function handleAuthSourceDoubleClick(event: any): void {
  const button = event.target.closest?.("[data-auth-source]");
  if (!button || button.dataset.authSource !== "api") return;
  openApiSettingsModal();
}

export function renderAuthSource(auth: any): void {
  const selected = state.pendingAuthSource || auth?.selected_source || "auto";
  applyAuthSourceSelection(selected);
  if (els.authSourceDetail) {
    const text = auth ? authSourceDetailText(auth) : "授权检查中";
    els.authSourceDetail.textContent = text;
    els.authSourceDetail.title = text;
  }
}

export function applyAuthSourceSelection(source: any): void {
  const selected = source || "auto";
  els.authSourceGroup?.querySelectorAll("[data-auth-source]").forEach((button: any) => {
    const active = button.dataset.authSource === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  els.accountQuotaButton?.classList.toggle("reserved-hidden", selected === "api");
  els.accountQuotaButton?.setAttribute("aria-hidden", selected === "api" ? "true" : "false");
  if (selected === "api") {
    els.accountQuotaButton?.setAttribute("aria-expanded", "false");
    els.accountQuotaButton?.setAttribute("tabindex", "-1");
  } else {
    els.accountQuotaButton?.removeAttribute("tabindex");
  }
  els.apiProviderQuick?.classList.add("hidden");
  updateModeSpecificSettings(selected);
}

export function authSourceDetailText(auth: any): string {
  if (!auth) return "授权检查中";
  const selected = sourceLabel(auth.selected_source);
  const effective = sourceLabel(auth.effective_source);
  const cockpitCount = auth.sources?.cockpit?.account_count || 0;
  const effectiveApi = auth.effective_source === "api";
  if (!auth.auth_available) {
    if (auth.selected_source === "api" || effectiveApi) {
      const provider = currentApiProviderLabel();
      return `${selected}${provider ? ` · ${provider}` : ""} 不可用`;
    }
    return `${selected} 不可用`;
  }
  if (auth.selected_source === "auto") {
    if (effectiveApi) {
      const provider = currentApiProviderLabel();
      const mode = apiModeLabel(currentApiMode());
      return `自动 → ${effective}${provider ? ` · ${provider}` : ""} · ${mode}`;
    }
    return `自动 → ${effective}${auth.effective_source === "cockpit" ? ` · ${cockpitCount}个账号` : ""}`;
  }
  if (effectiveApi) {
    const provider = currentApiProviderLabel();
    const mode = apiModeLabel(currentApiMode());
    return `${effective}${provider ? ` · ${provider}` : ""} · ${mode}`;
  }
  return `${effective}${auth.effective_source === "cockpit" ? ` · ${cockpitCount}个账号` : ""}`;
}

export function sourceLabel(source: any): string {
  if (source === "cockpit") return "Cockpit多账号";
  if (source === "codex") return "Codex本机";
  if (source === "api") return "API";
  if (source === "auto") return "自动";
  return "未生效";
}

export function currentAuthSource(): string {
  return state.pendingAuthSource || state.authStatus?.selected_source || "auto";
}

export function isDirectApiMode(authSource: any = currentAuthSource()): boolean {
  return authSource === "api" && currentApiMode() !== "responses";
}

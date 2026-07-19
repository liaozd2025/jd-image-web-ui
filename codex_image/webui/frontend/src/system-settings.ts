import { getLegacyBridge } from "./state";
import { refreshSegmentedIndicators } from "./segmented-indicator";

let systemSettingsFeatureInitialized = false;
let activeTab = "account";
let pendingUrlTab = "";
let dirtyForm: HTMLFormElement | null = null;
let hasLooseDirtyInput = false;

const PERSONAL_TABS = new Set(["account", "language", "api", "notifications", "usage"]);
const ADMIN_TABS = new Set(["users", "catalog", "department", "shared", "scheduler", "content", "audit"]);
const VALID_TABS = new Set([...PERSONAL_TABS, ...ADMIN_TABS]);
const LAST_TAB_KEY = "codex-image-system-settings-tab";

function maybeCall(name: string, ...args: any[]): void {
  const method = getLegacyBridge().methods[name];
  if (typeof method === "function") method(...args);
}

function normalizeTab(tab: unknown): string {
  const value = tab === "storage" ? "notifications" : String(tab || "");
  return VALID_TABS.has(value) ? value : "account";
}

function isAdmin(): boolean {
  return document.documentElement.dataset.userRole === "admin";
}

function allowedTab(tab: unknown): string {
  const value = normalizeTab(tab);
  return ADMIN_TABS.has(value) && !isAdmin() ? "account" : value;
}

function shell(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#systemSettingsModal");
}

function clearGlobalStatus(): void {
  const status = document.querySelector<HTMLElement>("#systemSettingsGlobalStatus");
  if (status) status.textContent = "";
}

function updateSettingsUrl(open: boolean): void {
  const url = new URL(window.location.href);
  if (open) {
    url.searchParams.set("settings", "1");
    url.searchParams.set("settingsTab", activeTab);
    url.searchParams.delete("tab");
  } else {
    url.searchParams.delete("settings");
    url.searchParams.delete("settingsTab");
    url.searchParams.delete("tab");
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function confirmDiscard(): boolean {
  if (!dirtyForm && !hasLooseDirtyInput) return true;
  const confirmed = window.confirm("当前页面有未保存的更改，确定放弃吗？");
  if (confirmed) {
    dirtyForm?.setAttribute("data-dirty", "false");
    dirtyForm = null;
    hasLooseDirtyInput = false;
  }
  return confirmed;
}

export function markSystemSettingsDirty(form?: HTMLFormElement | null): void {
  const target = form || document.querySelector<HTMLFormElement>("[data-sensitive-form]:focus-within");
  if (!target) {
    hasLooseDirtyInput = true;
    return;
  }
  if (dirtyForm && dirtyForm !== target) dirtyForm.dataset.dirty = "false";
  dirtyForm = target;
  target.dataset.dirty = "true";
}

export function clearSystemSettingsDirty(form?: HTMLFormElement | null): void {
  if (form && dirtyForm !== form) return;
  dirtyForm?.setAttribute("data-dirty", "false");
  dirtyForm = null;
  if (!form) hasLooseDirtyInput = false;
}

function applyRoleVisibility(): void {
  const admin = isAdmin();
  document.querySelectorAll<HTMLElement>("#systemSettingsModal [data-admin-only]").forEach((node) => {
    node.classList.toggle("hidden", !admin);
    if (!admin && node.matches("[data-system-settings-panel]")) node.hidden = true;
  });
  if (!admin && ADMIN_TABS.has(activeTab)) setSystemSettingsTab("account", { refresh: false, updateUrl: false });
}

export function setSystemSettingsTab(
  tab: unknown,
  options: { refresh?: boolean; updateUrl?: boolean; skipGuard?: boolean } = {},
): boolean {
  const selected = allowedTab(tab);
  if (!options.skipGuard && selected !== activeTab && !confirmDiscard()) return false;
  activeTab = selected;
  clearGlobalStatus();
  document.querySelectorAll<HTMLElement>("#systemSettingsTabs [data-system-settings-tab]").forEach((button) => {
    const active = button.dataset.systemSettingsTab === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>("#systemSettingsModal [data-system-settings-panel]").forEach((panel) => {
    const active = panel.dataset.systemSettingsPanel === selected;
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
  try { window.localStorage.setItem(LAST_TAB_KEY, selected); } catch { /* storage may be unavailable */ }
  if (options.updateUrl !== false && !shell()?.classList.contains("hidden")) updateSettingsUrl(true);
  if (options.refresh !== false && selected === "api") {
    maybeCall("setApiSettingsFeedback", "", "");
    maybeCall("populateApiSettingsForm");
    maybeCall("updateModeSpecificSettings");
  }
  document.dispatchEvent(new CustomEvent("codex-image-settings-tab-change", { detail: { tab: selected } }));
  refreshSegmentedIndicators();
  document.querySelector<HTMLElement>(`[data-system-settings-panel="${selected}"]`)?.scrollTo({ top: 0 });
  return true;
}

export function openSystemSettingsModal(tab?: unknown): void {
  let requested = tab;
  if (!requested) {
    try { requested = window.localStorage.getItem(LAST_TAB_KEY) || "account"; } catch { requested = "account"; }
  }
  applyRoleVisibility();
  setSystemSettingsTab(requested, { skipGuard: true, updateUrl: false });
  const modal = shell();
  modal?.classList.remove("hidden");
  modal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("system-settings-open");
  updateSettingsUrl(true);
  document.querySelector<HTMLInputElement>("#systemSettingsSearch")?.focus();
}

export function closeSystemSettingsModal(): void {
  if (!confirmDiscard()) return;
  const modal = shell();
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("system-settings-open");
  updateSettingsUrl(false);
}

export function openSystemSettingsFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("settings") !== "1") return;
  pendingUrlTab = normalizeTab(params.get("settingsTab") || params.get("tab") || "account");
  openSystemSettingsModal(pendingUrlTab);
}

function handleSearch(event: Event): void {
  const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase();
  document.querySelectorAll<HTMLElement>("#systemSettingsTabs [data-settings-nav-group]").forEach((group) => {
    let visible = 0;
    group.querySelectorAll<HTMLElement>("[data-settings-search]").forEach((button) => {
      const matches = !query || (button.dataset.settingsSearch || "").toLocaleLowerCase().includes(query)
        || (button.textContent || "").toLocaleLowerCase().includes(query);
      button.classList.toggle("search-hidden", !matches);
      if (matches) visible += 1;
    });
    group.classList.toggle("search-hidden", visible === 0);
  });
}

export function initSystemSettingsFeature(): void {
  if (systemSettingsFeatureInitialized) return;
  systemSettingsFeatureInitialized = true;
  document.querySelector("#systemSettingsTabs")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-system-settings-tab]");
    if (button) setSystemSettingsTab(button.dataset.systemSettingsTab);
  });
  document.querySelector("#systemSettingsSearch")?.addEventListener("input", handleSearch);
  document.querySelector("#systemSettingsModal")?.addEventListener("input", (event) => {
    const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>("form[data-sensitive-form]");
    if (form) markSystemSettingsDirty(form);
  });
  document.querySelector("#serverAccountSettingsButton")?.addEventListener("click", () => openSystemSettingsModal());
  document.addEventListener("codex-image-user-context", () => {
    applyRoleVisibility();
    if (pendingUrlTab && (PERSONAL_TABS.has(pendingUrlTab) || isAdmin())) {
      setSystemSettingsTab(pendingUrlTab, { skipGuard: true });
      pendingUrlTab = "";
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirtyForm && !hasLooseDirtyInput) return;
    event.preventDefault();
    event.returnValue = "";
  });
  Object.assign(getLegacyBridge().methods, {
    setSystemSettingsTab,
    openSystemSettingsModal,
    openSystemSettingsFromUrl,
    closeSystemSettingsModal,
  });
}

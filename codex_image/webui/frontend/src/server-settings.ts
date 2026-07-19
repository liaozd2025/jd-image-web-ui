import { clearSystemSettingsDirty, closeSystemSettingsModal, markSystemSettingsDirty, setSystemSettingsTab } from "./system-settings";
import { getCsrfToken } from "./server-account";
import { formatTranslation, LOCALE_CHANGE_EVENT, translate } from "./i18n";
import { getLegacyBridge } from "./state";

type ApiResponse = Record<string, any>;

interface ManagedUser {
  user_id: string;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
}

interface BrowserSession {
  session_id: string;
  user_agent: string;
  current: boolean;
  last_seen_at: string;
  expires_at: string;
}

interface ProviderVersion {
  provider_version_id: string;
  provider_key: string;
  display_name: string;
  version_number: number;
  base_url: string;
  api_mode: string;
  models: Array<{ model_id: string }>;
  is_active: boolean;
}

interface DepartmentCredential {
  provider_version_id: string;
  api_key_mask?: string;
  has_credential: boolean;
  is_active: boolean;
}

interface SharedAsset {
  asset_id: string;
  asset_kind: string;
  name: string;
  publisher_user_id: string;
  is_active: boolean;
  created_at?: string;
}

interface SchedulerUser {
  user_id: string;
  queued: number;
  running: number;
}

interface SchedulerBlocked {
  reason: string;
  count: number;
}

interface ContentTask {
  model_id: string;
  status: string;
  created_at: string;
  prompt?: string;
}

interface AuditEvent {
  action: string;
  outcome: string;
  occurred_at: string;
  actor_user_id: string;
  subject_user_id?: string;
}

let initialized = false;
let managedUsers: ManagedUser[] = [];

async function api<T extends ApiResponse = ApiResponse>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) headers.set("X-CSRF-Token", getCsrfToken());
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error(translate("serverSettings.sessionExpired"));
  }
  if (!response.ok) {
    let message = formatTranslation("serverSettings.requestFailed", { status: response.status });
    try {
      const payload = await response.json();
      if (payload?.detail) message = String(payload.detail);
    } catch { /* response is not JSON */ }
    throw new Error(message);
  }
  return await response.json() as T;
}

function textElement(tag: keyof HTMLElementTagNameMap, value: string, className = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function actionButton(
  label: string,
  action: (button: HTMLButtonElement) => Promise<void> | void,
  danger = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost-button text-sm${danger ? " danger-button" : ""}`;
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await action(button); } catch (error) { reportError(error); } finally { button.disabled = false; }
  });
  return button;
}

async function runConfirmedAction(action: () => Promise<void>): Promise<void> {
  try { await action(); } catch (error) { reportError(error); }
}

function listRow(title: string, meta: string, actions?: HTMLElement): HTMLElement {
  const row = document.createElement("article");
  row.className = "settings-list-row";
  const copy = document.createElement("span");
  copy.append(textElement("strong", title), textElement("small", meta));
  row.append(copy);
  if (actions) row.append(actions);
  return row;
}

function actions(): HTMLDivElement {
  const node = document.createElement("div");
  node.className = "settings-row-actions";
  return node;
}

function replace(selector: string, ...nodes: Node[]): void {
  document.querySelector(selector)?.replaceChildren(...nodes);
}

interface DynamicDraft {
  key: string;
  value: string;
  owner: HTMLInputElement;
}

function replacePreservingDynamicDrafts(selector: string, ...nodes: Node[]): void {
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) return;
  const drafts = [...container.querySelectorAll<HTMLInputElement>("input[data-settings-draft-key]")]
    .filter((input) => input.dataset.dirty === "true")
    .map((input) => ({ key: input.dataset.settingsDraftKey || "", value: input.value, owner: input }))
    .filter((draft): draft is DynamicDraft => Boolean(draft.key));
  drafts.forEach((draft) => clearSystemSettingsDirty(draft.owner));
  container.replaceChildren(...nodes);
  const replacements = new Map(
    [...container.querySelectorAll<HTMLInputElement>("input[data-settings-draft-key]")]
      .map((input) => [input.dataset.settingsDraftKey || "", input]),
  );
  drafts.forEach((draft) => {
    const input = replacements.get(draft.key);
    if (!input) return;
    input.value = draft.value;
    markSystemSettingsDirty(input);
  });
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = document.querySelector<HTMLElement>("#systemSettingsGlobalStatus");
  if (status) status.textContent = formatTranslation("serverSettings.error", { message });
}

function fmtDate(value: unknown): string {
  if (!value) return "--";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(document.documentElement.lang || undefined);
}

function fmtBytes(value: unknown): string {
  let bytes = Number(value || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) { bytes /= 1024; index += 1; }
  return `${bytes >= 10 || index === 0 ? bytes.toFixed(0) : bytes.toFixed(1)} ${units[index]}`;
}

function metric(label: string, value: string): HTMLElement {
  const node = document.createElement("article");
  node.className = "settings-metric";
  node.append(textElement("small", label), textElement("strong", value));
  return node;
}

function jsonOptions(body: ApiResponse): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function loadSessions(): Promise<void> {
  const result = await api("/api/auth/sessions");
  const rows = (result.sessions || []).map((session: BrowserSession) => {
    const rowActions = actions();
    if (!session.current) {
      rowActions.append(actionButton(translate("serverSettings.logoutSession"), async () => {
        if (!window.confirm(translate("serverSettings.confirmLogoutSession"))) return;
        await api(`/api/auth/sessions/${encodeURIComponent(session.session_id)}`, { method: "DELETE" });
        await loadSessions();
      }, true));
    }
    return listRow(
      session.current ? formatTranslation("serverSettings.currentDevice", { device: session.user_agent }) : String(session.user_agent),
      formatTranslation("serverSettings.sessionMeta", { lastSeen: fmtDate(session.last_seen_at), expires: fmtDate(session.expires_at) }),
      rowActions.childElementCount ? rowActions : undefined,
    );
  });
  replace("#settingsSessionList", ...rows);
}

async function loadUsage(): Promise<void> {
  const [assetResult, quotaResult] = await Promise.all([
    api("/api/assets/quota"),
    api("/api/quotas/department"),
  ]);
  const storage = assetResult.quota || {};
  const quota = quotaResult.quota || {};
  replace(
    "#settingsUsageSummary",
    metric(translate("serverSettings.personalStorageUsed"), fmtBytes(storage.used_bytes)),
    metric(translate("serverSettings.personalStorageLimit"), fmtBytes(storage.quota_bytes)),
    metric(translate("serverSettings.departmentQuotaAvailable"), String(quota.available_units ?? 0)),
    metric(translate("serverSettings.departmentQuotaUsed"), String(quota.consumed_units ?? 0)),
    metric(translate("serverSettings.departmentQuotaTotal"), String(quota.global_quota_units ?? 0)),
    metric(translate("serverSettings.periodEnds"), fmtDate(quota.period_end)),
  );
}

async function userUsage(userId: string): Promise<ApiResponse | null> {
  try { return await api(`/api/admin/users/${encodeURIComponent(userId)}/usage`); } catch { return null; }
}

async function loadUsers(): Promise<void> {
  const result = await api("/api/admin/users");
  managedUsers = result.users || [];
  const usages = await Promise.all(managedUsers.map((user) => userUsage(user.user_id)));
  const rows = managedUsers.map((user, index) => {
    const rowActions = actions();
    const usage = usages[index]?.usage?.storage;
    if (user.role === "user") {
      const storageInput = document.createElement("input");
      storageInput.className = "control";
      storageInput.type = "number";
      storageInput.min = "1";
      storageInput.dataset.settingsDraftKey = `user-storage:${user.user_id}`;
      storageInput.placeholder = usage ? String(Math.round(Number(usage.quota_bytes) / 1024 / 1024)) : translate("serverSettings.storageMb");
      storageInput.title = translate("serverSettings.personalStorageLimitMb");
      storageInput.addEventListener("input", () => markSystemSettingsDirty(storageInput));
      rowActions.append(storageInput);
      rowActions.append(actionButton(translate("serverSettings.saveStorage"), async () => {
        const quotaMb = Number(storageInput.value);
        if (!Number.isFinite(quotaMb) || quotaMb < 1) throw new Error(translate("serverSettings.invalidStorageQuota"));
        await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/storage-quota`, {
          method: "PATCH", ...jsonOptions({ quota_bytes: Math.round(quotaMb * 1024 * 1024) }),
        });
        clearSystemSettingsDirty(storageInput);
        await loadUsers();
      }));
      rowActions.append(actionButton(translate("serverSettings.resetPassword"), (button) => {
        getLegacyBridge().methods.openConfirmPopover(button, {
          title: translate("serverSettings.resetPasswordConfirmTitle"),
          message: formatTranslation("serverSettings.confirmResetPassword", { username: user.username }),
          confirmText: translate("serverSettings.resetPassword"),
          onConfirm: () => runConfirmedAction(async () => {
            const reset = await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/reset-password`, { method: "POST" });
            showCredential(formatTranslation("serverSettings.temporaryPassword", { username: user.username, password: reset.temporary_password }));
            await loadUsers();
          }),
        });
      }, true));
      rowActions.append(actionButton(translate(user.is_active ? "serverSettings.deactivate" : "serverSettings.reactivate"), (button) => {
        getLegacyBridge().methods.openConfirmPopover(button, {
          title: translate(user.is_active ? "serverSettings.deactivateUserConfirmTitle" : "serverSettings.reactivateUserConfirmTitle"),
          message: formatTranslation(user.is_active ? "serverSettings.confirmDeactivateUser" : "serverSettings.confirmReactivateUser", { username: user.username }),
          confirmText: translate(user.is_active ? "serverSettings.deactivate" : "serverSettings.reactivate"),
          onConfirm: () => runConfirmedAction(async () => {
            await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/status`, {
              method: "PATCH", ...jsonOptions({ is_active: !user.is_active }),
            });
            await loadUsers();
          }),
        });
      }, user.is_active));
    }
    const storageMeta = usage ? formatTranslation("serverSettings.storageMeta", { used: fmtBytes(usage.used_bytes), limit: fmtBytes(usage.quota_bytes) }) : "";
    const role = translate(user.role === "admin" ? "serverAccount.roleAdmin" : "serverAccount.roleUser");
    return listRow(`${user.username} · ${role}`, `${translate(user.is_active ? "serverSettings.active" : "serverSettings.inactive")}${storageMeta}`, rowActions.childElementCount ? rowActions : undefined);
  });
  replacePreservingDynamicDrafts("#settingsUserList", ...rows);
  populateContentUsers();
}

function showCredential(value: string): void {
  const node = document.querySelector<HTMLElement>("#settingsTemporaryCredential");
  if (!node) return;
  node.textContent = value;
  node.classList.remove("hidden");
}

function providerTitle(provider: ProviderVersion): string {
  return `${provider.display_name} · v${provider.version_number}`;
}

function providerModels(provider: ProviderVersion): string {
  return (provider.models || []).map((model) => model.model_id).join("、") || translate("serverSettings.noModels");
}

async function loadCatalog(): Promise<void> {
  const result = await api("/api/admin/provider-catalog");
  const rows = (result.providers || []).map((provider: ProviderVersion) => {
    const rowActions = actions();
    rowActions.append(actionButton(translate(provider.is_active ? "serverSettings.deactivate" : "serverSettings.reactivate"), async () => {
      if (!window.confirm(formatTranslation(provider.is_active ? "serverSettings.confirmDeactivateProvider" : "serverSettings.confirmReactivateProvider", { provider: providerTitle(provider) }))) return;
      await api(`/api/admin/provider-catalog/${encodeURIComponent(provider.provider_version_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !provider.is_active }),
      });
      await loadCatalog();
    }, provider.is_active));
    return listRow(providerTitle(provider), `${provider.provider_key} · ${provider.api_mode} · ${translate(provider.is_active ? "serverSettings.available" : "serverSettings.inactive")} · ${providerModels(provider)}`, rowActions);
  });
  replace("#settingsCatalogList", ...rows);
}

async function loadDepartment(): Promise<void> {
  if (!managedUsers.length) await loadUsers();
  const [catalogResult, configuredResult, quotaResult] = await Promise.all([
    api("/api/admin/provider-catalog"), api("/api/admin/providers/department"), api("/api/quotas/department"),
  ]);
  const quotaInput = document.querySelector<HTMLInputElement>("#settingsDepartmentQuotaForm [name=quota_units]");
  if (quotaInput) quotaInput.value = String(quotaResult.quota?.global_quota_units ?? 0);
  const configured = new Map<string, DepartmentCredential>((configuredResult.providers || []).map((item: DepartmentCredential) => [item.provider_version_id, item]));
  const providerRows = (catalogResult.providers || []).map((provider: ProviderVersion) => {
    const credential = configured.get(provider.provider_version_id);
    const rowActions = actions();
    const key = document.createElement("input");
    key.className = "control";
    key.type = "password";
    key.autocomplete = "new-password";
    key.dataset.settingsDraftKey = `department-credential:${provider.provider_version_id}`;
    key.placeholder = credential?.api_key_mask || translate("serverSettings.departmentApiKeyPlaceholder");
    key.addEventListener("input", () => markSystemSettingsDirty(key));
    rowActions.append(key, actionButton(translate("serverSettings.saveCredential"), async () => {
      if (!key.value) throw new Error(translate("serverSettings.enterApiKey"));
      await api(`/api/admin/providers/department/${encodeURIComponent(provider.provider_version_id)}`, {
        method: "PUT", ...jsonOptions({ api_key: key.value }),
      });
      key.value = "";
      clearSystemSettingsDirty(key);
      await loadDepartment();
    }));
    if (credential?.has_credential) rowActions.append(actionButton(translate(credential.is_active ? "serverSettings.deactivate" : "serverSettings.reactivate"), async () => {
      if (!window.confirm(translate(credential.is_active ? "serverSettings.confirmDeactivateCredential" : "serverSettings.confirmReactivateCredential"))) return;
      await api(`/api/admin/providers/department/${encodeURIComponent(provider.provider_version_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !credential.is_active }),
      });
      await loadDepartment();
    }, credential.is_active));
    return listRow(providerTitle(provider), `${translate(credential?.has_credential ? "serverSettings.configured" : "serverSettings.notConfigured")} · ${translate(provider.is_active ? "serverSettings.catalogAvailable" : "serverSettings.catalogInactive")}`, rowActions);
  });
  replacePreservingDynamicDrafts("#settingsDepartmentProviderList", ...providerRows);

  const ordinaryUsers = managedUsers.filter((user) => user.role === "user");
  const usageResults = await Promise.all(ordinaryUsers.map((user) => userUsage(user.user_id)));
  const quotaRows = ordinaryUsers.map((user, index) => {
    const current = usageResults[index]?.usage?.department_quota;
    const rowActions = actions();
    const input = document.createElement("input");
    input.className = "control";
    input.type = "number";
    input.min = "0";
    input.dataset.settingsDraftKey = `department-user-quota:${user.user_id}`;
    input.value = String(current?.user_quota_units ?? 0);
    input.addEventListener("input", () => markSystemSettingsDirty(input));
    rowActions.append(input, actionButton(translate("systemSettings.saveQuota"), async () => {
      await api(`/api/admin/quotas/department/users/${encodeURIComponent(user.user_id)}`, {
        method: "PATCH", ...jsonOptions({ quota_units: Number(input.value) }),
      });
      clearSystemSettingsDirty(input);
      await loadDepartment();
    }));
    return listRow(user.username, formatTranslation("serverSettings.quotaMeta", { used: current?.consumed_units ?? 0, available: current?.available_units ?? 0 }), rowActions);
  });
  replacePreservingDynamicDrafts("#settingsUserQuotaList", ...quotaRows);
}

async function loadShared(): Promise<void> {
  const [quotaResult, assetResult] = await Promise.all([api("/api/admin/shared-storage-quota"), api("/api/admin/shared-assets")]);
  const quotaInput = document.querySelector<HTMLInputElement>("#settingsSharedQuotaForm [name=quota_mb]");
  if (quotaInput) quotaInput.value = String(Math.max(1, Math.round(Number(quotaResult.quota?.quota_bytes || 0) / 1024 / 1024)));
  const rows = (assetResult.assets || []).map((asset: SharedAsset) => {
    const rowActions = actions();
    if (asset.is_active && ["image", "reference"].includes(asset.asset_kind)) {
      rowActions.append(actionButton(translate("serverSettings.use"), async () => {
        const gallery = await api("/api/gallery");
        const item = (gallery.items || []).find((candidate: ApiResponse) => candidate.id === `shared:${asset.asset_id}`);
        if (!item) throw new Error(translate("serverSettings.sharedImageUnavailable"));
        getLegacyBridge().methods.addGalleryInput(item);
        closeSystemSettingsModal();
      }));
    }
    rowActions.append(actionButton(translate(asset.is_active ? "serverSettings.deactivate" : "serverSettings.reactivate"), async () => {
      if (!window.confirm(formatTranslation(asset.is_active ? "serverSettings.confirmDeactivateAsset" : "serverSettings.confirmReactivateAsset", { asset: asset.name }))) return;
      await api(`/api/shared-assets/${encodeURIComponent(asset.asset_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !asset.is_active }),
      });
      await loadShared();
    }, asset.is_active));
    return listRow(`${asset.name} · ${asset.asset_kind}`, formatTranslation("serverSettings.sharedAssetMeta", { publisher: asset.publisher_user_id, status: translate(asset.is_active ? "serverSettings.available" : "serverSettings.inactive") }), rowActions);
  });
  replace("#settingsSharedAssetList", ...rows);
}

async function loadScheduler(): Promise<void> {
  const result = await api("/api/admin/scheduler");
  const scheduler = result.scheduler || {};
  const form = document.querySelector<HTMLFormElement>("#settingsSchedulerForm");
  const globalInput = form?.elements.namedItem("global_concurrency") as HTMLInputElement | null;
  const userInput = form?.elements.namedItem("per_user_concurrency") as HTMLInputElement | null;
  if (globalInput) globalInput.value = String(scheduler.global_concurrency ?? 1);
  if (userInput) userInput.value = String(scheduler.per_user_concurrency ?? 1);
  const blocked = (scheduler.queue?.blocked || []) as SchedulerBlocked[];
  const blockedCount = blocked.reduce((total, item) => total + Number(item.count || 0), 0);
  replace("#settingsSchedulerSummary", metric(translate("serverSettings.queuedTasks"), String(scheduler.queue?.queued ?? 0)), metric(translate("serverSettings.runningTasks"), String(scheduler.queue?.running ?? 0)), metric(translate("serverSettings.blockedTasks"), String(blockedCount)));
  const blockedRows = blocked.map((item) => listRow(
    translate(`serverSettings.blockedReason.${item.reason}`),
    formatTranslation("serverSettings.blockedCount", { count: item.count }),
  ));
  replace("#settingsSchedulerBlocked", ...(blockedRows.length ? blockedRows : [textElement("p", translate("serverSettings.noBlockedTasks"), "settings-empty-state")]));
  const rows = (scheduler.queue?.users || []).map((user: SchedulerUser) => listRow(String(user.user_id), formatTranslation("serverSettings.schedulerUserMeta", { queued: user.queued, running: user.running })));
  replace("#settingsSchedulerUsers", ...rows);
}

function populateContentUsers(): void {
  const select = document.querySelector<HTMLSelectElement>("#settingsContentUser");
  if (!select) return;
  const previous = select.value;
  select.replaceChildren(...managedUsers.filter((user) => user.role === "user").map((user) => {
    const option = document.createElement("option");
    option.value = user.user_id;
    option.textContent = user.username;
    return option;
  }));
  if (previous && [...select.options].some((option) => option.value === previous)) select.value = previous;
}

async function loadContent(): Promise<void> {
  if (!managedUsers.length) await loadUsers();
  populateContentUsers();
  const select = document.querySelector<HTMLSelectElement>("#settingsContentUser");
  const userId = select?.value;
  if (!userId) return;
  const [tasksResult, assetsResult, usageResult] = await Promise.all([
    api(`/api/admin/users/${encodeURIComponent(userId)}/tasks?limit=100`),
    api(`/api/admin/users/${encodeURIComponent(userId)}/assets?limit=100`),
    api(`/api/admin/users/${encodeURIComponent(userId)}/usage`),
  ]);
  const usage = usageResult.usage || {};
  const taskCount = Object.values(usage.tasks || {}).reduce((sum: number, value) => sum + Number(value || 0), 0);
  replace("#settingsContentSummary", metric(translate("serverSettings.totalTasks"), String(taskCount)), metric(translate("serverSettings.storageUsed"), fmtBytes(usage.storage?.used_bytes)), metric(translate("serverSettings.departmentQuotaUsed"), String(usage.department_quota?.consumed_units ?? 0)));
  replace("#settingsContentTasks", ...(tasksResult.tasks || []).map((task: ContentTask) => listRow(`${task.model_id} · ${task.status}`, `${fmtDate(task.created_at)} · ${task.prompt || ""}`)));
  replace("#settingsContentAssets", ...(assetsResult.assets || []).map((asset: SharedAsset) => listRow(`${asset.name} · ${asset.asset_kind}`, formatTranslation("serverSettings.createdAt", { date: fmtDate(asset.created_at) }))));
}

async function loadAudit(action = ""): Promise<void> {
  const query = action ? `&action=${encodeURIComponent(action)}` : "";
  const result = await api(`/api/admin/audit?limit=100${query}`);
  const rows = (result.events || []).map((event: AuditEvent) => listRow(`${event.action} · ${event.outcome}`, formatTranslation("serverSettings.auditMeta", { date: fmtDate(event.occurred_at), actor: event.actor_user_id, subject: event.subject_user_id ? formatTranslation("serverSettings.auditSubject", { subject: event.subject_user_id }) : "" })));
  replace("#settingsAuditList", ...rows);
}

const TAB_LOADERS: Record<string, () => Promise<void>> = {
  account: loadSessions,
  usage: loadUsage,
  users: loadUsers,
  catalog: loadCatalog,
  department: loadDepartment,
  shared: loadShared,
  scheduler: loadScheduler,
  content: loadContent,
  audit: () => loadAudit(),
};

async function loadTab(tab: string): Promise<void> {
  await TAB_LOADERS[tab]?.();
}

function bindForms(): void {
  document.querySelector<HTMLFormElement>("#settingsPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const status = document.querySelector<HTMLElement>("#settingsPasswordStatus");
    try {
      await api("/api/auth/password", { method: "POST", ...jsonOptions({ current_password: data.get("current_password"), new_password: data.get("new_password") }) });
      form.reset(); clearSystemSettingsDirty(form);
      if (status) status.textContent = translate("serverSettings.passwordUpdated");
      await loadSessions();
    } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : String(error); }
  });
  document.querySelector("#settingsLogoutOtherSessions")?.addEventListener("click", async () => {
    if (!window.confirm(translate("serverSettings.confirmLogoutOthers"))) return;
    try { await api("/api/auth/sessions/logout-others", { method: "POST" }); await loadSessions(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsCreateUserForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    try { const created = await api("/api/admin/users", { method: "POST", ...jsonOptions({ username: data.get("username") }) }); showCredential(formatTranslation("serverSettings.temporaryPassword", { username: created.user.username, password: created.temporary_password })); form.reset(); clearSystemSettingsDirty(form); await loadUsers(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsCatalogForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    const models = String(data.get("models") || "").split(",").map((item) => item.trim()).filter(Boolean).map((model_id) => ({ model_id, capabilities: ["image_generation"] }));
    try { await api("/api/admin/provider-catalog", { method: "POST", ...jsonOptions({ provider_key: data.get("provider_key"), display_name: data.get("display_name"), base_url: data.get("base_url"), api_mode: data.get("api_mode"), models, parameter_constraints: {} }) }); form.reset(); clearSystemSettingsDirty(form); await loadCatalog(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsDepartmentQuotaForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    try { await api("/api/admin/quotas/department", { method: "PATCH", ...jsonOptions({ quota_units: Number(data.get("quota_units")) }) }); clearSystemSettingsDirty(form); await loadDepartment(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsSharedQuotaForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    try { await api("/api/admin/shared-storage-quota", { method: "PATCH", ...jsonOptions({ quota_bytes: Math.round(Number(data.get("quota_mb")) * 1024 * 1024) }) }); clearSystemSettingsDirty(form); await loadShared(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsSchedulerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    try { await api("/api/admin/scheduler", { method: "PATCH", ...jsonOptions({ global_concurrency: Number(data.get("global_concurrency")), per_user_concurrency: Number(data.get("per_user_concurrency")) }) }); clearSystemSettingsDirty(form); await loadScheduler(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsAuditFilter")?.addEventListener("submit", (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); void loadAudit(String(data.get("action") || "")).catch(reportError);
  });
  document.querySelector("#settingsContentUser")?.addEventListener("change", () => void loadContent().catch(reportError));
}

export function initServerSettingsFeature(): void {
  if (initialized) return;
  initialized = true;
  bindForms();
  document.addEventListener("codex-image-user-context", () => void loadSessions().catch(reportError));
  document.addEventListener("codex-image-settings-tab-change", (event) => {
    const tab = (event as CustomEvent<{ tab: string }>).detail.tab;
    void loadTab(tab).catch(reportError);
  });
  document.addEventListener(LOCALE_CHANGE_EVENT, () => {
    const panel = document.querySelector<HTMLElement>("#systemSettingsModal [data-system-settings-panel]:not([hidden])");
    if (panel?.dataset.systemSettingsPanel) void loadTab(panel.dataset.systemSettingsPanel).catch(reportError);
  });
  document.querySelectorAll<HTMLFormElement>("#systemSettingsModal form[data-sensitive-form]").forEach((form) => {
    form.addEventListener("change", () => markSystemSettingsDirty(form));
  });
  document.querySelector("#settingsUserList")?.addEventListener("dblclick", () => setSystemSettingsTab("content"));
}

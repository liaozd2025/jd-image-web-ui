import { clearSystemSettingsDirty, markSystemSettingsDirty, setSystemSettingsTab } from "./system-settings";

type Json = Record<string, any>;

let initialized = false;
let managedUsers: Json[] = [];

function cookieValue(name: string): string {
  const prefix = `${name}=`;
  const match = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

async function api(path: string, options: RequestInit = {}): Promise<Json> {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) headers.set("X-CSRF-Token", cookieValue("jd_image_csrf"));
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("登录已失效");
  }
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const payload = await response.json();
      if (payload?.detail) message = String(payload.detail);
    } catch { /* response is not JSON */ }
    throw new Error(message);
  }
  return await response.json() as Json;
}

function textElement(tag: keyof HTMLElementTagNameMap, value: string, className = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function actionButton(label: string, action: () => Promise<void>, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ghost-button text-sm${danger ? " danger-button" : ""}`;
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await action(); } catch (error) { reportError(error); } finally { button.disabled = false; }
  });
  return button;
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

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = document.querySelector<HTMLElement>("#systemSettingsGlobalStatus");
  if (status) status.textContent = `系统设置：${message}`;
}

function fmtDate(value: unknown): string {
  if (!value) return "--";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
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

function jsonOptions(body: Json): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function loadSessions(): Promise<void> {
  const result = await api("/api/auth/sessions");
  const rows = (result.sessions || []).map((session: Json) => {
    const rowActions = actions();
    if (!session.current) {
      rowActions.append(actionButton("退出会话", async () => {
        if (!window.confirm("确定退出这个登录会话吗？")) return;
        await api(`/api/auth/sessions/${encodeURIComponent(session.session_id)}`, { method: "DELETE" });
        await loadSessions();
      }, true));
    }
    return listRow(
      session.current ? `${session.user_agent}（当前设备）` : String(session.user_agent),
      `最近活动 ${fmtDate(session.last_seen_at)} · 到期 ${fmtDate(session.expires_at)}`,
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
    metric("个人存储已用", fmtBytes(storage.used_bytes)),
    metric("个人存储上限", fmtBytes(storage.quota_bytes)),
    metric("部门额度可用", String(quota.available_units ?? 0)),
    metric("部门额度已用", String(quota.consumed_units ?? 0)),
    metric("部门周期总额", String(quota.global_quota_units ?? 0)),
    metric("周期结束", fmtDate(quota.period_end)),
  );
}

async function userUsage(userId: string): Promise<Json | null> {
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
      storageInput.placeholder = usage ? String(Math.round(Number(usage.quota_bytes) / 1024 / 1024)) : "存储 MB";
      storageInput.title = "个人存储上限（MB）";
      storageInput.addEventListener("input", () => markSystemSettingsDirty());
      rowActions.append(storageInput);
      rowActions.append(actionButton("保存存储", async () => {
        const quotaMb = Number(storageInput.value);
        if (!Number.isFinite(quotaMb) || quotaMb < 1) throw new Error("请输入有效的存储额度");
        await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/storage-quota`, {
          method: "PATCH", ...jsonOptions({ quota_bytes: Math.round(quotaMb * 1024 * 1024) }),
        });
        clearSystemSettingsDirty();
        await loadUsers();
      }));
      rowActions.append(actionButton("重置密码", async () => {
        if (!window.confirm(`确定重置 ${user.username} 的密码吗？`)) return;
        const reset = await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/reset-password`, { method: "POST" });
        showCredential(`${user.username} 的临时密码：${reset.temporary_password}`);
        await loadUsers();
      }, true));
      rowActions.append(actionButton(user.is_active ? "停用" : "恢复", async () => {
        if (!window.confirm(`确定${user.is_active ? "停用" : "恢复"}用户 ${user.username} 吗？`)) return;
        await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/status`, {
          method: "PATCH", ...jsonOptions({ is_active: !user.is_active }),
        });
        await loadUsers();
      }, user.is_active));
    }
    const storageMeta = usage ? ` · 存储 ${fmtBytes(usage.used_bytes)} / ${fmtBytes(usage.quota_bytes)}` : "";
    return listRow(`${user.username} · ${user.role === "admin" ? "系统管理员" : "普通用户"}`, `${user.is_active ? "正常" : "已停用"}${storageMeta}`, rowActions.childElementCount ? rowActions : undefined);
  });
  replace("#settingsUserList", ...rows);
  populateContentUsers();
}

function showCredential(value: string): void {
  const node = document.querySelector<HTMLElement>("#settingsTemporaryCredential");
  if (!node) return;
  node.textContent = value;
  node.classList.remove("hidden");
}

function providerTitle(provider: Json): string {
  return `${provider.display_name} · v${provider.version_number}`;
}

function providerModels(provider: Json): string {
  return (provider.models || []).map((model: Json) => model.model_id).join("、") || "无模型";
}

async function loadCatalog(): Promise<void> {
  const result = await api("/api/admin/provider-catalog");
  const rows = (result.providers || []).map((provider: Json) => {
    const rowActions = actions();
    rowActions.append(actionButton(provider.is_active ? "停用" : "恢复", async () => {
      if (!window.confirm(`确定${provider.is_active ? "停用" : "恢复"} ${providerTitle(provider)} 吗？`)) return;
      await api(`/api/admin/provider-catalog/${encodeURIComponent(provider.provider_version_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !provider.is_active }),
      });
      await loadCatalog();
    }, provider.is_active));
    return listRow(providerTitle(provider), `${provider.provider_key} · ${provider.api_mode} · ${provider.is_active ? "可用" : "已停用"} · ${providerModels(provider)}`, rowActions);
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
  const configured = new Map((configuredResult.providers || []).map((item: Json) => [item.provider_version_id, item]));
  const providerRows = (catalogResult.providers || []).map((provider: Json) => {
    const credential = configured.get(provider.provider_version_id) as Json | undefined;
    const rowActions = actions();
    const key = document.createElement("input");
    key.className = "control";
    key.type = "password";
    key.autocomplete = "new-password";
    key.placeholder = credential?.api_key_mask || "输入部门 API Key";
    key.addEventListener("input", () => markSystemSettingsDirty());
    rowActions.append(key, actionButton("保存凭据", async () => {
      if (!key.value) throw new Error("请输入 API Key");
      await api(`/api/admin/providers/department/${encodeURIComponent(provider.provider_version_id)}`, {
        method: "PUT", ...jsonOptions({ api_key: key.value }),
      });
      key.value = "";
      clearSystemSettingsDirty();
      await loadDepartment();
    }));
    if (credential?.has_credential) rowActions.append(actionButton(credential.is_active ? "停用" : "恢复", async () => {
      if (!window.confirm(`确定${credential.is_active ? "停用" : "恢复"}该部门凭据吗？`)) return;
      await api(`/api/admin/providers/department/${encodeURIComponent(provider.provider_version_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !credential.is_active }),
      });
      await loadDepartment();
    }, credential.is_active));
    return listRow(providerTitle(provider), `${credential?.has_credential ? "已配置" : "未配置"} · ${provider.is_active ? "目录可用" : "目录已停用"}`, rowActions);
  });
  replace("#settingsDepartmentProviderList", ...providerRows);

  const ordinaryUsers = managedUsers.filter((user) => user.role === "user");
  const usageResults = await Promise.all(ordinaryUsers.map((user) => userUsage(user.user_id)));
  const quotaRows = ordinaryUsers.map((user, index) => {
    const current = usageResults[index]?.usage?.department_quota;
    const rowActions = actions();
    const input = document.createElement("input");
    input.className = "control";
    input.type = "number";
    input.min = "0";
    input.value = String(current?.user_quota_units ?? 0);
    input.addEventListener("input", () => markSystemSettingsDirty());
    rowActions.append(input, actionButton("保存额度", async () => {
      await api(`/api/admin/quotas/department/users/${encodeURIComponent(user.user_id)}`, {
        method: "PATCH", ...jsonOptions({ quota_units: Number(input.value) }),
      });
      clearSystemSettingsDirty();
      await loadDepartment();
    }));
    return listRow(user.username, `已用 ${current?.consumed_units ?? 0} · 可用 ${current?.available_units ?? 0}`, rowActions);
  });
  replace("#settingsUserQuotaList", ...quotaRows);
}

async function loadShared(): Promise<void> {
  const [quotaResult, assetResult] = await Promise.all([api("/api/admin/shared-storage-quota"), api("/api/admin/shared-assets")]);
  const quotaInput = document.querySelector<HTMLInputElement>("#settingsSharedQuotaForm [name=quota_mb]");
  if (quotaInput) quotaInput.value = String(Math.max(1, Math.round(Number(quotaResult.quota?.quota_bytes || 0) / 1024 / 1024)));
  const rows = (assetResult.assets || []).map((asset: Json) => {
    const rowActions = actions();
    rowActions.append(actionButton(asset.is_active ? "停用" : "恢复", async () => {
      if (!window.confirm(`确定${asset.is_active ? "停用" : "恢复"}共享资产 ${asset.name} 吗？`)) return;
      await api(`/api/shared-assets/${encodeURIComponent(asset.asset_id)}/status`, {
        method: "PATCH", ...jsonOptions({ is_active: !asset.is_active }),
      });
      await loadShared();
    }, asset.is_active));
    return listRow(`${asset.name} · ${asset.asset_kind}`, `发布者 ${asset.publisher_user_id} · ${asset.is_active ? "可用" : "已停用"}`, rowActions);
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
  replace("#settingsSchedulerSummary", metric("等待任务", String(scheduler.queue?.queued ?? 0)), metric("运行任务", String(scheduler.queue?.running ?? 0)), metric("阻塞类型", String(scheduler.queue?.blocked?.length ?? 0)));
  const rows = (scheduler.queue?.users || []).map((user: Json) => listRow(String(user.user_id), `等待 ${user.queued} · 运行 ${user.running}`));
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
  replace("#settingsContentSummary", metric("任务总数", String(taskCount)), metric("存储已用", fmtBytes(usage.storage?.used_bytes)), metric("部门额度已用", String(usage.department_quota?.consumed_units ?? 0)));
  replace("#settingsContentTasks", ...(tasksResult.tasks || []).map((task: Json) => listRow(`${task.model_id} · ${task.status}`, `${fmtDate(task.created_at)} · ${task.prompt || ""}`)));
  replace("#settingsContentAssets", ...(assetsResult.assets || []).map((asset: Json) => listRow(`${asset.name} · ${asset.asset_kind}`, `创建于 ${fmtDate(asset.created_at)}`)));
}

async function loadAudit(action = ""): Promise<void> {
  const query = action ? `&action=${encodeURIComponent(action)}` : "";
  const result = await api(`/api/admin/audit?limit=100${query}`);
  const rows = (result.events || []).map((event: Json) => listRow(`${event.action} · ${event.outcome}`, `${fmtDate(event.occurred_at)} · 操作者 ${event.actor_user_id}${event.subject_user_id ? ` · 对象 ${event.subject_user_id}` : ""}`));
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
      if (status) status.textContent = "密码已更新";
      await loadSessions();
    } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : String(error); }
  });
  document.querySelector("#settingsLogoutOtherSessions")?.addEventListener("click", async () => {
    if (!window.confirm("确定退出除当前设备外的全部会话吗？")) return;
    try { await api("/api/auth/sessions/logout-others", { method: "POST" }); await loadSessions(); } catch (error) { reportError(error); }
  });
  document.querySelector<HTMLFormElement>("#settingsCreateUserForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    try { const created = await api("/api/admin/users", { method: "POST", ...jsonOptions({ username: data.get("username") }) }); showCredential(`${created.user.username} 的临时密码：${created.temporary_password}`); form.reset(); clearSystemSettingsDirty(form); await loadUsers(); } catch (error) { reportError(error); }
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
  document.querySelectorAll<HTMLFormElement>("#systemSettingsModal form[data-sensitive-form]").forEach((form) => {
    form.addEventListener("change", () => markSystemSettingsDirty(form));
  });
  document.querySelector("#settingsUserList")?.addEventListener("dblclick", () => setSystemSettingsTab("content"));
}

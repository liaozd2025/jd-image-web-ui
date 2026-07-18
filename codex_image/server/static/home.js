import { cookieValue } from "/auth-static/common.js";

const errorElement = document.querySelector("#workbench-error");
let currentUserId = "";
let currentUserRole = "user";

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    headers["X-CSRF-Token"] = cookieValue("jd_image_csrf");
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`);
  }
  return response.json();
}

function showTemporaryCredential(title, password) {
  document.querySelector("#credential-title").textContent = title;
  document.querySelector("#credential-value").textContent = password;
  document.querySelector("#temporary-credential").hidden = false;
}

function actionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function loadSessions() {
  const result = await api("/api/auth/sessions");
  const list = document.querySelector("#session-list");
  list.replaceChildren();
  for (const session of result.sessions) {
    const item = document.createElement("article");
    item.className = "list-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = session.current ? `${session.user_agent}（当前设备）` : session.user_agent;
    const meta = document.createElement("small");
    meta.textContent = `最近活动：${new Date(session.last_seen_at).toLocaleString()}`;
    details.append(title, meta);
    item.append(details);
    if (!session.current) {
      item.append(actionButton("退出", "danger-button compact", async () => {
        await api(`/api/auth/sessions/${encodeURIComponent(session.session_id)}`, { method: "DELETE" });
        await loadSessions();
      }));
    }
    list.append(item);
  }
}

async function loadUsers() {
  const result = await api("/api/admin/users");
  const list = document.querySelector("#user-list");
  list.replaceChildren();
  for (const user of result.users) {
    const item = document.createElement("article");
    item.className = "list-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${user.username} · ${user.role}`;
    const meta = document.createElement("small");
    meta.textContent = user.is_active ? "正常" : "已停用";
    details.append(title, meta);
    item.append(details);
    if (user.role === "user") {
      const actions = document.createElement("div");
      actions.className = "button-row";
      actions.append(
        actionButton("重置密码", "secondary-button compact", async () => {
          const reset = await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/reset-password`, { method: "POST" });
          showTemporaryCredential(`${user.username} 的临时密码`, reset.temporary_password);
          await loadUsers();
        }),
        actionButton(user.is_active ? "停用" : "恢复", user.is_active ? "danger-button compact" : "secondary-button compact", async () => {
          await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !user.is_active }),
          });
          await loadUsers();
        }),
      );
      item.append(actions);
    }
    list.append(item);
  }
}

function providerTitle(provider) {
  return `${provider.display_name} · v${provider.version_number}`;
}

function providerModels(provider) {
  return (provider.models || []).map((model) => model.model_id).join("、");
}

async function loadPersonalProviders() {
  const [catalogResult, personalResult] = await Promise.all([
    api("/api/providers/catalog"),
    api("/api/providers/personal"),
  ]);
  const credentials = new Map(
    personalResult.credentials.map((credential) => [credential.provider_version_id, credential]),
  );
  const list = document.querySelector("#provider-list");
  list.replaceChildren();
  if (!catalogResult.providers.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "管理员尚未发布可用供应商。";
    list.append(empty);
    return;
  }
  for (const provider of catalogResult.providers) {
    const credential = credentials.get(provider.provider_version_id);
    const item = document.createElement("article");
    item.className = "list-item provider-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = providerTitle(provider);
    const meta = document.createElement("small");
    meta.textContent = `${provider.provider_key} · ${provider.api_mode} · 模型：${providerModels(provider)}`;
    details.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "provider-actions";
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.autocomplete = "new-password";
    keyInput.placeholder = credential?.api_key_mask || "输入个人 API Key";
    keyInput.maxLength = 4096;
    const saveButton = actionButton("保存凭据", "secondary-button compact", async () => {
      if (!keyInput.value) return;
      saveButton.disabled = true;
      try {
        await api(`/api/providers/personal/${encodeURIComponent(provider.provider_version_id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: keyInput.value }),
        });
        keyInput.value = "";
        await loadPersonalProviders();
      } finally {
        saveButton.disabled = false;
      }
    });
    actions.append(keyInput, saveButton);
    if (credential?.has_credential) {
      actions.append(actionButton("删除凭据", "danger-button compact", async () => {
        await api(`/api/providers/personal/${encodeURIComponent(provider.provider_version_id)}`, { method: "DELETE" });
        await loadPersonalProviders();
      }));
    }
    item.append(details, actions);
    list.append(item);
  }
}

async function loadProviderCatalog() {
  const result = await api("/api/admin/provider-catalog");
  const list = document.querySelector("#provider-catalog-list");
  list.replaceChildren();
  for (const provider of result.providers) {
    const item = document.createElement("article");
    item.className = "list-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = providerTitle(provider);
    const meta = document.createElement("small");
    meta.textContent = `${provider.provider_key} · ${provider.is_active ? "可用" : "已停用"} · 模型：${providerModels(provider)}`;
    details.append(title, meta);
    item.append(details, actionButton(
      provider.is_active ? "停用" : "恢复",
      provider.is_active ? "danger-button compact" : "secondary-button compact",
      async () => {
        await api(`/api/admin/provider-catalog/${encodeURIComponent(provider.provider_version_id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !provider.is_active }),
        });
        await Promise.all([loadProviderCatalog(), loadPersonalProviders()]);
      },
    ));
    list.append(item);
  }
}

function renderAssetItem(asset, { trash = false } = {}) {
  const item = document.createElement("article");
  item.className = "list-item asset-item";
  const details = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${asset.name} · ${asset.asset_kind}`;
  const version = asset.current_version;
  const meta = document.createElement("small");
  meta.textContent = version
    ? `v${version.version_number} · ${version.byte_size} bytes · ${version.sha256.slice(0, 12)}`
    : "没有可用版本";
  details.append(title, meta);
  const actions = document.createElement("div");
  actions.className = "button-row";
  if (version && asset.download_url) {
    const link = document.createElement("a");
    link.href = asset.download_url;
    link.textContent = "下载当前版本";
    link.className = "secondary-button compact task-link";
    actions.append(link);
  }
  actions.append(actionButton(trash ? "恢复" : "移入回收站", trash ? "secondary-button compact" : "danger-button compact", async () => {
    await api(trash ? `/api/assets/${encodeURIComponent(asset.asset_id)}/restore` : `/api/assets/${encodeURIComponent(asset.asset_id)}`, { method: trash ? "POST" : "DELETE" });
    await loadAssets();
  }));
  item.append(details, actions);
  return item;
}

async function loadAssets() {
  const [quotaResult, listResult, trashResult] = await Promise.all([
    api("/api/assets/quota"),
    api("/api/assets?limit=100"),
    api("/api/assets/trash?limit=100"),
  ]);
  const quota = quotaResult.quota;
  document.querySelector("#asset-quota").textContent = `已用 ${quota.used_bytes} / ${quota.quota_bytes} bytes，剩余 ${quota.available_bytes} bytes（回收站内容仍计入额度）`;
  const list = document.querySelector("#asset-list");
  list.replaceChildren();
  for (const asset of listResult.assets) list.append(renderAssetItem(asset));
  const trash = document.querySelector("#asset-trash-list");
  trash.replaceChildren();
  if (trashResult.assets.length) {
    const heading = document.createElement("p");
    heading.className = "empty-state";
    heading.textContent = "回收站（恢复后可再次用于新任务）";
    trash.append(heading);
    for (const asset of trashResult.assets) trash.append(renderAssetItem(asset, { trash: true }));
  }
  const taskAssets = document.querySelector("#task-assets");
  taskAssets.replaceChildren();
  for (const asset of listResult.assets) {
    if (!asset.current_version) continue;
    const option = document.createElement("option");
    option.value = asset.current_version.asset_version_id;
    option.textContent = `${asset.name} · v${asset.current_version.version_number}`;
    taskAssets.append(option);
  }
}

async function loadSharedAssets() {
  const [quotaResult, listResult] = await Promise.all([
    api("/api/shared-assets/quota"),
    api("/api/shared-assets?limit=100"),
  ]);
  const quota = quotaResult.quota;
  document.querySelector("#shared-asset-quota").textContent = `已用 ${quota.used_bytes} / ${quota.quota_bytes} bytes，剩余 ${quota.available_bytes} bytes`;
  const list = document.querySelector("#shared-asset-list");
  list.replaceChildren();
  const taskAssets = document.querySelector("#task-shared-assets");
  taskAssets.replaceChildren();
  for (const asset of listResult.assets) {
    const item = document.createElement("article");
    item.className = "list-item asset-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${asset.name} · ${asset.asset_kind}`;
    const meta = document.createElement("small");
    meta.textContent = `发布者 ${asset.publisher_user_id} · v${asset.current_version?.version_number || "-"}`;
    details.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "button-row";
    if (asset.download_url) {
      const link = document.createElement("a");
      link.href = asset.download_url;
      link.textContent = "下载";
      link.className = "secondary-button compact task-link";
      actions.append(link);
    }
    if (asset.publisher_user_id === currentUserId || currentUserRole === "admin") {
      actions.append(actionButton("停用", "danger-button compact", async () => {
        await api(`/api/shared-assets/${encodeURIComponent(asset.asset_id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        });
        await loadSharedAssets();
      }));
    }
    item.append(details, actions);
    list.append(item);
    if (asset.current_version) {
      const option = document.createElement("option");
      option.value = asset.current_version.asset_version_id;
      option.textContent = `${asset.name} · v${asset.current_version.version_number}`;
      taskAssets.append(option);
    }
  }
}

async function loadTaskProviders() {
  const scope = document.querySelector("#task-provider-scope").value;
  let result;
  if (scope === "department") {
    const [catalog, configured] = await Promise.all([api("/api/providers/catalog"), api("/api/providers/department")]);
    const configuredIds = new Set(configured.providers.map((provider) => provider.provider_version_id));
    result = { providers: catalog.providers.filter((provider) => configuredIds.has(provider.provider_version_id)) };
  } else {
    result = await api("/api/providers/catalog");
  }
  const providerSelect = document.querySelector("#task-provider");
  providerSelect.replaceChildren();
  for (const provider of result.providers) {
    const option = document.createElement("option");
    option.value = provider.provider_version_id;
    option.textContent = providerTitle(provider);
    option.dataset.models = JSON.stringify(provider.models || []);
    providerSelect.append(option);
  }
  updateTaskModels();
}

function updateTaskModels() {
  const providerSelect = document.querySelector("#task-provider");
  const modelSelect = document.querySelector("#task-model");
  modelSelect.replaceChildren();
  const selected = providerSelect.selectedOptions[0];
  const models = selected ? JSON.parse(selected.dataset.models || "[]") : [];
  for (const model of models.filter((item) => (item.capabilities || []).includes("image_generation"))) {
    const option = document.createElement("option");
    option.value = model.model_id;
    option.textContent = model.model_id;
    modelSelect.append(option);
  }
}

async function loadTasks() {
  const status = document.querySelector("#task-status-filter").value;
  const result = await api(`/api/tasks${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  const list = document.querySelector("#task-list");
  list.replaceChildren();
  for (const task of result.tasks) {
    const item = document.createElement("article");
    item.className = "list-item task-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${task.model_id} · ${task.status}`;
    const meta = document.createElement("small");
    meta.textContent = `${new Date(task.created_at).toLocaleString()} · ${task.prompt}`;
    details.append(title, meta);
    item.append(details);
    if (task.status === "completed" && task.result_url) {
      const select = document.createElement("input");
      select.type = "checkbox";
      select.dataset.taskId = task.task_id;
      select.setAttribute("aria-label", `选择任务 ${task.task_id} 下载`);
      item.prepend(select);
      const image = document.createElement("img");
      image.className = "task-result";
      image.src = task.thumbnail_url || task.result_url;
      image.alt = task.revised_prompt || task.prompt;
      item.append(image);
      const links = document.createElement("div");
      links.className = "button-row task-links";
      for (const [label, url] of [["查看原图", task.result_url], ["下载原图", `/api/tasks/${encodeURIComponent(task.task_id)}/download`], ["下载缩略图", task.thumbnail_url]]) {
        if (!url) continue;
        const link = document.createElement("a");
        link.href = url;
        link.textContent = label;
        link.className = "secondary-button compact task-link";
        links.append(link);
      }
      item.append(links);
    } else if (task.status === "failed") {
      const error = document.createElement("small");
      error.className = "error";
      error.textContent = task.error_message || "供应商执行失败";
      item.append(error);
      item.append(actionButton("重新提交", "secondary-button compact", async () => {
        await api(`/api/tasks/${encodeURIComponent(task.task_id)}/resubmit`, { method: "POST" });
        await loadTasks();
      }));
    } else if (task.status === "interrupted") {
      item.append(actionButton("重新提交", "secondary-button compact", async () => {
        await api(`/api/tasks/${encodeURIComponent(task.task_id)}/resubmit`, { method: "POST" });
        await loadTasks();
      }));
    }
    if (["completed", "failed", "interrupted"].includes(task.status)) {
      item.append(actionButton("移入回收站", "danger-button compact", async () => {
        await api(`/api/tasks/${encodeURIComponent(task.task_id)}`, { method: "DELETE" });
        await loadTasks();
      }));
    }
    list.append(item);
  }
}

async function loadTaskTrash() {
  const trash = document.querySelector("#task-trash-list");
  const result = await api("/api/tasks/trash");
  trash.replaceChildren();
  for (const task of result.tasks) {
    const item = document.createElement("article");
    item.className = "list-item";
    const title = document.createElement("strong");
    title.textContent = `${task.model_id} · ${task.status} · 已删除`;
    item.append(title, actionButton("恢复任务", "secondary-button compact", async () => {
      await api(`/api/tasks/${encodeURIComponent(task.task_id)}/restore`, { method: "POST" });
      await Promise.all([loadTasks(), loadTaskTrash()]);
    }));
    trash.append(item);
  }
}

async function boot() {
  try {
    const result = await api("/api/auth/me");
    currentUserId = result.user.user_id;
    currentUserRole = result.user.role;
    document.querySelector("#current-user").textContent = `${result.user.username} · ${result.user.role}`;
    await loadSessions();
    await loadPersonalProviders();
    await loadAssets();
    await loadSharedAssets();
    await loadTaskProviders();
    await loadTasks();
    if (result.user.role === "admin") {
      document.querySelector("#user-management").hidden = false;
      document.querySelector("#provider-catalog-management").hidden = false;
      await loadUsers();
      await loadProviderCatalog();
    }
  } catch (error) {
    errorElement.textContent = error.message;
  }
}

document.querySelector("#create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const username = document.querySelector("#new-username").value;
    const created = await api("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    showTemporaryCredential(`${created.user.username} 的临时密码`, created.temporary_password);
    event.target.reset();
    await loadUsers();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#task-provider").addEventListener("change", updateTaskModels);
document.querySelector("#task-provider-scope").addEventListener("change", () => void loadTaskProviders());
document.querySelector("#task-status-filter").addEventListener("change", () => void loadTasks());
document.querySelector("#download-task-archive").addEventListener("click", () => {
  const ids = [...document.querySelectorAll("#task-list input[type=checkbox]:checked")]
    .map((input) => input.dataset.taskId)
    .filter(Boolean);
  if (!ids.length) {
    errorElement.textContent = "请先选择已完成任务";
    return;
  }
  window.location.assign(`/api/tasks/archive?ids=${ids.map(encodeURIComponent).join(",")}`);
});
document.querySelector("#show-task-trash").addEventListener("click", async () => {
  const trash = document.querySelector("#task-trash-list");
  trash.hidden = !trash.hidden;
  if (!trash.hidden) {
    try {
      await loadTaskTrash();
    } catch (error) {
      errorElement.textContent = error.message;
    }
  }
});

document.querySelector("#create-asset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const file = document.querySelector("#asset-file").files[0];
    const form = new FormData();
    form.append("asset_kind", document.querySelector("#asset-kind").value);
    form.append("name", document.querySelector("#asset-name").value);
    form.append("file", file);
    await api("/api/assets", { method: "POST", body: form });
    event.target.reset();
    await loadAssets();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#create-shared-asset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData();
    form.append("asset_kind", document.querySelector("#shared-asset-kind").value);
    form.append("name", document.querySelector("#shared-asset-name").value);
    form.append("file", document.querySelector("#shared-asset-file").files[0]);
    await api("/api/shared-assets", { method: "POST", body: form });
    event.target.reset();
    await loadSharedAssets();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#create-task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const inputFile = document.querySelector("#task-input-file").files[0];
    const assetVersionIds = [...document.querySelector("#task-assets").selectedOptions].map((option) => option.value);
    const sharedAssetVersionIds = [...document.querySelector("#task-shared-assets").selectedOptions].map((option) => option.value);
    const requestBody = inputFile ? (() => {
      const form = new FormData();
      form.append("provider_version_id", document.querySelector("#task-provider").value);
      form.append("model_id", document.querySelector("#task-model").value);
      form.append("prompt", document.querySelector("#task-prompt").value);
      form.append("asset_version_ids", JSON.stringify(assetVersionIds));
      form.append("shared_asset_version_ids", JSON.stringify(sharedAssetVersionIds));
      form.append("provider_scope", document.querySelector("#task-provider-scope").value);
      form.append("input_file", inputFile);
      return form;
    })() : JSON.stringify({
      provider_version_id: document.querySelector("#task-provider").value,
      model_id: document.querySelector("#task-model").value,
      prompt: document.querySelector("#task-prompt").value,
      asset_version_ids: assetVersionIds,
      shared_asset_version_ids: sharedAssetVersionIds,
      provider_scope: document.querySelector("#task-provider-scope").value,
    });
    await api("/api/tasks", {
      method: "POST",
      headers: inputFile ? {} : { "Content-Type": "application/json" },
      body: requestBody,
    });
    document.querySelector("#task-prompt").value = "";
    document.querySelector("#task-input-file").value = "";
    await loadTasks();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#create-provider-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/provider-catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_key: document.querySelector("#provider-key").value,
        display_name: document.querySelector("#provider-display-name").value,
        base_url: document.querySelector("#provider-base-url").value,
        api_mode: document.querySelector("#provider-api-mode").value,
        models: [{
          model_id: document.querySelector("#provider-model-id").value,
          capabilities: ["image_generation"],
        }],
        parameter_constraints: {},
      }),
    });
    event.target.reset();
    await Promise.all([loadProviderCatalog(), loadPersonalProviders()]);
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#logout-others-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/sessions/logout-others", { method: "POST" });
    await loadSessions();
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#logout-all-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/sessions/logout-all", { method: "POST" });
    window.location.assign("/login");
  } catch (error) {
    errorElement.textContent = error.message;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": cookieValue("jd_image_csrf") },
  });
  if (response.ok) {
    window.location.assign("/login");
  }
});

void boot();
window.setInterval(() => {
  if (!document.hidden) void loadTasks().catch((error) => { errorElement.textContent = error.message; });
}, 1500);

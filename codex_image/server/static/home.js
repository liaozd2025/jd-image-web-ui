import { cookieValue } from "/auth-static/common.js";

const errorElement = document.querySelector("#workbench-error");

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

async function boot() {
  try {
    const result = await api("/api/auth/me");
    document.querySelector("#current-user").textContent = `${result.user.username} · ${result.user.role}`;
    await loadSessions();
    await loadPersonalProviders();
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

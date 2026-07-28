import { cookieValue } from "/auth-static/common.js";

const loginForm = document.querySelector("#login-form");
const passwordForm = document.querySelector("#password-form");
const THEME_STORAGE_KEY = "codex-image-theme-preference";
const REMEMBERED_LOGIN_STORAGE_KEY = "jd-image-remembered-login";
const REMEMBERED_LOGIN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VALID_THEMES = new Set(["system", "light", "dark"]);
let csrfToken = "";

function clearRememberedLogin() {
  try {
    window.localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted browser modes.
  }
}

function readRememberedLogin() {
  try {
    const value = JSON.parse(window.localStorage.getItem(REMEMBERED_LOGIN_STORAGE_KEY) || "null");
    if (
      !value
      || typeof value.username !== "string"
      || typeof value.password !== "string"
      || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= Date.now()
    ) {
      clearRememberedLogin();
      return null;
    }
    return value;
  } catch {
    clearRememberedLogin();
    return null;
  }
}

function saveRememberedLogin(username, password) {
  try {
    window.localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, JSON.stringify({
      username,
      password,
      expiresAt: Date.now() + REMEMBERED_LOGIN_TTL_MS,
    }));
  } catch {
    // Login still works when browser storage is unavailable.
  }
}

function restoreRememberedLogin() {
  const remembered = readRememberedLogin();
  if (!remembered) return;
  loginForm.querySelector("#username").value = remembered.username;
  loginForm.querySelector("#password").value = remembered.password;
  loginForm.querySelector("#remember-me").checked = true;
}

function syncWorkspaceTheme() {
  let preference = "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (VALID_THEMES.has(stored)) preference = stored;
  } catch {
    preference = "system";
  }
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
}

function showPasswordForm(currentPassword = "") {
  const currentPasswordInput = passwordForm.querySelector("#current-password");
  loginForm.hidden = true;
  passwordForm.hidden = false;
  currentPasswordInput.value = currentPassword;
  window.requestAnimationFrame(() => {
    const nextInput = currentPassword ? passwordForm.querySelector("#new-password") : currentPasswordInput;
    nextInput.focus();
  });
}

function setSubmitting(form, submitting) {
  form.querySelector("button[type=submit]").disabled = submitting;
}

syncWorkspaceTheme();
restoreRememberedLogin();

loginForm.querySelector("#remember-me").addEventListener("change", (event) => {
  if (!event.currentTarget.checked) clearRememberedLogin();
});

if (new URLSearchParams(window.location.search).get("change") === "1") {
  showPasswordForm();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = loginForm.querySelector("#login-error");
  const username = loginForm.querySelector("#username").value;
  const password = loginForm.querySelector("#password").value;
  const rememberMe = loginForm.querySelector("#remember-me").checked;
  setSubmitting(loginForm, true);
  error.textContent = "";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        remember_me: rememberMe,
      }),
    });
    if (!response.ok) {
      error.textContent = response.status === 429 ? "尝试次数过多，请稍后再试" : "用户名或密码错误";
      return;
    }
    const result = await response.json();
    if (rememberMe) saveRememberedLogin(username, password);
    else clearRememberedLogin();
    csrfToken = result.csrf_token;
    if (result.user.must_change_password) {
      showPasswordForm(password);
      return;
    }
    window.location.assign("/");
  } catch {
    error.textContent = "暂时无法连接服务器，请稍后重试";
  } finally {
    setSubmitting(loginForm, false);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = passwordForm.querySelector("#password-error");
  setSubmitting(passwordForm, true);
  error.textContent = "";
  if (!csrfToken) csrfToken = cookieValue("jd_image_csrf");
  try {
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        current_password: passwordForm.querySelector("#current-password").value,
        new_password: passwordForm.querySelector("#new-password").value,
      }),
    });
    if (!response.ok) {
      error.textContent = "密码修改失败，请检查输入";
      return;
    }
    const remembered = readRememberedLogin();
    if (remembered) {
      saveRememberedLogin(
        remembered.username,
        passwordForm.querySelector("#new-password").value,
      );
    }
    window.location.assign("/");
  } catch {
    error.textContent = "暂时无法连接服务器，请稍后重试";
  } finally {
    setSubmitting(passwordForm, false);
  }
});

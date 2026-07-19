import { cookieValue } from "/auth-static/common.js";

const loginForm = document.querySelector("#login-form");
const passwordForm = document.querySelector("#password-form");
const THEME_STORAGE_KEY = "codex-image-theme-preference";
const VALID_THEMES = new Set(["system", "light", "dark"]);
let csrfToken = "";

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

if (new URLSearchParams(window.location.search).get("change") === "1") {
  showPasswordForm();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = loginForm.querySelector("#login-error");
  const password = loginForm.querySelector("#password").value;
  setSubmitting(loginForm, true);
  error.textContent = "";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginForm.querySelector("#username").value,
        password,
      }),
    });
    if (!response.ok) {
      error.textContent = response.status === 429 ? "尝试次数过多，请稍后再试" : "用户名或密码错误";
      return;
    }
    const result = await response.json();
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
    window.location.assign("/");
  } catch {
    error.textContent = "暂时无法连接服务器，请稍后重试";
  } finally {
    setSubmitting(passwordForm, false);
  }
});

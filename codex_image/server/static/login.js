import { cookieValue } from "/auth-static/common.js";

// PROTOTYPE: Three login directions on the existing route, switched with ?variant=A|B|C.
const VARIANTS = [
  { key: "A", name: "侧栏延续" },
  { key: "B", name: "画布分屏" },
  { key: "C", name: "聚焦浮层" },
];
const VARIANT_KEYS = new Set(VARIANTS.map(({ key }) => key));
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const searchParams = new URLSearchParams(window.location.search);
const requestedVariant = String(searchParams.get("variant") || "A").toUpperCase();
let currentVariant = VARIANT_KEYS.has(requestedVariant) ? requestedVariant : "A";
let csrfToken = "";

function syncWorkspaceTheme() {
  const preference = window.localStorage.getItem("codex-image-theme-preference") || "system";
  const dark = preference === "dark"
    || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.dataset.theme = dark ? "dark" : "light";
}

syncWorkspaceTheme();

const panelTemplate = document.querySelector("#auth-panel-template");
const panelFragment = panelTemplate.content.cloneNode(true);
const authPanel = panelFragment.querySelector(".signin-card");
const loginForm = panelFragment.querySelector("#login-form");
const passwordForm = panelFragment.querySelector("#password-form");
const switcher = document.querySelector("#prototype-switcher");
const prototypeState = document.querySelector("#prototype-state");

function activeFormName() {
  return passwordForm.hidden ? "登录" : "首次改密";
}

function updatePrototypeState() {
  const variant = VARIANTS.find(({ key }) => key === currentVariant) || VARIANTS[0];
  prototypeState.value = `${variant.key} — ${variant.name} · ${activeFormName()}`;
  prototypeState.textContent = prototypeState.value;
}

function applyVariant(key, { writeUrl = false } = {}) {
  currentVariant = VARIANT_KEYS.has(key) ? key : "A";
  document.querySelectorAll("[data-variant]").forEach((section) => {
    const active = section.dataset.variant === currentVariant;
    section.hidden = !active;
    section.setAttribute("aria-hidden", String(!active));
  });
  const activeSection = document.querySelector(`[data-variant="${currentVariant}"]`);
  activeSection.querySelector("[data-auth-panel-slot]").append(authPanel);
  document.body.dataset.prototypeVariant = currentVariant;
  updatePrototypeState();
  if (writeUrl) {
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("variant", currentVariant);
    window.history.replaceState({}, "", `${window.location.pathname}?${nextParams.toString()}`);
  }
}

function cycleVariant(direction) {
  const currentIndex = VARIANTS.findIndex(({ key }) => key === currentVariant);
  const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
  applyVariant(VARIANTS[nextIndex].key, { writeUrl: true });
}

function showPasswordForm(currentPassword = "") {
  loginForm.hidden = true;
  passwordForm.hidden = false;
  passwordForm.querySelector("#current-password").value = currentPassword;
  updatePrototypeState();
  window.requestAnimationFrame(() => passwordForm.querySelector("#new-password").focus());
}

applyVariant(currentVariant, { writeUrl: LOCAL_HOSTS.has(window.location.hostname) });

if (LOCAL_HOSTS.has(window.location.hostname)) {
  switcher.hidden = false;
  switcher.querySelector("[data-prototype-previous]").addEventListener("click", () => cycleVariant(-1));
  switcher.querySelector("[data-prototype-next]").addEventListener("click", () => cycleVariant(1));
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLElement
      && (target.matches("input, textarea") || target.isContentEditable);
    if (editing || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
  });
}

if (searchParams.get("change") === "1") {
  showPasswordForm();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector("button[type=submit]");
  const error = loginForm.querySelector("#login-error");
  const password = loginForm.querySelector("#password").value;
  submitButton.disabled = true;
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
    submitButton.disabled = false;
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = passwordForm.querySelector("button[type=submit]");
  const error = passwordForm.querySelector("#password-error");
  submitButton.disabled = true;
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
    submitButton.disabled = false;
  }
});

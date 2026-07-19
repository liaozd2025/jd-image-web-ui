import { LOCALE_CHANGE_EVENT, translate } from "./i18n";

export interface CurrentUser {
  user_id: string;
  username: string;
  role: "admin" | "user";
  must_change_password?: boolean;
  is_active?: boolean;
}

interface CurrentUserResponse {
  user: CurrentUser;
  session: { session_id: string; user_agent: string; current: boolean };
  csrf_token: string;
}

let serverAccountInitialized = false;
let csrfToken = "";
let currentUser: CurrentUser | null = null;

export function getCurrentServerUser(): CurrentUser | null {
  return currentUser;
}

export function getCsrfToken(): string {
  return csrfToken;
}

function initials(username: string): string {
  const chars = Array.from(username.trim());
  return (chars.slice(0, 2).join("") || "--").toLocaleUpperCase();
}

function roleLabel(role: CurrentUser["role"]): string {
  return translate(role === "admin" ? "serverAccount.roleAdmin" : "serverAccount.roleUser");
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function closeMenu(): void {
  const menu = document.querySelector<HTMLElement>("#serverAccountMenu");
  const trigger = document.querySelector<HTMLElement>("#serverAccountButton");
  menu?.classList.add("hidden");
  menu?.setAttribute("aria-hidden", "true");
  trigger?.setAttribute("aria-expanded", "false");
}

function toggleMenu(): void {
  const menu = document.querySelector<HTMLElement>("#serverAccountMenu");
  const trigger = document.querySelector<HTMLElement>("#serverAccountButton");
  const open = Boolean(menu?.classList.contains("hidden"));
  menu?.classList.toggle("hidden", !open);
  menu?.setAttribute("aria-hidden", open ? "false" : "true");
  trigger?.setAttribute("aria-expanded", open ? "true" : "false");
}

function renderCurrentUser(): void {
  if (!currentUser) return;
  const avatar = initials(currentUser.username);
  const role = roleLabel(currentUser.role);
  setText("#serverAccountName", currentUser.username);
  setText("#serverAccountMenuName", currentUser.username);
  setText("#systemSettingsAccountName", currentUser.username);
  setText("#settingsAccountUsername", currentUser.username);
  setText("#serverAccountRole", role);
  setText("#serverAccountMenuRole", role);
  setText("#systemSettingsAccountRole", role);
  setText("#settingsAccountRole", role);
  setText("#serverAccountAvatar", avatar);
  setText("#serverAccountMenuAvatar", avatar);
  setText("#systemSettingsAccountAvatar", avatar);
}

async function loadServerAccount(): Promise<void> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return;
  const context = await response.json() as CurrentUserResponse;
  currentUser = context.user;
  csrfToken = context.csrf_token;
  document.documentElement.dataset.userRole = context.user.role;
  renderCurrentUser();
  document.querySelector("#serverAccount")?.classList.remove("hidden");
  const logoutButton = document.querySelector<HTMLButtonElement>("#serverLogoutButton");
  if (logoutButton) logoutButton.disabled = !csrfToken;
  document.dispatchEvent(new CustomEvent("codex-image-user-context", { detail: context }));
}

async function logout(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#serverLogoutButton");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "X-CSRF-Token": decodeURIComponent(
          document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("jd_image_csrf="))?.slice("jd_image_csrf=".length) || csrfToken,
        ),
      },
    });
    if (response.ok) window.location.assign("/login");
  } finally {
    if (button) button.disabled = false;
  }
}

export function initServerAccountFeature(): void {
  if (serverAccountInitialized) return;
  serverAccountInitialized = true;
  document.querySelector("#serverAccountButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });
  document.querySelector("#serverAccountMenu")?.addEventListener("click", (event) => event.stopPropagation());
  document.querySelector("#serverAccountSettingsButton")?.addEventListener("click", closeMenu);
  document.querySelector("#serverLogoutButton")?.addEventListener("click", () => void logout());
  document.addEventListener(LOCALE_CHANGE_EVENT, renderCurrentUser);
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  void loadServerAccount();
}

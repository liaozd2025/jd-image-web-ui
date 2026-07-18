interface CurrentUser {
  username: string;
  role: "admin" | "user";
}

interface CurrentUserResponse {
  user: CurrentUser;
}

let serverAccountInitialized = false;

function cookieValue(name: string): string {
  const prefix = `${name}=`;
  const part = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

async function loadServerAccount(): Promise<void> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return;
  const { user } = await response.json() as CurrentUserResponse;
  const name = document.querySelector<HTMLElement>("#serverAccountName");
  const adminLink = document.querySelector<HTMLElement>("#serverAdminLink");
  if (name) name.textContent = user.username;
  const isAdmin = user.role === "admin";
  adminLink?.classList.toggle("hidden", !isAdmin);
}

async function logout(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#serverLogoutButton");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": cookieValue("jd_image_csrf") },
    });
    if (response.ok) window.location.assign("/login");
  } finally {
    if (button) button.disabled = false;
  }
}

export function initServerAccountFeature(): void {
  if (serverAccountInitialized) return;
  serverAccountInitialized = true;
  document.querySelector("#serverLogoutButton")?.addEventListener("click", () => {
    void logout();
  });
  void loadServerAccount();
}

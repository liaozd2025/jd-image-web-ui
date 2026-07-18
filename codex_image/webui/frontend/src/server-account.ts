interface CurrentUser {
  username: string;
  role: "admin" | "user";
}

interface CurrentUserResponse {
  user: CurrentUser;
  session: {
    session_id: string;
    user_agent: string;
    current: boolean;
  };
  csrf_token: string;
}

let serverAccountInitialized = false;
let csrfToken = "";

async function loadServerAccount(): Promise<void> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return;
  const context = await response.json() as CurrentUserResponse;
  const { user } = context;
  const name = document.querySelector<HTMLElement>("#serverAccountName");
  const adminLink = document.querySelector<HTMLElement>("#serverAdminLink");
  const logoutButton = document.querySelector<HTMLButtonElement>("#serverLogoutButton");
  csrfToken = context.csrf_token;
  if (name) name.textContent = user.username;
  const isAdmin = user.role === "admin";
  adminLink?.classList.toggle("hidden", !isAdmin);
  if (logoutButton) logoutButton.disabled = !csrfToken;
}

async function logout(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#serverLogoutButton");
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
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

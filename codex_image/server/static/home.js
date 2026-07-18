import { cookieValue } from "/auth-static/common.js";

fetch("/api/auth/me")
  .then((response) => response.json())
  .then((result) => {
    document.querySelector("#current-user").textContent = `${result.user.username} · ${result.user.role}`;
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

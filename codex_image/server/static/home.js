function cookieValue(name) {
  const item = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split("=")[1]) : "";
}

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

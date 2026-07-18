import { cookieValue } from "/auth-static/common.js";

const loginForm = document.querySelector("#login-form");
const passwordForm = document.querySelector("#password-form");
let csrfToken = "";

function showPasswordForm(currentPassword = "") {
  loginForm.hidden = true;
  passwordForm.hidden = false;
  document.querySelector("#current-password").value = currentPassword;
}

if (new URLSearchParams(window.location.search).get("change") === "1") {
  showPasswordForm();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#password").value;
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.querySelector("#username").value,
      password,
    }),
  });
  if (!response.ok) {
    document.querySelector("#login-error").textContent = "用户名或密码错误";
    return;
  }
  const result = await response.json();
  csrfToken = result.csrf_token;
  if (result.user.must_change_password) {
    showPasswordForm(password);
    return;
  }
  window.location.assign("/");
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!csrfToken) {
    csrfToken = cookieValue("jd_image_csrf");
  }
  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({
      current_password: document.querySelector("#current-password").value,
      new_password: document.querySelector("#new-password").value,
    }),
  });
  if (!response.ok) {
    document.querySelector("#password-error").textContent = "密码修改失败，请检查输入";
    return;
  }
  window.location.assign("/");
});

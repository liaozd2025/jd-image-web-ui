import { chromium } from "playwright";

const baseUrl = process.env.JD_IMAGE_BROWSER_BASE_URL;
const imageBytes = Buffer.from(process.env.JD_IMAGE_BROWSER_PNG_BASE64, "base64");
const credentials = JSON.parse(process.env.JD_IMAGE_BROWSER_CREDENTIALS || "{}");
const userAId = process.env.JD_IMAGE_BROWSER_USER_A_ID;
const userBId = process.env.JD_IMAGE_BROWSER_USER_B_ID;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function eventually(callback, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

async function api(page, path, { method = "GET", json } = {}) {
  return await page.evaluate(async ({ path, method, json }) => {
    const token = document.cookie.split(";").map((part) => part.trim())
      .find((part) => part.startsWith("jd_image_csrf="))?.split("=").slice(1).join("=") || "";
    const headers = {};
    if (json !== undefined) headers["Content-Type"] = "application/json";
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = decodeURIComponent(token);
    const response = await fetch(path, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("json") ? await response.json() : await response.arrayBuffer();
    return {
      status: response.status,
      body: contentType.includes("json") ? body : { byteLength: body.byteLength },
      contentType,
      disposition: response.headers.get("content-disposition") || "",
    };
  }, { path, method, json });
}

async function upload(page, path, fields, files) {
  return await page.evaluate(async ({ path, fields, files }) => {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
    for (const file of files) {
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
      form.append(file.field, new File([bytes], file.name, { type: file.mimeType }));
    }
    const token = document.cookie.split(";").map((part) => part.trim())
      .find((part) => part.startsWith("jd_image_csrf="))?.split("=").slice(1).join("=") || "";
    const response = await fetch(path, { method: "POST", headers: { "X-CSRF-Token": decodeURIComponent(token) }, body: form });
    return { status: response.status, body: await response.json() };
  }, {
    path,
    fields,
    files: files.map((file) => ({ ...file, base64: file.bytes.toString("base64") })),
  });
}

async function loginAndChangePassword(page, account) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login(?:\?|$)/);
  await page.locator("#username").fill(account.username);
  await page.locator("#password").fill(account.temporaryPassword);
  await page.locator("#login-form button[type=submit]").click();
  await page.locator("#password-form").waitFor({ state: "visible" });
  await page.locator("#new-password").fill(account.password);
  await page.locator("#password-form button[type=submit]").click();
  await page.waitForURL(`${baseUrl}/`);
  await page.locator(".layout-container").waitFor({ state: "visible" });
}

async function loginExisting(page, account) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login(?:\?|$)/);
  await page.locator("#username").fill(account.username);
  await page.locator("#password").fill(account.password);
  await page.locator("#login-form button[type=submit]").click();
  await page.waitForURL(`${baseUrl}/`);
  await page.locator(".layout-container").waitFor({ state: "visible" });
}

async function waitForWorkspace(page) {
  for (const selector of ["#sidebar", ".dashboard", "#imageInput", "#promptEditor", "#runButton", "#imageEditorModal"]) {
    check(await page.locator(selector).count() === 1, `original workspace control missing: ${selector}`);
  }
  await eventually(
    async () => await page.locator("#runButton").isEnabled(),
    "workspace never became ready for generation",
  );
  const settings = await api(page, "/api/api-settings");
  check(settings.status === 200, "provider settings were unavailable");
  check(settings.body.settings.providers.some((item) => item.provider_scope === "department" && item.name.includes("部门")), "department provider source was not distinguished");
}

async function waitForTask(page, prompt, status) {
  return await eventually(async () => {
    const response = await api(page, "/api/tasks/recent?limit=50");
    const task = response.body.tasks?.find((item) => item.prompt === prompt);
    if (!task) throw new Error(`task was not present; prompts=${(response.body.tasks || []).map((item) => item.prompt).join("|")}`);
    if (task.status !== status) throw new Error(`last status=${task.status}; error=${task.error_message || task.error || task.last_error || ""}`);
    return task;
  }, `task ${prompt} did not reach ${status}`, 30_000);
}

async function runFromWorkspaceUi(page, expectedPath) {
  try {
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === expectedPath, { timeout: 10_000 });
    await page.locator("#runButton").click();
    const response = await responsePromise;
    const body = await response.json();
    check(response.status() === 201, `${expectedPath} rejected the original workspace submission: ${JSON.stringify(body)}`);
    return body.task;
  } catch (error) {
    const status = await page.locator("#statusText").textContent();
    throw new Error(`${error.message}; workspace status=${status || ""}`);
  }
}

async function submitTask(page, prompt, { edit = false, twoImages = false } = {}) {
  const settings = await api(page, "/api/api-settings");
  const provider = settings.body.settings.providers.find((item) => item.provider_scope === "department");
  check(provider, "department provider is missing");
  const fields = {
    api_provider_id: provider.id,
    model: "fake-image-1",
    prompt,
    size: "1024x1024",
    quality: "auto",
    output_format: "png",
  };
  if (!edit) return await upload(page, "/api/generate", fields, []);
  const files = [{ field: "images", name: "reference-a.png", mimeType: "image/png", bytes: imageBytes }];
  if (twoImages) files.push({ field: "images", name: "reference-b.png", mimeType: "image/png", bytes: imageBytes });
  return await upload(page, "/api/edit", fields, files);
}

const browser = await chromium.launch({ channel: process.env.JD_IMAGE_BROWSER_CHROME_CHANNEL || "chrome", headless: true });
const consoleErrors = [];
function collectConsoleError(scope, message) {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
    consoleErrors.push(`${scope} console: ${message.text()}`);
  }
}
function collectServerError(scope, response) {
  if (response.status() >= 500) consoleErrors.push(`${scope} server response: ${response.status()} ${response.url()}`);
}
try {
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pageA = await contextA.newPage();
  pageA.on("pageerror", (error) => consoleErrors.push(`user-a pageerror: ${error.message}`));
  pageA.on("console", (message) => collectConsoleError("user-a", message));
  pageA.on("response", (response) => collectServerError("user-a", response));
  await loginAndChangePassword(pageA, credentials.userA);
  await waitForWorkspace(pageA);
  check((await api(pageA, "/admin")).status === 403, "normal user accessed administrator UI");

  const sharedGallery = await api(pageA, "/api/gallery");
  check(sharedGallery.body.items.some((item) => item.scope === "shared" && item.read_only), "shared gallery item was not visible");
  const personalUpload = await upload(pageA, "/api/gallery", { name: "User A private image", category: "product" }, [
    { field: "image", name: "private-a.png", mimeType: "image/png", bytes: imageBytes },
  ]);
  check(personalUpload.status === 201, `personal gallery upload failed: ${JSON.stringify(personalUpload.body)}`);
  const privateAssetId = personalUpload.body.item.id;
  check((await api(pageA, "/api/gallery")).body.items.some((item) => item.id === privateAssetId && item.scope === "personal"), "personal gallery item was not returned");
  check((await api(pageA, "/api/prompt-snippets", { method: "POST", json: { tag: "privateA", title: "Private A", content: "private user A snippet" } })).status === 201, "personal snippet creation failed");
  check((await api(pageA, "/api/prompt-templates", { method: "POST", json: { title: "Private A template", content: "private user A template" } })).status === 201, "personal template creation failed");
  check((await api(pageA, "/api/prompt-snippets")).body.snippets.some((item) => item.scope === "shared"), "shared snippet missing");
  check((await api(pageA, "/api/prompt-templates")).body.templates.some((item) => item.scope === "shared"), "shared template missing");

  await pageA.locator("#promptEditor").fill("browser successful generation");
  await runFromWorkspaceUi(pageA, "/api/generate");
  const generated = await waitForTask(pageA, "browser successful generation", "completed");
  const generatedDownload = await api(pageA, `/api/tasks/${generated.task_id}/outputs/1/download`);
  check(generatedDownload.status === 200 && generatedDownload.body.byteLength > 0, "generated output download failed");
  await eventually(async () => await pageA.locator(`[data-task-id="${generated.task_id}"]`).count(), "generated task was not rendered in original sidebar");

  await pageA.goto(`${baseUrl}/history`, { waitUntil: "domcontentloaded" });
  await pageA.locator(".history-page").waitFor({ state: "visible" });
  await eventually(async () => await pageA.locator(`[data-history-task-card-id="${generated.task_id}"]`).count(), "generated task was not shown in original history UI");
  await pageA.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForWorkspace(pageA);

  await pageA.locator("#imageInput").setInputFiles([
    { name: "edit-a.png", mimeType: "image/png", buffer: imageBytes },
    { name: "edit-b.png", mimeType: "image/png", buffer: imageBytes },
  ]);
  check(await pageA.locator("#imageThumbItems .thumb").count() === 2, "multi-reference image ordering did not render");
  await pageA.locator("#imageThumbItems .editable-thumb").first().click();
  await pageA.locator("#imageEditorModal").waitFor({ state: "visible" });
  check(await pageA.locator("#imageEditorKonvaMount").count() === 1, "original image editor was not mounted");
  await pageA.locator("#imageEditorCancel").click();
  await pageA.locator("#promptEditor").fill("browser image edit with two references");
  await runFromWorkspaceUi(pageA, "/api/edit");
  const edited = await waitForTask(pageA, "browser image edit with two references", "completed");
  check(edited.mode === "edit", "image edit was submitted as generation");

  const failedSubmit = await submitTask(pageA, "force provider failure");
  check(failedSubmit.status === 201, "provider-failure task was not queued");
  const failed = await waitForTask(pageA, "force provider failure", "failed");
  const retried = await api(pageA, `/api/tasks/${failed.task_id}/retry-failed`, { method: "POST" });
  check(retried.status === 201 && retried.body.task.task_id !== failed.task_id, "retry overwrote original failed task");

  const holdingSubmit = await submitTask(pageA, "hold provider for cancellation");
  check(holdingSubmit.status === 201, "holding task was not queued");
  await waitForTask(pageA, "hold provider for cancellation", "running");
  const cancelSubmit = await submitTask(pageA, "browser cancel queued task");
  check(cancelSubmit.status === 201, "cancellable task was not queued");
  const cancelled = await api(pageA, `/api/queue/${cancelSubmit.body.task.task_id}`, { method: "DELETE" });
  check(cancelled.status === 200 && cancelled.body.task.status === "cancelled", "queued task was not cancelled");

  check((await api(pageA, `/api/tasks/${edited.task_id}/archive`, { method: "PATCH", json: { archived: true } })).status === 200, "archive failed");
  check((await api(pageA, `/api/tasks/${edited.task_id}`, { method: "DELETE" })).status === 200, "delete failed");
  check((await api(pageA, `/api/tasks/${edited.task_id}`)).status === 404, "deleted task remained visible");
  check((await api(pageA, "/api/tasks/trash")).body.tasks.some((item) => item.task_id === edited.task_id), "deleted task did not enter personal trash");
  check((await api(pageA, `/api/tasks/${edited.task_id}/restore`, { method: "POST" })).status === 200, "task restore failed");
  check((await api(pageA, `/api/tasks/${edited.task_id}/outputs.zip`)).status === 200, "restored task ZIP download failed");

  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  pageB.on("pageerror", (error) => consoleErrors.push(`user-b pageerror: ${error.message}`));
  pageB.on("console", (message) => collectConsoleError("user-b", message));
  pageB.on("response", (response) => collectServerError("user-b", response));
  await loginAndChangePassword(pageB, credentials.userB);
  await waitForWorkspace(pageB);
  const galleryB = await api(pageB, "/api/gallery");
  check(galleryB.body.items.some((item) => item.scope === "shared"), "shared gallery was not visible to second user");
  check(!galleryB.body.items.some((item) => item.id === privateAssetId), "second user saw first user's private gallery item");
  check(!(await api(pageB, "/api/prompt-snippets")).body.snippets.some((item) => item.tag === "privateA"), "second user saw first user's prompt snippet");
  check(!(await api(pageB, "/api/prompt-templates")).body.templates.some((item) => item.title === "Private A template"), "second user saw first user's prompt template");
  check(!(await api(pageB, "/api/tasks/recent?limit=50")).body.tasks.some((item) => item.task_id === generated.task_id), "second user saw first user's task");
  check((await api(pageB, `/api/tasks/${generated.task_id}`)).status === 404, "second user guessed first user's task ID");
  check((await api(pageB, `/api/tasks/${generated.task_id}/outputs/1/download`)).status === 404, "second user downloaded first user's output");

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (error) => consoleErrors.push(`admin pageerror: ${error.message}`));
  adminPage.on("console", (message) => collectConsoleError("admin", message));
  adminPage.on("response", (response) => collectServerError("admin", response));
  await loginExisting(adminPage, credentials.admin);
  await adminPage.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await adminPage.locator("#server-home").waitFor({ state: "visible" });
  await adminPage.locator("#user-management").waitFor({ state: "visible" });
  const adminTasks = await api(adminPage, `/api/admin/users/${userAId}/tasks?limit=100`);
  check(adminTasks.status === 200 && adminTasks.body.tasks.some((item) => item.task_id === generated.task_id), "admin could not inspect user tasks");
  check((await api(adminPage, `/api/admin/users/${userAId}/tasks/${generated.task_id}/download`)).status === 200, "admin could not download protected user output");
  const audit = await api(adminPage, `/api/admin/audit?subject_user_id=${userAId}&limit=200`);
  const actions = new Set(audit.body.events.map((event) => event.action));
  check(actions.has("admin.view_user_tasks") && actions.has("admin.view_user_task_artifact"), "administrator cross-user access was not audited");
  const catalog = await api(adminPage, "/api/admin/provider-catalog");
  check((await api(adminPage, `/api/providers/personal/${catalog.body.providers[0].provider_version_id}`, { method: "PUT", json: { api_key: "forbidden" } })).status === 403, "admin configured a personal provider");

  check((await api(adminPage, `/api/admin/quotas/department/users/${userAId}`, { method: "PATCH", json: { quota_units: 0 } })).status === 200, "admin could not set quota gate");
  const rejected = await submitTask(pageA, "browser quota rejection");
  check(rejected.status === 409 && String(rejected.body.detail).includes("额度"), `quota rejection was not user-readable: ${JSON.stringify(rejected.body)}`);
  check((await api(adminPage, `/api/admin/quotas/department/users/${userAId}`, { method: "PATCH", json: { quota_units: 100 } })).status === 200, "admin could not restore user quota");

  check(userBId && userBId !== userAId, "release gate did not use two distinct normal users");
  check(consoleErrors.length === 0, `browser console errors:\n${consoleErrors.join("\n")}`);
  await Promise.all([contextA.close(), contextB.close(), adminContext.close()]);
} finally {
  await browser.close();
}

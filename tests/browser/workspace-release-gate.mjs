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
  await waitForAccount(page, account.username);
}

async function waitForAccount(page, username) {
  await eventually(
    async () => (await page.locator("#serverAccountName").textContent())?.trim() === username,
    "server account did not load after login",
  );
}

async function loginExisting(page, account) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login(?:\?|$)/);
  await page.locator("#username").fill(account.username);
  await page.locator("#password").fill(account.password);
  await page.locator("#login-form button[type=submit]").click();
  await page.waitForURL(`${baseUrl}/`);
  await page.locator(".layout-container").waitFor({ state: "visible" });
  await waitForAccount(page, account.username);
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
  check((await pageA.locator("#serverAccountName").textContent()).includes(credentials.userA.username), "current username was not shown in the sidebar account entry");
  check((await pageA.locator("#serverAccountRole").textContent()).trim() === "普通用户", "normal user role was not shown in the sidebar account entry");
  check(await pageA.locator("#serverAdminLink").count() === 0, "legacy administrator entry is still present");
  check(await pageA.locator("[data-auth-source]").count() === 0, "server workspace still exposed the Codex/local auth switcher");
  check(await pageA.locator("#systemSettingsCodexTab").isHidden(), "server workspace still exposed Codex settings");
  check((await api(pageA, "/admin")).status === 403, "normal user accessed administrator UI");

  await pageA.locator("#serverAccountButton").click();
  await pageA.locator("#serverAccountMenu").waitFor({ state: "visible" });
  check(await pageA.locator("#serverAccountSettingsButton").isVisible(), "system settings action was missing from the account menu");
  check(await pageA.locator("#serverLogoutButton").isVisible(), "logout action was missing from the account menu");
  await pageA.locator("#serverAccountSettingsButton").click();
  await pageA.locator("#systemSettingsModal").waitFor({ state: "visible" });
  check(new URL(pageA.url()).searchParams.get("settingsTab") === "account", "system settings did not open on the account page");
  check(await pageA.locator("[data-settings-nav-group][data-admin-only]").isHidden(), "normal user saw the system-management navigation group");
  check(await pageA.locator('[data-system-settings-tab="account"]:visible, [data-system-settings-tab="language"]:visible, [data-system-settings-tab="api"]:visible, [data-system-settings-tab="notifications"]:visible, [data-system-settings-tab="usage"]:visible').count() === 5, "normal user did not receive all five personal settings pages");
  await pageA.locator("#systemSettingsSearch").fill("用户管理");
  check(await pageA.locator('[data-system-settings-tab="users"]:visible').count() === 0, "normal-user settings search revealed administrator navigation");
  await pageA.locator("#systemSettingsSearch").fill("");
  await pageA.locator('#settingsPasswordForm [name="current_password"]').fill("unsaved-change");
  pageA.once("dialog", async (dialog) => dialog.dismiss());
  await pageA.locator('[data-system-settings-tab="language"]').click();
  check(await pageA.locator('[data-system-settings-panel="account"]').isVisible(), "canceling the unsaved-change warning still left the account page");
  pageA.once("dialog", async (dialog) => dialog.accept());
  await pageA.locator('[data-system-settings-tab="language"]').click();
  check(await pageA.locator('[data-system-settings-panel="language"]').isVisible(), "accepting the unsaved-change warning did not change settings page");
  check(new URL(pageA.url()).searchParams.get("settingsTab") === "language", "settings navigation did not update the address");
  await pageA.goBack();
  await eventually(async () => await pageA.locator('[data-system-settings-panel="account"]').isVisible(), "browser history did not restore the previous settings page");
  await pageA.goForward();
  await eventually(async () => await pageA.locator('[data-system-settings-panel="language"]').isVisible(), "browser history did not restore the next settings page");
  await pageA.locator("#languageSelect").selectOption("en");
  check((await pageA.locator('[data-system-settings-tab="account"]').textContent()).trim().endsWith("Account & security"), "settings navigation did not follow the language preference");
  check((await pageA.locator("#serverAccountRole").textContent()).trim() === "Standard user", "account role did not follow the language preference");
  await pageA.locator("#languageSelect").selectOption("zh-CN");
  await pageA.locator('[data-theme-option="dark"]').click();
  check(await pageA.locator("html").getAttribute("data-theme") === "dark", "theme preference did not apply immediately");
  await pageA.locator("#systemSettingsModalClose").click();
  await pageA.locator("#systemSettingsModal").waitFor({ state: "hidden" });
  check(await pageA.locator(".layout-container").isVisible(), "returning from settings did not restore the image workspace");
  const providerCatalogA = await api(pageA, "/api/providers/catalog");
  const personalProviderVersionId = providerCatalogA.body.providers.find((item) => item.provider_key === "browser-fake-provider")?.provider_version_id;
  check(personalProviderVersionId, "personal provider catalog entry was missing");
  await pageA.locator("#serverAccountButton").click();
  await pageA.locator("#serverAccountSettingsButton").click();
  await pageA.locator('[data-system-settings-tab="api"]').click();
  const personalProviderCard = pageA.locator('[data-api-provider-id]', { hasText: "Browser Fake Provider · 个人" });
  await personalProviderCard.waitFor({ state: "visible" });
  await personalProviderCard.click();
  await pageA.locator("#editApiProviderButton").click();
  await pageA.locator("#apiKey").fill("browser-user-a-private-provider-key");
  pageA.once("dialog", async (dialog) => dialog.dismiss());
  await pageA.locator('[data-system-settings-tab="usage"]').click();
  check(await pageA.locator('[data-system-settings-panel="api"]').isVisible(), "API Key draft was not protected by the unsaved-change guard");
  const personalSaveResponse = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/api-settings" && response.request().method() === "PATCH"
  ));
  await pageA.locator("#saveApiProviderEditButton").click();
  check((await personalSaveResponse).status() === 200, "personal provider UI save was rejected");
  const personalCredentialsA = await api(pageA, "/api/providers/personal");
  check(personalCredentialsA.body.credentials.some((item) => item.provider_version_id === personalProviderVersionId), "personal provider UI save did not persist the credential");
  await pageA.locator("#systemSettingsModalClose").click();

  const sharedGallery = await api(pageA, "/api/gallery");
  const sharedGalleryItem = sharedGallery.body.items.find((item) => item.scope === "shared" && item.read_only);
  check(sharedGalleryItem, "shared gallery item was not visible");
  await pageA.locator("#imageInput").setInputFiles({ name: "private-a.png", mimeType: "image/png", buffer: imageBytes });
  await pageA.locator(".add-upload-to-gallery").click();
  await pageA.locator("#galleryNameInput").fill("User A private image");
  await pageA.locator("#galleryCategoryInput").selectOption("product");
  const galleryResponsePromise = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/gallery" && response.request().method() === "POST"
  ));
  await pageA.locator("#saveToGalleryButton").click();
  const galleryResponse = await galleryResponsePromise;
  const personalUpload = await galleryResponse.json();
  check(galleryResponse.status() === 201, `personal gallery upload failed: ${JSON.stringify(personalUpload)}`);
  const privateAssetId = personalUpload.item.id;
  const privateAssetImageUrl = personalUpload.item.image_url;
  check((await api(pageA, "/api/gallery")).body.items.some((item) => item.id === privateAssetId && item.scope === "personal"), "personal gallery item was not returned");
  await pageA.locator("#galleryManageButton").click();
  await pageA.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  check((await pageA.locator("#galleryGrid").textContent()).includes("Shared browser image"), "shared gallery was not rendered in the original drawer");
  check((await pageA.locator(`[data-gallery-id="${sharedGalleryItem.id}"] .resource-scope-badge`).textContent()).trim() === "共享", "shared gallery source badge was missing");
  await pageA.locator(`[data-gallery-use="${sharedGalleryItem.id}"]`).click();
  check(await pageA.locator(`.gallery-chip[data-gallery-id="${sharedGalleryItem.id}"]`).count() === 1, "shared gallery item was not inserted into the original prompt flow");
  await pageA.locator("#clearImagesButton").click();
  await pageA.locator("#galleryManageButton").click();
  await pageA.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  await pageA.locator('[data-gallery-drawer-category="product"]').click();
  check((await pageA.locator("#galleryGrid").textContent()).includes("User A private image"), "personal gallery was not rendered in the original drawer");
  check((await pageA.locator(`[data-gallery-id="${privateAssetId}"] .resource-scope-badge`).textContent()).trim() === "个人", "personal gallery source badge was missing");
  await pageA.locator(`[data-gallery-use="${privateAssetId}"]`).click();
  check(await pageA.locator(`.gallery-chip[data-gallery-id="${privateAssetId}"]`).count() === 1, "personal gallery item was not inserted into the original prompt flow");
  await pageA.locator("#clearImagesButton").click();
  const personalSnippetResponse = await api(pageA, "/api/prompt-snippets", { method: "POST", json: { tag: "privateA", title: "Private A", content: "private user A snippet" } });
  check(personalSnippetResponse.status === 201, "personal snippet creation failed");
  const personalSnippetId = personalSnippetResponse.body.snippet.id;
  const personalTemplateResponse = await api(pageA, "/api/prompt-templates", { method: "POST", json: { title: "Private A template", content: "private user A template" } });
  check(personalTemplateResponse.status === 201, "personal template creation failed");
  const personalTemplateId = personalTemplateResponse.body.template.id;
  const sharedSnippet = (await api(pageA, "/api/prompt-snippets")).body.snippets.find((item) => item.scope === "shared");
  check(sharedSnippet, "shared snippet missing");
  check((await api(pageA, "/api/prompt-templates")).body.templates.some((item) => item.scope === "shared"), "shared template missing");
  await pageA.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkspace(pageA);
  await pageA.locator("#promptTemplateButton").click();
  await pageA.locator("#promptTemplateDrawer.open").waitFor({ state: "visible" });
  check((await pageA.locator("#promptTemplateList").textContent()).includes("Shared browser template"), "shared template was not rendered in the original template drawer");
  check((await pageA.locator("#promptTemplateList").textContent()).includes("Private A template"), "personal template was not rendered in the original template drawer");
  check((await pageA.locator('.prompt-template-card', { hasText: "Shared browser template" }).locator(".resource-scope-badge").textContent()).trim() === "共享", "shared template source badge was missing");
  check((await pageA.locator(`[data-prompt-template-id="${personalTemplateId}"] .resource-scope-badge`).textContent()).trim() === "个人", "personal template source badge was missing");
  await pageA.locator('.prompt-template-card', { hasText: "Shared browser template" }).click();
  await pageA.locator("[data-prompt-template-insert]").click();
  check((await pageA.locator("#promptEditor").textContent()).includes("shared browser template"), "shared template was not inserted through the original prompt flow");
  await pageA.locator("#promptTemplateButton").click();
  await pageA.locator("#promptTemplateDrawer.open").waitFor({ state: "visible" });
  await pageA.locator(`[data-prompt-template-id="${personalTemplateId}"]`).click();
  await pageA.locator(`[data-prompt-template-insert="${personalTemplateId}"]`).click();
  check((await pageA.locator("#promptEditor").textContent()).includes("private user A template"), "personal template was not inserted through the original prompt flow");
  await pageA.locator("#promptEditor").fill("~shared");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"]`).waitFor({ state: "visible" });
  check((await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"] .resource-scope-badge`).textContent()).trim() === "共享", "shared snippet source badge was missing");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"]`).click();
  check(await pageA.locator(`.prompt-snippet-chip[data-prompt-snippet-id="${sharedSnippet.id}"]`).count() === 1, "shared snippet was not inserted through the original prompt flow");
  await pageA.locator("#promptEditor").fill("~privateA");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"]`).waitFor({ state: "visible" });
  check((await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"] .resource-scope-badge`).textContent()).trim() === "个人", "personal snippet source badge was missing");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"]`).click();
  check(await pageA.locator(`.prompt-snippet-chip[data-prompt-snippet-id="${personalSnippetId}"]`).count() === 1, "personal snippet was not inserted through the original prompt flow");

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
  await pageA.locator('#quantityGroup [data-val="2"]').click();
  await pageA.locator("#promptEditor").fill("browser image edit with two references");
  await runFromWorkspaceUi(pageA, "/api/edit");
  const edited = await waitForTask(pageA, "browser image edit with two references", "completed");
  check(edited.mode === "edit", "image edit was submitted as generation");
  check(edited.total_count === 2 && edited.output_urls.length === 2, "original quantity control did not produce two results");
  await eventually(async () => await pageA.locator(`[data-task-id="${edited.task_id}"]`).count(), "two-output task was not rendered");
  await pageA.locator(`[data-task-id="${edited.task_id}"]`).click();
  await eventually(async () => await pageA.locator("#previewGrid img").count() >= 2, "two generated results were not rendered in the original preview");

  const failedSubmit = await submitTask(pageA, "force provider failure");
  check(failedSubmit.status === 201, "provider-failure task was not queued");
  const failed = await waitForTask(pageA, "force provider failure", "failed");
  await eventually(async () => await pageA.locator(`[data-task-id="${failed.task_id}"]`).count(), "failed task was not rendered for retry");
  await pageA.locator(`[data-task-id="${failed.task_id}"]`).click();
  const retryResponsePromise = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/tasks/${failed.task_id}/retry-failed`
    && response.request().method() === "POST"
  ));
  await pageA.locator(`[data-preview-retry-failed-task-id="${failed.task_id}"]`).click();
  const retryResponse = await retryResponsePromise;
  const retried = await retryResponse.json();
  check(retryResponse.status() === 201 && retried.task.task_id !== failed.task_id, "retry overwrote original failed task");

  const holdingSubmit = await submitTask(pageA, "hold provider for cancellation");
  check(holdingSubmit.status === 201, "holding task was not queued");
  await waitForTask(pageA, "hold provider for cancellation", "running");
  const cancelSubmit = await submitTask(pageA, "browser cancel queued task");
  check(cancelSubmit.status === 201, "cancellable task was not queued");
  const cancelTaskId = cancelSubmit.body.task.task_id;
  await eventually(async () => await pageA.locator(`[data-task-queue-delete-id="${cancelTaskId}"]`).count(), "queued task control was not rendered");
  await pageA.locator(`[data-queue-task-id="${cancelTaskId}"]`).hover();
  await pageA.locator(`[data-task-queue-delete-id="${cancelTaskId}"]`).click({ force: true });
  await pageA.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await pageA.locator("[data-confirm-popover-confirm]").click();
  const cancelled = await eventually(async () => {
    const response = await api(pageA, `/api/tasks/${cancelTaskId}`);
    return response.status === 200 && response.body.task.status === "cancelled" ? response.body.task : null;
  }, "queued task was not cancelled through the original queue control");
  check(cancelled.status === "cancelled", "queued task was not cancelled");

  await pageA.goto(`${baseUrl}/history`, { waitUntil: "domcontentloaded" });
  await pageA.locator(".history-page").waitFor({ state: "visible" });
  await eventually(async () => await pageA.locator(`[data-history-task-card-id="${edited.task_id}"]`).count(), "edited task was not shown in history UI");
  await pageA.locator(`[data-history-task-card-id="${edited.task_id}"]`).click();
  await pageA.locator(`[data-history-archive-task="${edited.task_id}"]`).waitFor({ state: "visible" });
  const archiveResponsePromise = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/tasks/${edited.task_id}/archive`
    && response.request().method() === "PATCH"
  ));
  await pageA.locator(`[data-history-archive-task="${edited.task_id}"]`).click();
  check((await archiveResponsePromise).status() === 200, "history UI archive failed");
  await pageA.locator(`[data-history-archive-task="${edited.task_id}"][data-history-archive-value="false"]`).waitFor({ state: "visible" });
  const unarchiveResponsePromise = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/tasks/${edited.task_id}/archive`
    && response.request().method() === "PATCH"
  ));
  await pageA.locator(`[data-history-archive-task="${edited.task_id}"]`).click();
  check((await unarchiveResponsePromise).status() === 200, "history UI archive restore failed");
  const zipLink = pageA.locator(`a[href^="/api/tasks/${edited.task_id}/outputs.zip"]`);
  check(await zipLink.getAttribute("download") !== null, "history UI ZIP download action was not rendered");
  while (await pageA.locator(`[data-history-output-selected-task-id="${edited.task_id}"][aria-pressed="true"]`).count()) {
    await pageA.locator(`[data-history-output-selected-task-id="${edited.task_id}"][aria-pressed="true"]`).first().evaluate((element) => element.click());
    await pageA.waitForTimeout(100);
  }
  await pageA.locator(`[data-history-delete-task="${edited.task_id}"]`).waitFor({ state: "visible" });
  await pageA.locator(`[data-history-delete-task="${edited.task_id}"]`).click();
  await pageA.locator(`[data-history-delete-task="${edited.task_id}"]`).click();
  await eventually(async () => (await api(pageA, `/api/tasks/${edited.task_id}`)).status === 404, "history UI delete failed");
  check((await api(pageA, "/api/tasks/trash")).body.tasks.some((item) => item.task_id === edited.task_id), "deleted task did not enter personal trash");
  check((await api(pageA, `/api/tasks/${edited.task_id}/restore`, { method: "POST" })).status === 200, "task restore failed");
  check((await api(pageA, `/api/tasks/${edited.task_id}/outputs/2/download`)).status === 200, "restored second output download failed");
  check((await api(pageA, `/api/tasks/${edited.task_id}/outputs.zip`)).status === 200, "restored task ZIP download failed");
  await pageA.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForWorkspace(pageA);

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
  check((await api(pageB, privateAssetImageUrl)).status === 404, "second user accessed first user's private gallery file address");
  const personalCredentialsB = await api(pageB, "/api/providers/personal");
  check(!personalCredentialsB.body.credentials.some((item) => item.provider_version_id === personalProviderVersionId), "second user saw first user's personal provider configuration");
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
  check((await adminPage.locator("#serverAccountName").textContent()).includes(credentials.admin.username), "administrator username was not shown in the sidebar account entry");
  await adminPage.locator("#serverAccountButton").click();
  await adminPage.locator("#serverAccountSettingsButton").click();
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "visible" });
  check(await adminPage.locator("[data-settings-nav-group][data-admin-only]").isVisible(), "administrator system-management navigation was not shown");
  check(await adminPage.locator('[data-settings-nav-group][data-admin-only] [data-system-settings-tab]:visible').count() === 7, "administrator did not receive all seven management pages");
  await adminPage.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "visible" });
  await eventually(
    async () => new URL(adminPage.url()).searchParams.get("settingsTab") === "users",
    "legacy /admin entry did not redirect to user management",
  );
  await eventually(async () => (await adminPage.locator("#settingsUserList").textContent()).includes(credentials.userA.username), "unified user management did not load users");
  let cancelledStatusRequests = 0;
  const countCancelledStatusRequest = (request) => {
    if (new URL(request.url()).pathname === `/api/admin/users/${userAId}/status`) cancelledStatusRequests += 1;
  };
  adminPage.on("request", countCancelledStatusRequest);
  adminPage.once("dialog", async (dialog) => dialog.dismiss());
  await adminPage.locator("#settingsUserList .settings-list-row", { hasText: credentials.userA.username }).getByRole("button", { name: "停用" }).click();
  await adminPage.waitForTimeout(300);
  adminPage.off("request", countCancelledStatusRequest);
  check(cancelledStatusRequests === 0, "canceling a high-impact confirmation still sent a status request");

  await adminPage.locator('[data-system-settings-tab="catalog"]').click();
  await eventually(async () => (await adminPage.locator("#settingsCatalogList").textContent()).includes("Browser Fake Provider"), "provider catalog settings did not load");
  await adminPage.locator('[data-system-settings-tab="department"]').click();
  await eventually(async () => (await adminPage.locator("#settingsDepartmentProviderList").textContent()).includes("Browser Fake Provider"), "department provider settings did not load");
  check((await adminPage.locator("#settingsUserQuotaList").textContent()).includes(credentials.userA.username), "per-user department quotas did not load");
  await adminPage.locator('[data-system-settings-tab="shared"]').click();
  await eventually(async () => (await adminPage.locator("#settingsSharedAssetList").textContent()).includes("Shared browser image"), "shared asset settings did not load");
  await adminPage.locator('[data-system-settings-tab="scheduler"]').click();
  await eventually(async () => Boolean((await adminPage.locator("#settingsSchedulerSummary").textContent()).trim()), "scheduler settings did not load");
  const schedulerSaveResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/admin/scheduler" && response.request().method() === "PATCH"
  ));
  await adminPage.locator("#settingsSchedulerForm").getByRole("button", { name: "保存调度设置" }).click();
  check((await schedulerSaveResponse).status() === 200, "scheduler settings save failed");
  await adminPage.locator('[data-system-settings-tab="audit"]').click();
  await eventually(async () => Boolean((await adminPage.locator("#settingsAuditList").textContent()).trim()), "audit settings did not load");
  const adminTasks = await api(adminPage, `/api/admin/users/${userAId}/tasks?limit=100`);
  check(adminTasks.status === 200 && adminTasks.body.tasks.some((item) => item.task_id === generated.task_id), "admin could not inspect user tasks");
  await adminPage.locator('[data-system-settings-tab="content"]').click();
  await adminPage.locator("#settingsContentUser").selectOption(userAId);
  await eventually(
    async () => (await adminPage.locator("#settingsContentTasks").textContent()).includes("browser image edit with two references"),
    "unified read-only content view did not render the user's generated task",
  );
  check(await adminPage.locator('[data-system-settings-panel="content"] button', { hasText: /删除|编辑|执行/ }).count() === 0, "read-only user content view exposed a mutating action");
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
  await pageB.locator("#serverAccountButton").click();
  await pageB.locator("#serverAccountMenu").waitFor({ state: "visible" });
  await pageB.locator("#serverLogoutButton").click();
  await pageB.waitForURL(/\/login(?:\?|$)/);
  await Promise.all([contextA.close(), contextB.close(), adminContext.close()]);
} finally {
  await browser.close();
}

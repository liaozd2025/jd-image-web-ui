import { chromium } from "playwright";

const baseUrl = process.env.JD_IMAGE_BROWSER_BASE_URL;
const imageBytes = Buffer.from(process.env.JD_IMAGE_BROWSER_PNG_BASE64, "base64");
const credentials = JSON.parse(process.env.JD_IMAGE_BROWSER_CREDENTIALS || "{}");
const userAId = process.env.JD_IMAGE_BROWSER_USER_A_ID;
const userBId = process.env.JD_IMAGE_BROWSER_USER_B_ID;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function settingsVisualTokens(page) {
  return await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const main = style(".system-settings-main");
    const heading = style(".system-settings-page-heading h2");
    const card = style(".settings-card");
    const control = style("#languageSelect");
    const danger = style("#settingsLogoutOtherSessions");
    return {
      mainBackground: main.backgroundColor,
      headingColor: heading.color,
      cardBorder: card.borderTopColor,
      controlBorder: control.borderTopColor,
      dangerColor: danger.color,
    };
  });
}

function checkSettingsVisualTokens(tokens, theme) {
  const invisible = new Set(["", "transparent", "rgba(0, 0, 0, 0)"]);
  check(tokens.headingColor !== tokens.mainBackground, `${theme} theme settings heading was not distinguishable`);
  check(!invisible.has(tokens.cardBorder), `${theme} theme settings card border was not distinguishable`);
  check(!invisible.has(tokens.controlBorder), `${theme} theme settings form border was not distinguishable`);
  check(tokens.dangerColor !== tokens.mainBackground, `${theme} theme danger action was not distinguishable`);
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

async function fillPromptEditorAtCaret(page, text) {
  await page.locator("#promptEditor").evaluate((editor, value) => {
    editor.focus();
    editor.textContent = value;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, text);
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

async function verifyLoginExperience(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByText("九典制药", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("图片内容生产平台", { exact: true }).waitFor({ state: "visible" });
    check(
      await page.locator(".login-brand-mark img").evaluate((image) => image.complete && image.naturalWidth > 0),
      "login brand image did not load",
    );
    await page.getByRole("heading", { name: "让灵感更快" }).waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "登录图片工作区" }).waitFor({ state: "visible" });
    check(await page.locator("#prototype-switcher, [data-variant]").count() === 0, "login page still exposed prototype controls");

    await page.evaluate(() => localStorage.setItem("codex-image-theme-preference", "light"));
    await page.reload({ waitUntil: "domcontentloaded" });
    check(await page.locator("html").getAttribute("data-theme") === "light", "login page did not apply the light preference");
    check(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme) === "light", "login page inherited dark native controls in light mode");
    await page.evaluate(() => localStorage.setItem("codex-image-theme-preference", "dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    check(await page.locator("html").getAttribute("data-theme") === "dark", "login page did not apply the dark preference");
    check(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme) === "dark", "login page did not apply dark native controls");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const mobileLayout = await page.evaluate(() => ({ scrollWidth: document.body.scrollWidth, viewportWidth: innerWidth }));
    check(mobileLayout.scrollWidth <= mobileLayout.viewportWidth, "390px login page introduced horizontal scrolling");
    check(await page.getByText("九典制药", { exact: true }).isVisible(), "login brand was hidden at 390px");
    check(await page.getByText("图片内容生产平台", { exact: true }).isVisible(), "login platform name was hidden at 390px");
    check(await page.getByRole("heading", { name: "登录图片工作区" }).isVisible(), "login form was hidden at 390px");

    await page.goto(`${baseUrl}/login?change=1`, { waitUntil: "domcontentloaded" });
    await page.locator("#password-form").waitFor({ state: "visible" });
    await eventually(
      async () => await page.locator("#current-password").evaluate((element) => element === document.activeElement),
      "direct password-change flow did not focus the current password",
    );

    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.route("**/api/auth/login", (route) => (
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "invalid credentials" }) })
    ));
    await page.locator("#login-form").getByLabel("用户名").fill("invalid-user");
    await page.locator("#login-form").getByLabel("密码").fill("invalid-password");
    await page.locator("#login-form button[type=submit]").click();
    await eventually(
      async () => (await page.locator("#login-error").textContent())?.includes("用户名或密码错误"),
      "invalid-login message was not shown",
    );
    await page.unroute("**/api/auth/login");

    await page.route("**/api/auth/login", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ detail: "rate limited" }) });
    });
    await page.locator("#login-form").getByLabel("用户名").fill("limited-user");
    await page.locator("#login-form").getByLabel("密码").fill("limited-password");
    await page.locator("#login-form button[type=submit]").click();
    check(await page.locator("#login-form button[type=submit]").isDisabled(), "login submit remained enabled while the request was pending");
    await eventually(
      async () => (await page.locator("#login-error").textContent())?.includes("尝试次数过多"),
      "login rate-limit message was not shown",
    );
    await page.unroute("**/api/auth/login");

    await page.route("**/api/auth/login", (route) => route.abort("failed"));
    await page.locator("#login-form button[type=submit]").click();
    await eventually(
      async () => (await page.locator("#login-error").textContent())?.includes("暂时无法连接服务器"),
      "login connection error was not shown",
    );
    await page.unroute("**/api/auth/login");
  } finally {
    await context.close();
  }
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
  check(
    await page.locator(".brand-logo").evaluate((image) => image.complete && image.naturalWidth > 0),
    "workspace brand image did not load",
  );
  await waitForAccount(page, account.username);
}

let modelSelectorReleaseGateCompleted = false;

async function waitForWorkspace(page) {
  for (const selector of ["#sidebar", ".dashboard", "#imageInput", "#promptEditor", "#runButton", "#imageEditorModal"]) {
    check(await page.locator(selector).count() === 1, `original workspace control missing: ${selector}`);
  }
  await eventually(
    async () => await page.locator("#runButton").isEnabled(),
    "workspace never became ready for generation",
  );
  if (modelSelectorReleaseGateCompleted) return;
  const settings = await api(page, "/api/api-settings");
  check(settings.status === 200, "provider settings were unavailable");
  check(settings.body.settings.providers.some((item) => item.provider_scope === "department" && item.name.includes("部门")), "department provider source was not distinguished");
  const departmentProviders = settings.body.settings.providers.filter((item) => item.provider_scope === "department");
  const availableModelCount = (provider) => provider.models.filter((model) => model.is_enabled).length;
  const multiModelProvider = departmentProviders.find((item) => item.provider_key === "browser-fake-provider");
  const referenceFileProvider = departmentProviders.find((item) => item.provider_key === "browser-reference-files");
  const configuredTeamProvider = departmentProviders.find((item) => item.provider_key === "browser-configured-team");
  const singleModelProvider = departmentProviders.find((item) => availableModelCount(item) === 1 && item.provider_key === "browser-single-model");
  const emptyModelProvider = departmentProviders.find((item) => availableModelCount(item) === 0);
  check(multiModelProvider && referenceFileProvider && configuredTeamProvider && singleModelProvider && emptyModelProvider, "model selector release fixtures were incomplete");
  check(configuredTeamProvider.models.every((model) => model.validation_status === "unverified"), "configured team model fixture was unexpectedly verified");
  check(singleModelProvider.model_selection_reason === "saved_unavailable_default", "disabled saved model did not fall back to the provider default");
  const catalogResponse = await api(page, "/api/generation-catalog");
  check(catalogResponse.status === 200, "generation catalog was unavailable");
  const catalog = catalogResponse.body;
  const catalogProvider = (provider) => catalog.providers.find((item) => item.id === provider.id);
  const multiCatalogProvider = catalogProvider(multiModelProvider);
  const referenceCatalogProvider = catalogProvider(referenceFileProvider);
  const configuredCatalogProvider = catalogProvider(configuredTeamProvider);
  const singleCatalogProvider = catalogProvider(singleModelProvider);
  check(multiCatalogProvider?.bindings.length === 2, "multi-model provider was not represented by two v0.7 catalog bindings");
  check(referenceCatalogProvider?.bindings.length === 2, "Responses provider was not represented by two v0.7 catalog bindings");
  check(configuredCatalogProvider?.bindings.length === 1, "unverified configured team model was hidden from the v0.7 catalog");
  check(singleCatalogProvider?.bindings.length === 1, "single-model provider was not represented in the v0.7 catalog");
  check(!catalogProvider(emptyModelProvider), "provider without an enabled model leaked into the generation catalog");

  const catalogModel = (modelId) => catalog.models.find((item) => item.id === modelId);
  const selectCatalogModel = async (modelId) => {
    const model = catalogModel(modelId);
    check(Boolean(model), `catalog model was missing: ${modelId}`);
    await page.locator(`[data-family-id="${model.family_id}"]`).click();
    const concrete = page.locator(`[data-model-id="${modelId}"]`);
    if (await concrete.count()) await concrete.click();
    await eventually(async () => await page.evaluate((targetModelId) => (
      window.__codexImageWebUI?.state?.selectedModelId === targetModelId
    ), modelId), `v0.7 model selector did not select ${modelId}`);
  };
  const selectCatalogBinding = async (provider, binding) => {
    const selectionKey = `${provider.id}::${binding.id}`;
    await eventually(async () => await page.locator(`#generationProviderSelect option[value="${selectionKey}"]`).count() === 1, `provider binding did not become selectable: ${selectionKey}`);
    await page.locator("#generationProviderSelect").selectOption(selectionKey);
  };

  const firstBinding = multiCatalogProvider.bindings[0];
  const secondBinding = multiCatalogProvider.bindings[1];
  await selectCatalogModel(firstBinding.canonical_model_id);
  await selectCatalogBinding(multiCatalogProvider, firstBinding);
  check(catalogModel(firstBinding.canonical_model_id).family_id === "gpt-image", "GPT-family release fixture was not selected");
  for (const selector of ["#sizeModeGroup", ".orientation-field", ".resolution-field", ".ratio-field", "#promptFidelityField"]) {
    check(await page.locator(selector).isVisible(), `GPT-family legacy workspace control remained hidden: ${selector}`);
  }
  check(await page.locator(`[data-family-id="${catalogModel(firstBinding.canonical_model_id).family_id}"]`).getAttribute("aria-checked") === "true", "v0.7 model family selector did not expose the active family");
  check(await page.locator("#generationProviderSelect").isEnabled(), "v0.7 provider selector was not keyboard selectable");
  await page.locator("#promptEditor").fill("preserve workspace while switching models");
  await page.locator("#imageInput").setInputFiles(Array.from({ length: 17 }, (_, index) => ({
    name: `model-switch-reference-${String(index + 1).padStart(2, "0")}.png`,
    mimeType: "image/png",
    buffer: imageBytes,
  })));
  await eventually(async () => await page.locator("#imageThumbItems .thumb").count() === 17, "all over-limit reference images were not retained");
  await eventually(async () => await page.locator(".generation-model-reference-over-limit").count() === 1, "the over-limit reference image was not marked individually");
  check(await page.locator("#runButton").isDisabled(), "over-limit reference images did not block submission");
  check((await page.locator("#generationModelNotice").textContent()).includes("最多支持 16 张参考图片"), "reference-image limit guidance was not visible");
  await page.locator("#imageThumbItems .thumb").nth(16).locator(".thumb-remove").click();
  await eventually(async () => await page.locator("#imageThumbItems .thumb").count() === 16, "removing the one over-limit image changed the wrong inputs");
  await eventually(async () => await page.locator(".generation-model-reference-over-limit").count() === 0, "over-limit marker remained after returning within the limit");
  await eventually(async () => await page.locator("#runButton").isEnabled(), "submission stayed blocked after reference images returned within the limit");
  const preservedImageTitles = await page.locator("#imageThumbItems .thumb").evaluateAll((items) => items.map((item) => item.getAttribute("title")));
  let preferenceSaved = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/generation-model-preferences" || response.request().method() !== "PUT") return false;
    try { return response.request().postDataJSON()?.generation_model_id === secondBinding.id; } catch { return false; }
  });
  await selectCatalogModel(secondBinding.canonical_model_id);
  await selectCatalogBinding(multiCatalogProvider, secondBinding);
  check(secondBinding.canonical_model_id.includes("seedream"), "Seedream release fixture was not selected");
  for (const selector of ["#sizeModeGroup", ".orientation-field", ".resolution-field", ".ratio-field", "#promptFidelityField"]) {
    check(await page.locator(selector).isVisible(), `Seedream legacy workspace control remained hidden: ${selector}`);
  }
  for (const parameterId of ["legacy.prompt_optimization_mode", "legacy.seed_mode"]) {
    check(
      await page.locator(`[data-parameter-id="${parameterId}"]`).isVisible(),
      `Seedream v0.7 supplemental parameter remained hidden: ${parameterId}`,
    );
  }
  const preferenceResponse = await preferenceSaved;
  check(preferenceResponse.status() === 200, `model selection preference was not saved on the server: ${JSON.stringify(preferenceResponse.request().postDataJSON())} ${await preferenceResponse.text()}`);
  check((await page.locator("#promptEditor").textContent()) === "preserve workspace while switching models", "switching models changed the prompt");
  await page.locator("#generationProviderSelect").focus();
  check(await page.locator("#generationProviderSelect").evaluate((element) => element === document.activeElement), "provider selector was not keyboard focusable");
  if (await page.locator("#generationProviderSettingsButton").isVisible()) {
    await page.locator("#generationProviderSettingsButton").focus();
    check(await page.locator("#generationProviderSettingsButton").evaluate((element) => element === document.activeElement), "provider settings button was not keyboard focusable");
  }

  const referenceBinding = referenceCatalogProvider.bindings[0];
  await selectCatalogModel(referenceBinding.canonical_model_id);
  await selectCatalogBinding(referenceCatalogProvider, referenceBinding);
  await page.locator("#imageInput").setInputFiles({ name: "model-switch-reference.txt", mimeType: "text/plain", buffer: Buffer.from("model switch reference file") });
  await eventually(async () => await page.locator(".reference-file-thumb").count() === 1, "model-switch reference file did not render");
  const preservedFileName = (await page.locator(".reference-file-name").textContent()).trim();
  const singleBinding = singleCatalogProvider.bindings[0];
  await selectCatalogModel(singleBinding.canonical_model_id);
  await selectCatalogBinding(singleCatalogProvider, singleBinding);
  const configuredBinding = configuredCatalogProvider.bindings[0];
  await selectCatalogModel(configuredBinding.canonical_model_id);
  await selectCatalogBinding(configuredCatalogProvider, configuredBinding);
  await eventually(async () => await page.locator("#runButton").isEnabled(), "configured team model remained blocked before validation");
  await selectCatalogModel(secondBinding.canonical_model_id);
  await selectCatalogBinding(multiCatalogProvider, secondBinding);
  check((await page.locator("#promptEditor").textContent()) === "preserve workspace while switching models", "provider switching changed the prompt");
  check(await page.locator("#imageThumbItems .thumb").count() === 16, "provider/model switching removed a reference image");
  const imageTitlesAfterSwitch = await page.locator("#imageThumbItems .thumb").evaluateAll((items) => items.map((item) => item.getAttribute("title")));
  check(JSON.stringify(imageTitlesAfterSwitch) === JSON.stringify(preservedImageTitles), "provider/model switching changed reference image order");
  check(await page.locator(".reference-file-thumb").count() === 1, "provider/model switching removed a reference file");
  check((await page.locator(".reference-file-name").textContent()).trim() === preservedFileName, "provider/model switching changed reference file order");
  await page.setViewportSize({ width: 1024, height: 900 });
  const mediumModelLayout = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const panel = document.querySelector(".output-panel");
    return {
      family: bounds("#modelFamilyOptions"),
      model: bounds(".concrete-model-field"),
      provider: bounds(".generation-provider-control"),
      promptEditor: bounds("#promptEditor"),
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
    };
  });
  check(mediumModelLayout.family.right > mediumModelLayout.family.left, "1024px v0.7 model-family controls collapsed");
  check(mediumModelLayout.provider.right > mediumModelLayout.provider.left, "1024px provider selector collapsed");
  check(mediumModelLayout.promptEditor.bottom - mediumModelLayout.promptEditor.top >= 96, "model metadata squeezed the prompt editor below its minimum height");
  check(mediumModelLayout.scrollWidth <= mediumModelLayout.clientWidth + 1, "1024px v0.7 model controls introduced horizontal scrolling");
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowModelLayout = await page.locator(".layout-container").evaluate((panel) => ({ scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth }));
  check(narrowModelLayout.scrollWidth <= narrowModelLayout.clientWidth + 1, "390px v0.7 model controls introduced horizontal scrolling");
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectCatalogModel(firstBinding.canonical_model_id);
  await selectCatalogBinding(multiCatalogProvider, firstBinding);
  await page.locator("#clearImagesButton").click();
  await page.locator("#promptEditor").fill("");
  modelSelectorReleaseGateCompleted = true;
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
  const provider = settings.body.settings.providers.find((item) => (
    item.provider_scope === "department" && item.provider_key === "browser-fake-provider"
  ));
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
  await verifyLoginExperience(browser);
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pageA = await contextA.newPage();
  pageA.on("pageerror", (error) => consoleErrors.push(`user-a pageerror: ${error.message}`));
  pageA.on("console", (message) => collectConsoleError("user-a", message));
  pageA.on("response", (response) => collectServerError("user-a", response));
  await loginAndChangePassword(pageA, credentials.userA);
  await waitForWorkspace(pageA);
  check((await pageA.locator("#serverAccountName").textContent()).includes(credentials.userA.username), "current username was not shown in the sidebar account entry");
  check((await pageA.locator("#serverAccountRole").textContent()).trim() === "普通用户", "normal user role was not shown in the sidebar account entry");
  check(await pageA.locator("#generationProviderSettingsButton").isHidden(), "normal user saw the provider settings shortcut");
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
  check(await pageA.locator('[data-system-settings-tab="account"]:visible, [data-system-settings-tab="language"]:visible, [data-system-settings-tab="notifications"]:visible, [data-system-settings-tab="usage"]:visible').count() === 4, "normal user did not receive the four first-phase personal settings pages");
  check(await pageA.locator('[data-system-settings-tab="api"]:visible, [data-system-settings-tab="catalog"]:visible').count() === 0, "normal user saw provider configuration or catalog navigation");
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
  await pageA.goBack();
  await eventually(async () => await pageA.locator('[data-system-settings-panel="account"]').isVisible(), "browser history did not return to account for discard testing");
  await pageA.locator('#settingsPasswordForm [name="current_password"]').fill("history-cancel-draft");
  pageA.once("dialog", async (dialog) => dialog.dismiss());
  await pageA.goForward();
  check(await pageA.locator('[data-system-settings-panel="account"]').isVisible(), "canceling forward navigation left the current settings page");
  check(new URL(pageA.url()).searchParams.get("settingsTab") === "account", "canceling forward navigation separated the URL from the visible settings page");
  pageA.once("dialog", async (dialog) => dialog.accept());
  await pageA.locator('[data-system-settings-tab="language"]').click();
  await pageA.locator("#languageSelect").selectOption("en");
  check((await pageA.locator('[data-system-settings-tab="account"]').textContent()).trim().endsWith("Account & security"), "settings navigation did not follow the language preference");
  check((await pageA.locator("#serverAccountRole").textContent()).trim() === "Standard user", "account role did not follow the language preference");
  await pageA.locator('[data-system-settings-tab="account"]').click();
  check((await pageA.locator('[data-system-settings-panel="account"] h2').textContent()).trim() === "Account & security", "settings page content did not follow the language preference");
  await eventually(
    async () => (await pageA.locator("#settingsSessionList").textContent()).includes("current device"),
    "dynamic settings content did not follow the language preference",
  );
  await pageA.locator('[data-system-settings-tab="language"]').click();
  await pageA.locator("#languageSelect").selectOption("zh-CN");
  const applyWorkspaceThemeAndReopenSettings = async (theme) => {
    await pageA.locator("#systemSettingsModalClose").click();
    await pageA.locator("#systemSettingsModal").waitFor({ state: "hidden" });
    await pageA.locator(`[data-theme-option="${theme}"]`).click();
    await pageA.locator("#serverAccountButton").click();
    await pageA.locator("#serverAccountSettingsButton").click();
    await pageA.locator("#systemSettingsModal").waitFor({ state: "visible" });
  };
  await applyWorkspaceThemeAndReopenSettings("dark");
  check(await pageA.locator("html").getAttribute("data-theme") === "dark", "theme preference did not apply immediately");
  checkSettingsVisualTokens(await settingsVisualTokens(pageA), "dark");
  await applyWorkspaceThemeAndReopenSettings("light");
  checkSettingsVisualTokens(await settingsVisualTokens(pageA), "light");
  await applyWorkspaceThemeAndReopenSettings("dark");
  await pageA.setViewportSize({ width: 720, height: 900 });
  const narrowLayout = await pageA.evaluate(() => {
    const shell = document.querySelector("#systemSettingsModal").getBoundingClientRect();
    const sidebar = document.querySelector(".system-settings-sidebar").getBoundingClientRect();
    const main = document.querySelector(".system-settings-main").getBoundingClientRect();
    const root = document.querySelector("#systemSettingsModal");
    return {
      shellLeft: shell.left,
      shellRight: shell.right,
      sidebarRight: sidebar.right,
      mainLeft: main.left,
      mainRight: main.right,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    };
  });
  check(narrowLayout.shellLeft >= 0 && narrowLayout.shellRight <= 721, "narrow settings shell overflowed the viewport");
  check(narrowLayout.mainLeft >= narrowLayout.sidebarRight - 1 && narrowLayout.mainRight <= 721, "narrow settings columns overlapped or overflowed");
  check(narrowLayout.scrollWidth <= narrowLayout.clientWidth + 1, "narrow settings layout introduced horizontal scrolling");
  await pageA.setViewportSize({ width: 1440, height: 900 });
  await pageA.locator('[data-system-settings-tab="account"]').click();
  await pageA.locator('#settingsPasswordForm [name="current_password"]').fill(credentials.userA.password);
  const rotatedUserAPassword = `${credentials.userA.password}-rotated`;
  await pageA.locator('#settingsPasswordForm [name="new_password"]').fill(rotatedUserAPassword);
  const passwordChangeResponse = pageA.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/auth/password" && response.request().method() === "POST"
  ));
  await pageA.locator("#settingsPasswordForm").getByRole("button", { name: "更新密码" }).click();
  check((await passwordChangeResponse).status() === 200, "password change from system settings failed");
  credentials.userA.password = rotatedUserAPassword;
  await pageA.locator("#systemSettingsModalClose").click();
  await pageA.locator("#systemSettingsModal").waitFor({ state: "hidden" });
  check(await pageA.locator(".layout-container").isVisible(), "returning from settings did not restore the image workspace");
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
  await pageA.locator("#gallerySharedManageButton").click();
  await pageA.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  check(await pageA.locator("#gallerySharedImageUploadButton").isHidden(), "normal user saw the shared gallery upload action");
  check(await pageA.locator("#galleryScopeSharedOption").evaluate((option) => option.disabled), "normal user could select the shared gallery save scope");
  await pageA.locator("#gallerySearchInput").fill("Shared browser");
  check((await pageA.locator("#galleryGrid").textContent()).includes("Shared browser image"), "shared gallery name search did not find the shared image");
  await pageA.locator('[data-gallery-scope-tab="personal"]').click();
  check(await pageA.locator("#gallerySearchInput").inputValue() === "", "shared search leaked into the personal gallery tab");
  await pageA.locator("#gallerySearchInput").fill("User A");
  await pageA.locator('[data-gallery-scope-tab="shared"]').click();
  check(await pageA.locator("#gallerySearchInput").inputValue() === "Shared browser", "shared search state was lost after switching tabs");
  const sharedReadOnlyCard = pageA.locator(`[data-gallery-id="${sharedGalleryItem.id}"]`);
  check(await sharedReadOnlyCard.locator("[data-gallery-use]").count() === 1, "normal user could not use a shared gallery image");
  check(
    await sharedReadOnlyCard.locator("[data-gallery-replace],[data-gallery-rename],[data-gallery-move],[data-gallery-note],[data-gallery-delete],[data-gallery-order-handle]").count() === 0,
    "normal user saw a shared gallery mutation action",
  );
  const forbiddenSharedUpload = await upload(
    pageA,
    "/api/shared-gallery/items",
    { name: "Forbidden shared upload", category_id: "product-images", prompt_note: "forbidden" },
    [{ field: "file", name: "forbidden-shared.png", mimeType: "image/png", bytes: imageBytes }],
  );
  check(forbiddenSharedUpload.status === 403, "normal user uploaded a shared gallery image through the API");
  check((await pageA.locator("#galleryGrid").textContent()).includes("Shared browser image"), "shared gallery was not rendered in the original drawer");
  check((await pageA.locator(`[data-gallery-id="${sharedGalleryItem.id}"] .resource-scope-badge`).textContent()).trim() === "共享", "shared gallery source badge was missing");
  await pageA.locator(`[data-gallery-use="${sharedGalleryItem.id}"]`).click();
  check(await pageA.locator(`.gallery-chip[data-gallery-id="${sharedGalleryItem.id}"]`).count() === 1, "shared gallery item was not inserted into the original prompt flow");
  await pageA.locator("#clearImagesButton").click();
  await pageA.locator("#galleryPersonalManageButton").click();
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
  await eventually(async () => {
    const templateText = await pageA.locator("#promptTemplateList").textContent();
    return templateText.includes("Shared browser template") && templateText.includes("Private A template");
  }, "shared and personal templates were not rendered in the original template drawer");
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
  await pageA.locator("#promptEditor").fill("～Private");
  await pageA.locator(`.prompt-snippet-option[data-prompt-template-id="${personalTemplateId}"]`).waitFor({ state: "visible" });
  await pageA.locator(`.prompt-snippet-option[data-prompt-template-id="${personalTemplateId}"]`).dispatchEvent("click");
  check((await pageA.locator("#promptEditor").textContent()).includes("private user A template"), "personal template was not inserted through the ~ prompt trigger");
  await pageA.locator("#promptEditor").fill("~shared");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"]`).waitFor({ state: "visible" });
  check((await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"] .resource-scope-badge`).textContent()).trim() === "共享", "shared snippet source badge was missing");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${sharedSnippet.id}"]`).dispatchEvent("click");
  check(await pageA.locator(`.prompt-snippet-chip[data-prompt-snippet-id="${sharedSnippet.id}"]`).count() === 1, "shared snippet was not inserted through the original prompt flow");
  await pageA.locator("#promptEditor").fill("~privateA");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"]`).waitFor({ state: "visible" });
  check((await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"] .resource-scope-badge`).textContent()).trim() === "个人", "personal snippet source badge was missing");
  await pageA.locator(`.prompt-snippet-option[data-prompt-snippet-id="${personalSnippetId}"]`).dispatchEvent("click");
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
  check(edited.total_count === 2 && edited.output_urls.length === 2, "restored workspace quantity control did not produce two results");
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
  await pageB.locator("#gallerySharedManageButton").click();
  await pageB.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  check(await pageB.locator("#gallerySharedImageUploadButton").isHidden(), "second normal user saw the shared gallery upload action");
  await pageB.locator("#galleryDrawerClose").click();
  const galleryB = await api(pageB, "/api/gallery");
  check(galleryB.body.items.some((item) => item.scope === "shared"), "shared gallery was not visible to second user");
  check(!galleryB.body.items.some((item) => item.id === privateAssetId), "second user saw first user's private gallery item");
  check((await api(pageB, privateAssetImageUrl)).status === 404, "second user accessed first user's private gallery file address");
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
  await adminPage.locator("#gallerySharedManageButton").click();
  await adminPage.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  check(await adminPage.locator("#gallerySharedImageUploadButton").isVisible(), "administrator did not see the shared gallery upload action");
  await adminPage.locator("#galleryCategoryManageToggle").click();
  check(await adminPage.locator('[data-gallery-category-row="uncategorized"] [data-gallery-category-name]').isDisabled(), "system uncategorized category could be renamed");
  check(await adminPage.locator("#newGalleryCategoryPromptRole").isHidden(), "personal prompt-role field leaked into shared category management");
  await adminPage.locator("#newGalleryCategoryName").fill("浏览器分类");
  const createSharedCategoryResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/categories" && response.request().method() === "POST"
  ));
  await adminPage.locator("#addGalleryCategoryButton").click();
  const createdSharedCategoryHttpResponse = await createSharedCategoryResponse;
  const createdSharedCategory = await createdSharedCategoryHttpResponse.json();
  check(createdSharedCategoryHttpResponse.status() === 201, `administrator shared category creation failed: ${JSON.stringify(createdSharedCategory)}`);
  const createdSharedCategoryId = createdSharedCategory.category.id;
  const createdSharedCategoryRow = adminPage.locator(`[data-gallery-category-row="${createdSharedCategoryId}"]`);
  await createdSharedCategoryRow.waitFor({ state: "visible" });
  await createdSharedCategoryRow.locator("[data-gallery-category-name]").fill("浏览器验收分类");
  const renameSharedCategoryResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-gallery/categories/${createdSharedCategoryId}`
    && response.request().method() === "PATCH"
  ));
  await createdSharedCategoryRow.locator("[data-gallery-category-save]").click();
  check((await renameSharedCategoryResponse).status() === 200, "administrator could not rename a shared category");
  const reorderSharedCategoryResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/categories/reorder"
    && response.request().method() === "PATCH"
  ));
  const sharedCategoryTarget = adminPage.locator('[data-gallery-category-row="uncategorized"]');
  const sharedCategoryTargetElement = await sharedCategoryTarget.elementHandle();
  await createdSharedCategoryRow.locator("[data-gallery-category-drag-handle]").evaluate((source, target) => {
    const dataTransfer = new DataTransfer();
    const rect = target.getBoundingClientRect();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      dataTransfer,
      clientX: rect.left + 1,
      clientY: rect.top + 1,
    }));
    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      dataTransfer,
      clientX: rect.left + 1,
      clientY: rect.top + 1,
    }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
  }, sharedCategoryTargetElement);
  check((await reorderSharedCategoryResponse).status() === 200, "administrator could not reorder shared categories");
  const deleteSharedCategoryResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-gallery/categories/${createdSharedCategoryId}`
    && response.request().method() === "DELETE"
  ));
  await createdSharedCategoryRow.locator("[data-gallery-category-delete]").click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await deleteSharedCategoryResponse).status() === 200, "administrator could not delete an ordinary shared category");
  await createdSharedCategoryRow.waitFor({ state: "detached" });
  await adminPage.locator('[data-gallery-drawer-category="product-images"]').click();
  const adminDrawerUploadResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/items" && response.request().method() === "POST"
  ));
  await adminPage.locator("#gallerySharedImageInput").setInputFiles({ name: "drawer-admin-image.png", mimeType: "image/png", buffer: imageBytes });
  await adminPage.locator("#sharedGalleryUploadModal").waitFor({ state: "visible" });
  await adminPage.locator('[data-shared-upload-name="0"]').fill("Drawer admin image");
  await adminPage.locator("#sharedGalleryUploadCategory").selectOption("product-images");
  await adminPage.locator("#sharedGalleryUploadSave").click();
  const adminDrawerUploadHttpResponse = await adminDrawerUploadResponse;
  const adminDrawerUpload = await adminDrawerUploadHttpResponse.json();
  check(adminDrawerUploadHttpResponse.status() === 201, `administrator shared upload failed: ${JSON.stringify(adminDrawerUpload)}`);
  const adminDrawerUploadId = `shared:${adminDrawerUpload.item.asset_id}`;
  const adminGalleryAfterUpload = await api(adminPage, "/api/gallery");
  check(
    adminGalleryAfterUpload.body.items.some((item) => item.id === adminDrawerUploadId && item.category === "product-images"),
    `administrator shared upload was not returned by the gallery API: ${JSON.stringify(adminGalleryAfterUpload.body.items)}`,
  );
  const activeSharedCategory = await adminPage.locator('[data-gallery-drawer-category].active').getAttribute("data-gallery-drawer-category");
  check(activeSharedCategory === "product-images", `shared gallery changed to the wrong category after upload: ${activeSharedCategory}`);
  const adminSharedCard = adminPage.locator(`#galleryGrid .gallery-grid-layer:not(.mode-collapsed) .gallery-card[data-gallery-id="${adminDrawerUploadId}"]`);
  await adminSharedCard.waitFor({ state: "visible" });
  check(await adminSharedCard.locator("[data-gallery-replace]").count() === 1, "administrator did not see shared image version management");
  check(await adminSharedCard.locator("[data-gallery-delete]").count() === 1, "administrator did not see shared image deactivation");
  const adminBatchUploadResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/items/batch" && response.request().method() === "POST"
  ));
  await adminPage.locator("#galleryBatchUploadInput").setInputFiles([
    { name: "batch-conflict.png", mimeType: "image/png", buffer: imageBytes },
    { name: "batch-created.png", mimeType: "image/png", buffer: imageBytes },
  ]);
  await adminPage.locator("#sharedGalleryUploadModal").waitFor({ state: "visible" });
  await adminPage.locator('[data-shared-upload-name="0"]').fill("Drawer admin image");
  await adminPage.locator('[data-shared-upload-name="1"]').fill("Browser batch image");
  await adminPage.locator("#sharedGalleryUploadCategory").selectOption("product-images");
  await adminPage.locator("#sharedGalleryUploadSave").click();
  const adminBatchUploadHttpResponse = await adminBatchUploadResponse;
  check(adminBatchUploadHttpResponse.status() === 207, "administrator batch upload did not return per-file results");
  await adminPage.locator('[data-shared-upload-result="0"].is-error').waitFor({ state: "visible" });
  await adminPage.locator('[data-shared-upload-result="1"].is-success').waitFor({ state: "visible" });
  check(await adminPage.locator('[data-shared-upload-result="0"].is-error').isVisible(), "batch name conflict was not shown beside its file");
  check(await adminPage.locator('[data-shared-upload-result="1"].is-success').isVisible(), "batch success was not shown beside its file");
  check(await adminPage.locator("#sharedGalleryUploadSave").isDisabled(), "completed partial batch could be submitted twice");
  await adminPage.locator("#sharedGalleryUploadClose").click();
  await eventually(
    async () => (await adminPage.locator("#galleryGrid").textContent()).includes("Browser batch image"),
    "successful batch image was not rendered in the shared gallery",
  );
  const adminBatchCard = adminPage.locator("#galleryGrid .gallery-grid-layer:not(.mode-collapsed) .gallery-card", { hasText: "Browser batch image" });
  await adminBatchCard.waitFor({ state: "visible" });
  const reorderCards = adminPage.locator("#galleryGrid .gallery-grid-layer:not(.mode-collapsed) .gallery-card[data-gallery-id]");
  check(await reorderCards.count() > 1, "shared image reorder fixture did not contain multiple cards");
  const reorderSourceHandle = reorderCards.first().locator("[data-gallery-order-handle]");
  const reorderTargetCard = reorderCards.last();
  const reorderTargetElement = await reorderTargetCard.elementHandle();
  const reorderSharedItemsResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/items/reorder"
    && response.request().method() === "PATCH"
  ));
  await reorderSourceHandle.evaluate((source, target) => {
    const dataTransfer = new DataTransfer();
    const rect = target.getBoundingClientRect();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      dataTransfer,
      clientX: rect.right - 1,
      clientY: rect.bottom - 1,
    }));
    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      dataTransfer,
      clientX: rect.right - 1,
      clientY: rect.bottom - 1,
    }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
  }, reorderTargetElement);
  check((await reorderSharedItemsResponse).status() === 200, "administrator could not reorder shared images");
  const moveSharedItemResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-gallery/items/${adminDrawerUpload.item.asset_id}`
    && response.request().method() === "PATCH"
  ));
  await adminSharedCard.locator("[data-gallery-move]").click();
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-category]").selectOption("brand-assets");
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-save]").click();
  check((await moveSharedItemResponse).status() === 200, "administrator could not move a shared image to another category");
  await adminPage.locator(".gallery-edit-popover").waitFor({ state: "hidden" });
  await adminPage.locator('[data-gallery-drawer-category="brand-assets"]').click();
  await adminSharedCard.waitFor({ state: "visible" });
  const noteSharedItemResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-gallery/items/${adminDrawerUpload.item.asset_id}`
    && response.request().method() === "PATCH"
  ));
  await adminSharedCard.locator("[data-gallery-note]").click();
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-prompt-note]").fill("Browser managed shared note");
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-save]").click();
  check((await noteSharedItemResponse).status() === 200, "administrator could not edit a shared image note");
  await adminPage.locator(".gallery-edit-popover").waitFor({ state: "hidden" });
  const renameSharedItemResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-gallery/items/${adminDrawerUpload.item.asset_id}`
    && response.request().method() === "PATCH"
  ));
  await adminSharedCard.locator("[data-gallery-rename]").click();
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-name]").fill("User A private image");
  await adminPage.locator(".gallery-edit-popover:not(.hidden) [data-gallery-edit-save]").click();
  check((await renameSharedItemResponse).status() === 200, "administrator could not rename a shared image");
  await adminPage.locator(".gallery-edit-popover").waitFor({ state: "hidden" });
  await adminSharedCard.waitFor({ state: "visible" });
  const replacementResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-assets/${adminDrawerUpload.item.asset_id}/versions`
    && response.request().method() === "POST"
  ));
  const replacementChooser = adminPage.waitForEvent("filechooser");
  await adminSharedCard.locator("[data-gallery-replace]").click();
  await (await replacementChooser).setFiles({ name: "drawer-admin-image-v2.png", mimeType: "image/png", buffer: imageBytes });
  const replacementHttpResponse = await replacementResponse;
  const replacementPayload = await replacementHttpResponse.json();
  check(replacementHttpResponse.status() === 201, "administrator could not create a shared image version");
  const replacementVersionId = replacementPayload.asset.current_version_id;
  await adminSharedCard.waitFor({ state: "visible" });
  const deactivateDrawerSharedResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname.startsWith("/api/gallery/shared")
    && response.request().method() === "DELETE"
  ));
  await adminSharedCard.locator("[data-gallery-delete]").click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await deactivateDrawerSharedResponse).status() === 200, "administrator could not deactivate a shared image from the gallery drawer");
  const inactiveSharedItemsResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/items"
    && new URL(response.url()).searchParams.get("status") === "inactive"
    && response.request().method() === "GET"
  ));
  await adminPage.locator("#galleryInactiveToggle").check();
  check((await inactiveSharedItemsResponse).status() === 200, "administrator could not view inactive shared images");
  await adminSharedCard.locator("[data-gallery-restore]").waitFor({ state: "visible" });
  const restoreDrawerSharedResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-assets/${adminDrawerUpload.item.asset_id}/status`
    && response.request().method() === "PATCH"
  ));
  await adminSharedCard.locator("[data-gallery-restore]").click();
  check((await restoreDrawerSharedResponse).status() === 200, "administrator could not restore a shared image from the gallery drawer");
  await adminPage.locator("#galleryInactiveToggle").uncheck();
  await adminPage.locator('[data-gallery-drawer-category="brand-assets"]').click();
  await adminSharedCard.waitFor({ state: "visible" });
  await adminSharedCard.locator("[data-gallery-use]").click();
  check(await adminPage.locator(`.gallery-chip[data-gallery-id="${adminDrawerUploadId}"]`).count() === 1, "administrator could not use the shared image after replacing it");
  await adminPage.locator("#clearImagesButton").click();

  await pageA.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkspace(pageA);
  await eventually(async () => {
    const items = (await api(pageA, "/api/gallery")).body.items || [];
    return items.some((item) => item.id === privateAssetId && item.name === "User A private image" && item.asset_version_id === personalUpload.item.asset_version_id)
      && items.some((item) => item.id === adminDrawerUploadId && item.name === "User A private image" && item.asset_version_id === replacementVersionId);
  }, "same-name personal and shared gallery versions were not available after reload");
  await pageA.locator("#galleryPersonalManageButton").click();
  await pageA.locator("#galleryDrawer.open").waitFor({ state: "visible" });
  await pageA.locator('[data-gallery-drawer-category="product"]').click();
  await pageA.locator(`#galleryGrid .gallery-grid-layer:not(.mode-collapsed) .gallery-card[data-gallery-id="${privateAssetId}"]`).waitFor({ state: "visible" });
  await pageA.locator('[data-gallery-scope-tab="shared"]').click();
  await pageA.locator('[data-gallery-drawer-category="brand-assets"]').click();
  await pageA.locator(`#galleryGrid .gallery-grid-layer:not(.mode-collapsed) .gallery-card[data-gallery-id="${adminDrawerUploadId}"]`).waitFor({ state: "visible" });
  await pageA.locator("#galleryDrawerClose").click();
  await fillPromptEditorAtCaret(pageA, "@User");
  const personalSameNameSuggestion = pageA.locator(`.mention-option[data-mention-id="${privateAssetId}"]`);
  const sharedSameNameSuggestion = pageA.locator(`.mention-option[data-mention-id="${adminDrawerUploadId}"]`);
  await personalSameNameSuggestion.waitFor({ state: "visible" });
  await sharedSameNameSuggestion.waitFor({ state: "visible" });
  check((await personalSameNameSuggestion.locator(".resource-scope-badge").textContent()).trim() === "个人", "same-name personal @ suggestion lost its scope");
  check((await sharedSameNameSuggestion.locator(".resource-scope-badge").textContent()).trim() === "共享", "same-name shared @ suggestion lost its scope");
  check(await personalSameNameSuggestion.getAttribute("data-mention-version-id") === personalUpload.item.asset_version_id, "personal @ suggestion referenced the wrong version");
  check(await sharedSameNameSuggestion.getAttribute("data-mention-version-id") === replacementVersionId, "shared @ suggestion referenced the wrong version");
  await personalSameNameSuggestion.click();
  const personalSameNameChip = pageA.locator(`.gallery-chip[data-gallery-id="${privateAssetId}"]`);
  check(await personalSameNameChip.getAttribute("data-gallery-scope") === "personal", "personal same-name selection resolved to the wrong gallery");
  check(await personalSameNameChip.getAttribute("data-gallery-asset-version-id") === personalUpload.item.asset_version_id, "personal same-name selection resolved to the wrong version");
  await personalSameNameChip.locator("[data-remove-gallery-chip]").click();
  await fillPromptEditorAtCaret(pageA, "@User");
  await sharedSameNameSuggestion.waitFor({ state: "visible" });
  await sharedSameNameSuggestion.click();
  const sharedSameNameChip = pageA.locator(`.gallery-chip[data-gallery-id="${adminDrawerUploadId}"]`);
  check(await sharedSameNameChip.getAttribute("data-gallery-scope") === "shared", "shared same-name selection resolved to the wrong gallery");
  check(await sharedSameNameChip.getAttribute("data-gallery-asset-version-id") === replacementVersionId, "shared same-name selection resolved to the wrong version");
  await sharedSameNameChip.locator("[data-remove-gallery-chip]").click();
  await pageA.locator("#promptEditor").fill("");

  await adminPage.locator("#imageInput").setInputFiles({ name: "shared-contribution.png", mimeType: "image/png", buffer: imageBytes });
  await adminPage.locator(".add-upload-to-gallery").click();
  check(!await adminPage.locator("#galleryScopeSharedOption").evaluate((option) => option.disabled), "administrator could not select the shared gallery save scope");
  await adminPage.locator("#galleryNameInput").fill("Shared gallery contribution");
  await adminPage.locator("#galleryScopeInput").selectOption("shared");
  check(!await adminPage.locator("#galleryCategoryField").evaluate((field) => field.classList.contains("hidden")), "shared gallery category was hidden from an administrator");
  check(!await adminPage.locator("#galleryPromptNoteField").evaluate((field) => field.classList.contains("hidden")), "shared gallery note was hidden from an administrator");
  await adminPage.locator("#galleryCategoryInput").selectOption("brand-assets");
  const sharedContributionResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/shared-gallery/items" && response.request().method() === "POST"
  ));
  await adminPage.locator("#saveToGalleryButton").click();
  const sharedContributionHttpResponse = await sharedContributionResponse;
  const sharedContribution = await sharedContributionHttpResponse.json();
  check(sharedContributionHttpResponse.status() === 201, `administrator shared contribution failed: ${JSON.stringify(sharedContribution)}`);
  const sharedContributionId = `shared:${sharedContribution.item.asset_id}`;
  await eventually(
    async () => (
      await adminPage.locator('.gallery-thumb[title="Shared gallery contribution"]').count() === 1
      && await adminPage.locator("#addToGalleryModal").evaluate((modal) => modal.classList.contains("hidden"))
    ),
    "administrator shared gallery contribution did not replace the uploaded image input",
  );
  check((await api(pageB, "/api/gallery")).body.items.some((item) => item.id === sharedContributionId), "normal user could not read an administrator-created shared image");
  await adminPage.locator("#clearImagesButton").click();
  await adminPage.locator("#serverAccountButton").click();
  await adminPage.locator("#serverAccountSettingsButton").click();
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "visible" });
  check(await adminPage.locator("[data-settings-nav-group][data-admin-only]").isVisible(), "administrator system-management navigation was not shown");
  check(await adminPage.locator('[data-settings-nav-group][data-admin-only] [data-system-settings-tab]:visible').count() === 7, "administrator did not receive all seven management pages");
  check(await adminPage.locator("#generationProviderSettingsButton").isVisible(), "administrator provider settings shortcut was hidden");
  await adminPage.locator('[data-system-settings-tab="catalog"]').click();
  check(await adminPage.locator("#toggleApiProviderStatusButton").isVisible(), "unified provider catalog did not expose provider enable or disable");
  const deleteFixtureResponse = await api(adminPage, "/api/admin/provider-catalog", {
    method: "POST",
    json: {
      provider_key: `browser-delete-${Date.now()}`,
      display_name: "Browser Delete Provider",
      base_url: "https://browser-delete.invalid/v1",
      api_mode: "images",
      models: [{
        model_id: "browser-delete-image",
        capabilities: ["image_generation", "image_input"],
      }],
      parameter_constraints: {},
    },
  });
  check(deleteFixtureResponse.status === 201, `provider delete fixture could not be created: ${JSON.stringify(deleteFixtureResponse.body)}`);
  const deleteFixtureId = deleteFixtureResponse.body.provider.provider_version_id;
  await adminPage.evaluate(async () => {
    await window.__codexImageWebUI?.methods?.refreshApiSettings?.();
  });
  const deleteFixtureCard = adminPage.locator(`[data-api-provider-id="department-${deleteFixtureId}"]`);
  await deleteFixtureCard.waitFor({ state: "visible" });
  await deleteFixtureCard.click();
  check(await adminPage.locator("#deleteApiProviderButton").isVisible(), "server provider catalog did not expose soft delete");
  let providerDeleteRequests = 0;
  await adminPage.route(`**/api/admin/provider-catalog/${deleteFixtureId}`, async (route) => {
    if (route.request().method() === "DELETE") providerDeleteRequests += 1;
    await route.continue();
  });
  await adminPage.locator("#deleteApiProviderButton").click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-cancel]").click();
  await adminPage.waitForTimeout(100);
  check(providerDeleteRequests === 0, "cancelling provider deletion still sent a delete request");
  const providerDeleteResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/provider-catalog/${deleteFixtureId}`
      && response.request().method() === "DELETE"
  ));
  await adminPage.locator("#deleteApiProviderButton").click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await providerDeleteResponse).status() === 200, "provider soft delete request failed");
  await eventually(async () => {
    const browserState = await adminPage.evaluate((providerId) => ({
      providerIds: (window.__codexImageWebUI?.state?.apiSettings?.providers || []).map((item) => item.provider_version_id),
      catalogText: document.querySelector("#apiProviderList")?.textContent || "",
      matchingCards: document.querySelectorAll(`[data-api-provider-id="department-${providerId}"]`).length,
    }), deleteFixtureId);
    const serverCatalog = await api(adminPage, "/api/admin/provider-catalog");
    const serverIds = (serverCatalog.body.providers || []).map((item) => item.provider_version_id);
    if (browserState.matchingCards || browserState.providerIds.includes(deleteFixtureId) || serverIds.includes(deleteFixtureId)) {
      throw new Error(JSON.stringify({ browserState, serverIds }));
    }
    return true;
  }, "deleted provider remained in the catalog");
  check(providerDeleteRequests === 1, "provider soft delete sent more than one request");
  await adminPage.unroute(`**/api/admin/provider-catalog/${deleteFixtureId}`);
  const adminProviderCard = adminPage.locator('[data-api-provider-id]:not([aria-selected="true"])').first();
  await adminProviderCard.waitFor({ state: "visible" });
  let releaseProviderAutosave;
  let markProviderAutosaveStarted;
  const providerAutosaveRelease = new Promise((resolve) => { releaseProviderAutosave = resolve; });
  const providerAutosaveStarted = new Promise((resolve) => { markProviderAutosaveStarted = resolve; });
  const providerAutosaveSettings = (await api(adminPage, "/api/api-settings")).body.settings;
  await adminPage.route("**/api/api-settings", async (route) => {
    if (route.request().method() === "PATCH") {
      markProviderAutosaveStarted();
      await providerAutosaveRelease;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: providerAutosaveSettings }),
      });
      return;
    }
    await route.continue();
  });
  await adminProviderCard.click();
  await providerAutosaveStarted;
  await adminPage.locator("#editApiProviderButton").click();
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "visible" });
  const providerAutosaveResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/api-settings" && response.request().method() === "PATCH"
  ));
  releaseProviderAutosave();
  const providerAutosaveHttpResponse = await providerAutosaveResponse;
  check(
    providerAutosaveHttpResponse.status() === 200,
    `provider selection autosave failed: ${providerAutosaveHttpResponse.status()} ${await providerAutosaveHttpResponse.text()}`,
  );
  await eventually(async () => await adminPage.evaluate(() => Boolean(
    window.__codexImageWebUI?.state?.apiProviderEditingId
      && window.__codexImageWebUI?.state?.apiProviderDraft
      && !document.querySelector("#apiProviderEditor")?.classList.contains("hidden")
  )), "an in-flight provider autosave discarded the newly opened editor");
  await adminPage.unroute("**/api/api-settings");
  await adminPage.locator("#cancelApiProviderEditButton").click();
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "hidden" });
  await adminPage.locator("#copyApiProviderButton").click();
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "visible" });
  await adminPage.locator("#cancelApiProviderEditButton").click();
  await adminPage.locator("#addApiProviderButton").click();
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "visible" });
  const newProviderBindingCount = await adminPage.locator("#apiProviderBindings [data-binding-id]").count();
  await adminPage.locator("#addProviderBindingButton").click();
  await eventually(
    async () => await adminPage.locator("#apiProviderBindings [data-binding-id]").count() === newProviderBindingCount + 1,
    "adding a catalog model binding did not change the provider draft",
  );
  await adminPage.locator("#cancelApiProviderEditButton").click();
  await adminPage.locator("#addApiProviderButton").click();
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "visible" });
  const browserCreatedProviderName = `Browser Created Provider ${Date.now()}`;
  await adminPage.locator("#apiProviderName").fill(browserCreatedProviderName);
  await adminPage.locator("#apiKey").fill("browser-created-provider-secret-1234");
  const browserCreateResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/admin/provider-catalog"
      && response.request().method() === "POST"
  ));
  await adminPage.locator("#saveApiProviderEditButton").click();
  const browserCreatedHttpResponse = await browserCreateResponse;
  check(
    browserCreatedHttpResponse.status() === 201,
    `new provider UI did not use POST successfully: ${browserCreatedHttpResponse.status()} ${await browserCreatedHttpResponse.text()}`,
  );
  await adminPage.locator("#apiProviderEditor").waitFor({ state: "hidden" });
  const browserCreatedCatalog = await api(adminPage, "/api/admin/provider-catalog");
  const browserCreatedProvider = browserCreatedCatalog.body.providers.find(
    (provider) => provider.display_name === browserCreatedProviderName,
  );
  check(Boolean(browserCreatedProvider?.provider_version_id), "new provider UI did not persist the provider");
  const browserCreatedCleanup = await api(
    adminPage,
    `/api/admin/provider-catalog/${browserCreatedProvider.provider_version_id}`,
    { method: "DELETE" },
  );
  check(browserCreatedCleanup.status === 200, "browser-created provider cleanup failed");
  await adminPage.locator("#sortApiProvidersButton").click();
  check(await adminPage.locator("#apiProviderList .api-provider-sort-row").count() > 1, "provider sort action did not expose sortable rows");
  await adminPage.locator("#sortApiProvidersButton").click();
  check(await adminPage.locator("#apiProviderList .api-provider-choice").count() > 1, "provider sort action did not return to provider choices");
  await adminPage.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "visible" });
  await eventually(
    async () => new URL(adminPage.url()).searchParams.get("settingsTab") === "users",
    "legacy /admin entry did not redirect to user management",
  );
  await eventually(async () => (await adminPage.locator("#settingsUserList").textContent()).includes(credentials.userA.username), "unified user management did not load users");
  const userARow = adminPage.locator("#settingsUserList .settings-list-row", { hasText: credentials.userA.username });
  const userBRow = adminPage.locator("#settingsUserList .settings-list-row", { hasText: credentials.userB.username });
  let cancelledStatusRequests = 0;
  const countCancelledStatusRequest = (request) => {
    if (new URL(request.url()).pathname === `/api/admin/users/${userAId}/status`) cancelledStatusRequests += 1;
  };
  adminPage.on("request", countCancelledStatusRequest);
  await userARow.getByRole("button", { name: "停用" }).click();
  const deactivatePopover = adminPage.locator(".confirm-popover:not(.hidden)");
  await deactivatePopover.waitFor({ state: "visible" });
  check(await deactivatePopover.locator(".confirm-popover-title").textContent() === "停用用户？", "deactivation confirmation did not use the requested popover title");
  check((await deactivatePopover.locator(".confirm-popover-message").textContent()).includes(credentials.userA.username), "deactivation confirmation did not identify the target user");
  await deactivatePopover.locator("[data-confirm-popover-cancel]").click();
  await deactivatePopover.waitFor({ state: "hidden" });
  await adminPage.waitForTimeout(300);
  adminPage.off("request", countCancelledStatusRequest);
  check(cancelledStatusRequests === 0, "canceling a high-impact confirmation still sent a status request");
  let cancelledResetRequests = 0;
  const countCancelledResetRequest = (request) => {
    if (new URL(request.url()).pathname === `/api/admin/users/${userAId}/reset-password`) cancelledResetRequests += 1;
  };
  adminPage.on("request", countCancelledResetRequest);
  await userARow.getByRole("button", { name: "重置密码" }).click();
  const resetPopover = adminPage.locator(".confirm-popover:not(.hidden)");
  await resetPopover.waitFor({ state: "visible" });
  check(await resetPopover.locator(".confirm-popover-title").textContent() === "重置密码？", "password reset confirmation did not use the requested popover title");
  check((await resetPopover.locator(".confirm-popover-message").textContent()).includes(credentials.userA.username), "password reset confirmation did not identify the target user");
  await resetPopover.locator("[data-confirm-popover-cancel]").click();
  await resetPopover.waitFor({ state: "hidden" });
  await adminPage.waitForTimeout(300);
  adminPage.off("request", countCancelledResetRequest);
  check(cancelledResetRequests === 0, "canceling password reset still sent a reset request");
  await adminPage.locator('#settingsCreateUserForm [name="username"]').fill("unsaved-user-draft");
  const storageQuotaResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/users/${userAId}/storage-quota` && response.request().method() === "PATCH"
  ));
  await userBRow.locator('input[type="number"]').fill("96");
  await userARow.locator('input[type="number"]').fill("64");
  await userARow.getByRole("button", { name: "保存存储" }).click();
  check((await storageQuotaResponse).status() === 200, "saving one dynamic settings draft failed");
  check(
    await adminPage.locator("#settingsUserList .settings-list-row", { hasText: credentials.userB.username }).locator('input[type="number"]').inputValue() === "96",
    "saving one dynamic draft discarded another dynamic draft",
  );
  adminPage.once("dialog", async (dialog) => dialog.dismiss());
  await adminPage.locator('[data-system-settings-tab="catalog"]').click();
  check(await adminPage.locator('[data-system-settings-panel="users"]').isVisible(), "saving one draft cleared another unsaved settings guard");
  check(await adminPage.locator('#settingsCreateUserForm [name="username"]').inputValue() === "unsaved-user-draft", "saving one draft discarded another draft");
  adminPage.once("dialog", async (dialog) => dialog.accept());
  await adminPage.locator('[data-system-settings-tab="catalog"]').click();
  await eventually(async () => (await adminPage.locator("#apiProviderList").textContent()).includes("Browser Fake Provider"), "unified provider catalog settings did not load");
  await adminPage.locator('[data-system-settings-tab="department"]').click();
  check(await adminPage.locator("#settingsDepartmentProviderList").count() === 0, "department quota page still exposed duplicate provider credential management");
  await eventually(async () => (await adminPage.locator("#settingsUserQuotaList").textContent()).includes(credentials.userA.username), "per-user department quotas did not load");
  await adminPage.locator('[data-system-settings-tab="shared"]').click();
  await adminPage.locator("#settingsSharedStatus").selectOption("all");
  await eventually(async () => (await adminPage.locator("#settingsSharedAssetGrid").textContent()).includes("Shared browser image"), "paginated shared asset cards did not load");
  check((await adminPage.locator("#settingsSharedStorageSummary").textContent()).includes("不设限制"), "shared storage still exposed a product quota");
  check(await adminPage.locator("#settingsSharedQuotaForm").count() === 0, "shared storage quota form still existed");
  const sharedSettingsRow = adminPage.locator("#settingsSharedAssetGrid .settings-content-card", { hasText: "Shared gallery contribution" });
  await sharedSettingsRow.waitFor({ state: "visible" });
  await sharedSettingsRow.getByRole("button", { name: "使用" }).click();
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "hidden" });
  check(await adminPage.locator(`.gallery-chip[data-gallery-id="${sharedContributionId}"]`).count() === 1, "shared settings Use action did not add the image input");
  await adminPage.locator("#clearImagesButton").click();
  await adminPage.locator("#serverAccountButton").click();
  await adminPage.locator("#serverAccountSettingsButton").click();
  await adminPage.locator("#systemSettingsModal").waitFor({ state: "visible" });
  await adminPage.locator('[data-system-settings-tab="shared"]').click();
  const sharedContributionSettingsRow = adminPage.locator("#settingsSharedAssetGrid .settings-content-card", { hasText: "Shared gallery contribution" });
  await sharedContributionSettingsRow.waitFor({ state: "visible" });
  const deactivateSharedResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-assets/${sharedContribution.item.asset_id}/status`
    && response.request().method() === "PATCH"
  ));
  adminPage.once("dialog", async (dialog) => dialog.accept());
  await sharedContributionSettingsRow.getByRole("button", { name: "停用" }).click();
  check((await deactivateSharedResponse).status() === 200, "administrator could not deactivate a shared image");
  await eventually(
    async () => await sharedContributionSettingsRow.getByRole("button", { name: "恢复" }).isVisible(),
    "deactivated shared image did not expose restore",
  );
  const restoreSharedResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/shared-assets/${sharedContribution.item.asset_id}/status`
    && response.request().method() === "PATCH"
  ));
  adminPage.once("dialog", async (dialog) => dialog.accept());
  await sharedContributionSettingsRow.getByRole("button", { name: "恢复" }).click();
  check((await restoreSharedResponse).status() === 200, "administrator could not restore a shared image");
  await eventually(
    async () => await sharedContributionSettingsRow.getByRole("button", { name: "停用" }).isVisible(),
    "restored shared image did not return to the active state",
  );
  await adminPage.locator('[data-system-settings-tab="scheduler"]').click();
  await eventually(async () => Boolean((await adminPage.locator("#settingsSchedulerSummary").textContent()).trim()), "scheduler settings did not load");
  await eventually(async () => Boolean((await adminPage.locator("#settingsSchedulerBlocked").textContent()).trim()), "scheduler blocked details did not load");
  check((await adminPage.locator('[data-system-settings-panel="scheduler"]').textContent()).includes("用户队列"), "scheduler user queue details were missing");
  const schedulerSaveResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/admin/scheduler" && response.request().method() === "PATCH"
  ));
  await adminPage.locator("#settingsSchedulerForm").getByRole("button", { name: "保存调度设置" }).click();
  check((await schedulerSaveResponse).status() === 200, "scheduler settings save failed");
  await adminPage.locator('[data-system-settings-tab="audit"]').click();
  await eventually(async () => Boolean((await adminPage.locator("#settingsAuditList").textContent()).trim()), "audit settings did not load");
  const adminTasks = await api(adminPage, `/api/admin/users/${userAId}/tasks?page=1&page_size=20`);
  check(adminTasks.status === 200 && adminTasks.body.pagination.page_size === 20 && adminTasks.body.tasks.some((item) => item.task_id === generated.task_id), "admin could not inspect paginated user tasks");
  check((await api(pageA, `/api/admin/users/${userAId}/tasks?page=1&page_size=20`)).status === 403, "ordinary user reached the administrator task page");
  const generatedAdminTask = adminTasks.body.tasks.find((item) => item.task_id === generated.task_id);
  const protectedTaskThumbnail = generatedAdminTask?.outputs?.find((output) => output.thumbnail_url)?.thumbnail_url;
  check(Boolean(protectedTaskThumbnail), "completed task did not expose an administrator thumbnail");
  check((await api(pageB, protectedTaskThumbnail)).status === 403, "ordinary user reached another user's administrator task thumbnail");
  const artifactAuditBefore = (await api(adminPage, `/api/admin/audit?subject_user_id=${userAId}&limit=200`)).body.events
    .filter((event) => event.action === "admin.view_user_task_artifact").length;
  check((await api(adminPage, protectedTaskThumbnail)).status === 200, "administrator task thumbnail was unavailable");
  const artifactAuditAfter = (await api(adminPage, `/api/admin/audit?subject_user_id=${userAId}&limit=200`)).body.events
    .filter((event) => event.action === "admin.view_user_task_artifact").length;
  check(artifactAuditAfter === artifactAuditBefore, "thumbnail request created a per-image audit event");
  await adminPage.locator('[data-system-settings-tab="content"]').click();
  await adminPage.locator("#settingsContentUser").selectOption(userAId);
  await eventually(
    async () => (await adminPage.locator("#settingsContentTasksGrid").textContent()).includes("browser image edit with two references"),
    "unified read-only content view did not render the user's paginated generated task",
  );
  check(await adminPage.locator('[data-system-settings-panel="content"] button', { hasText: /删除|编辑|执行/ }).count() === 0, "read-only user content view exposed a mutating action");
  const generatedCard = adminPage.locator("#settingsContentTasksGrid .settings-content-card", { hasText: "browser image edit with two references" });
  await generatedCard.click();
  await adminPage.locator("#settingsContentPreview").waitFor({ state: "visible" });
  await eventually(
    async () => (await adminPage.locator("#settingsContentPreviewBody").textContent()).includes("browser image edit with two references"),
    "task read-only preview omitted the prompt",
  );
  check(await adminPage.locator("#settingsContentPreview button", { hasText: /下载|删除|编辑/ }).count() === 0, "task read-only preview exposed a mutating or download action");
  await adminPage.locator("#settingsContentPreviewClose").click();
  check(await generatedCard.evaluate((card) => card === document.activeElement), "closing task preview did not restore card focus");
  await adminPage.locator("#settingsContentAssetsTab").click();
  await eventually(
    async () => (await adminPage.locator("#settingsContentAssetsGrid").textContent()).includes("User A private image"),
    "unified read-only content view did not render the user's personal asset",
  );
  const adminAssets = await api(adminPage, `/api/admin/users/${userAId}/assets?page=1&page_size=20&kind=image`);
  const protectedAssetThumbnail = adminAssets.body.assets.find((asset) => asset.name === "User A private image")?.thumbnail_url;
  check(Boolean(protectedAssetThumbnail), "personal image did not expose an administrator thumbnail");
  check((await api(pageB, protectedAssetThumbnail)).status === 403, "ordinary user reached another user's administrator asset thumbnail");
  check((await api(pageB, `/api/admin/shared-assets/${sharedContribution.item.asset_id}/preview`)).status === 403, "ordinary user reached an administrator shared preview");
  const personalAssetCard = adminPage.locator("#settingsContentAssetsGrid .settings-content-card", {
    has: adminPage.locator(".settings-content-card-title", { hasText: /^User A private image$/ }),
  });
  await personalAssetCard.click();
  await adminPage.locator("#settingsContentPreview").waitFor({ state: "visible" });
  await eventually(
    async () => (await adminPage.locator("#settingsContentPreviewTitle").textContent()).includes("User A private image"),
    "asset read-only preview omitted its name",
  );
  await adminPage.locator("#settingsContentPreviewClose").click();
  check(await personalAssetCard.evaluate((card) => card === document.activeElement), "closing asset preview did not restore card focus");
  check(await adminPage.locator("#settingsContentAssetsTab").getAttribute("aria-selected") === "true", "closing the preview lost the selected content tab");
  await adminPage.setViewportSize({ width: 390, height: 844 });
  const contentMobileLayout = await adminPage.evaluate(() => {
    const root = document.querySelector("#systemSettingsModal");
    const grid = document.querySelector("#settingsContentAssetsGrid");
    return { rootScrollWidth: root.scrollWidth, rootWidth: root.clientWidth, gridRight: grid.getBoundingClientRect().right, viewportWidth: innerWidth };
  });
  check(contentMobileLayout.rootScrollWidth <= contentMobileLayout.rootWidth + 1 && contentMobileLayout.gridRight <= contentMobileLayout.viewportWidth + 1, "390px content review introduced horizontal scrolling");
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  const audit = await api(adminPage, `/api/admin/audit?subject_user_id=${userAId}&limit=200`);
  const actions = new Set(audit.body.events.map((event) => event.action));
  check(actions.has("admin.view_user_tasks_page") && actions.has("admin.view_user_task") && actions.has("admin.view_user_assets_page") && actions.has("admin.view_user_asset"), "administrator page and detail review access was not audited");
  const catalog = await api(adminPage, "/api/admin/provider-catalog");
  check((await api(adminPage, `/api/providers/personal/${catalog.body.providers[0].provider_version_id}`, { method: "PUT", json: { api_key: "forbidden" } })).status === 403, "admin configured a personal provider");

  check((await api(adminPage, `/api/admin/quotas/department/users/${userAId}`, { method: "PATCH", json: { quota_units: 0 } })).status === 200, "admin could not set quota gate");
  const rejected = await submitTask(pageA, "browser quota rejection");
  check(rejected.status === 409 && String(rejected.body.detail).includes("额度"), `quota rejection was not user-readable: ${JSON.stringify(rejected.body)}`);
  check((await api(adminPage, `/api/admin/quotas/department/users/${userAId}`, { method: "PATCH", json: { quota_units: 100 } })).status === 200, "admin could not restore user quota");

  await adminPage.locator('[data-system-settings-tab="users"]').click();
  await eventually(async () => (await adminPage.locator("#settingsUserList").textContent()).includes(credentials.userA.username), "user management did not reload for confirmation testing");
  const resetResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/users/${userAId}/reset-password` && response.request().method() === "POST"
  ));
  await userARow.getByRole("button", { name: "重置密码" }).click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await resetResponse).status() === 200, "confirming password reset did not send the reset request");
  await eventually(
    async () => (await adminPage.locator("#settingsTemporaryCredential").textContent()).includes(credentials.userA.username),
    "confirmed password reset did not show the temporary password",
  );
  const deactivateResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/users/${userAId}/status` && response.request().method() === "PATCH"
  ));
  await userARow.getByRole("button", { name: "停用" }).click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await deactivateResponse).status() === 200, "confirming user deactivation did not send the status update");
  await eventually(
    async () => await adminPage.locator("#settingsUserList .settings-list-row", { hasText: credentials.userA.username }).getByRole("button", { name: "恢复" }).isVisible(),
    "confirmed user deactivation did not update the settings feedback",
  );
  const reactivateResponse = adminPage.waitForResponse((response) => (
    new URL(response.url()).pathname === `/api/admin/users/${userAId}/status` && response.request().method() === "PATCH"
  ));
  await userARow.getByRole("button", { name: "恢复" }).click();
  await adminPage.locator(".confirm-popover:not(.hidden)").waitFor({ state: "visible" });
  await adminPage.locator(".confirm-popover:not(.hidden) [data-confirm-popover-confirm]").click();
  check((await reactivateResponse).status() === 200, "confirming user reactivation did not send the status update");

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

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const staticRoot = join(repositoryRoot, "codex_image", "webui", "static");
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function staticPath(requestUrl) {
  const pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  const relativePath = pathname === "/"
    ? "index.html"
    : pathname.replace(/^\/static\//, "");
  const resolved = normalize(join(staticRoot, relativePath));
  return resolved.startsWith(`${staticRoot}/`) || resolved === join(staticRoot, "index.html")
    ? resolved
    : "";
}

const server = createServer((request, response) => {
  const path = staticPath(request.url || "/");
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(path)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(path));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

const issue47Task = {
  task_id: "issue-47-layout-regression",
  status: "completed",
  mode: "generate",
  prompt: "一给小朋友在开会的照片",
  created_at: "2026-07-23T16:34:00Z",
  updated_at: "2026-07-23T16:34:31Z",
  provider_scope: "department",
  params: {
    api_provider_id: "department-provider-version",
    api_provider_name: "火山方舟",
    size: "3024x1296",
    ratio: "21:9",
    resolution: "standard",
    n: 1,
    output_format: "png",
  },
  request: {},
  outputs: [],
  input_sources: [],
  reference_files: [],
  generation_snapshot: {
    schema_version: 1,
    runtime: "legacy",
    model_family_id: "seedream-image",
    canonical_model_id: "doubao-seedream-5-0-260128",
    provider_version_id: "provider-version",
    provider_key: "provider-1784418396398",
    binding_id: "seedream-lite",
    remote_model_id: "doubao-seedream-5-0-260128",
    protocol_profile: "openai_images",
    parameter_codec: "gpt_openai_images",
    actual_parameters: {
      size: "3024x1296",
      ratio: "21:9",
      resolution: "standard",
      n: 1,
      output_format: "png",
      quality: "auto",
      moderation: "auto",
      web_search: false,
      prompt_fidelity: "strict",
      prompt_optimization_mode: "off",
      seed_mode: "random",
      seed: 1040967306,
    },
  },
};

try {
  const layouts = [];
  for (const viewport of [
    { width: 1558, height: 900, expectSingleRow: true },
    { width: 1100, height: 900, expectSingleRow: false },
    { width: 899, height: 900, expectSingleRow: false },
    { width: 760, height: 900, expectSingleRow: false },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".prompt-panel").waitFor({ state: "visible" });
    await page.locator("#generationModelField > label").evaluate((label) => {
      label.textContent = "Generation model";
    });
    const themedModelTrigger = page.locator("#generationModelField .themed-select-trigger");
    check(
      await themedModelTrigger.count() === 1,
      `${viewport.width}x${viewport.height} generation model is not mounted as a themed select`,
    );
    check(
      await page.locator("#generationModelSummary").count() === 0,
      `${viewport.width}x${viewport.height} duplicate generation model summary is still mounted`,
    );

    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const panel = document.querySelector(".prompt-panel");
      const panelRect = panel.getBoundingClientRect();
      const panelStyle = getComputedStyle(panel);
      const contentBottom = panelRect.bottom
        - Number.parseFloat(panelStyle.borderBottomWidth)
        - Number.parseFloat(panelStyle.paddingBottom);
      const actionBottoms = [
        "#clearPromptButton",
        "#promptFindButton",
        "#generationModelField .themed-select-trigger",
        "#promptTemplateButton",
      ].map((selector) => {
        const box = rect(selector);
        return { selector, top: box.top, bottom: box.bottom, height: box.height };
      });
      const modelLabelBox = rect("#generationModelField > label");
      const modelTriggerBox = rect("#generationModelField .themed-select-trigger");
      const modelLabelRange = document.createRange();
      modelLabelRange.selectNodeContents(document.querySelector("#generationModelField > label"));
      return {
        findAction: {
          right: rect("#promptFindButton").right,
        },
        panelBottom: panelRect.bottom,
        contentBottom,
        actionBottoms,
        modelLabel: {
          top: modelLabelBox.top,
          left: modelLabelBox.left,
          right: modelLabelBox.right,
          bottom: modelLabelBox.bottom,
          height: modelLabelBox.height,
          lines: modelLabelRange.getClientRects().length,
        },
        modelTrigger: {
          top: modelTriggerBox.top,
          left: modelTriggerBox.left,
          bottom: modelTriggerBox.bottom,
          height: modelTriggerBox.height,
        },
      };
    });

    const lowestAction = Math.max(...layout.actionBottoms.map(({ bottom }) => bottom));
    const highestAction = Math.min(...layout.actionBottoms.map(({ bottom }) => bottom));
    check(
      lowestAction <= layout.contentBottom + 1,
      `${viewport.width}x${viewport.height} prompt actions overflow the panel content box by ${(lowestAction - layout.contentBottom).toFixed(2)}px`,
    );
    check(
      layout.modelLabel.lines === 1,
      `${viewport.width}x${viewport.height} generation model label wrapped to ${layout.modelLabel.lines} lines`,
    );
    if (viewport.width > 760) {
      check(
        layout.modelLabel.right + 4 <= layout.modelTrigger.left,
        `${viewport.width}x${viewport.height} generation model label overlaps the themed select`,
      );
    }
    if (viewport.width > 1100) {
      check(
        layout.findAction.right + 4 <= layout.modelLabel.left,
        `${viewport.width}x${viewport.height} prompt utilities overlap the generation model label`,
      );
    }
    if (viewport.expectSingleRow) {
      check(
        lowestAction - highestAction <= 1.5,
        `${viewport.width}x${viewport.height} prompt action bottoms are misaligned by ${(lowestAction - highestAction).toFixed(2)}px: ${JSON.stringify(layout.actionBottoms)}`,
      );
    }

    if (viewport.expectSingleRow) {
      await page.evaluate(() => {
        const select = document.querySelector("#generationModelSelect");
        select.replaceChildren(
          new Option("Model one", "model-one"),
          new Option("Model two", "model-two"),
        );
        select.disabled = false;
        select.value = "model-one";
        window.__issue47ModelChanges = 0;
        select.addEventListener("change", (event) => {
          window.__issue47ModelChanges += 1;
          event.stopImmediatePropagation();
        }, { capture: true });
      });
      await page.waitForFunction(() => {
        const trigger = document.querySelector("#generationModelField .themed-select-trigger");
        return !trigger.disabled && trigger.textContent.includes("Model one");
      });
      await themedModelTrigger.focus();
      await themedModelTrigger.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      const selectedByKeyboard = await page.evaluate(() => {
        const select = document.querySelector("#generationModelSelect");
        const trigger = document.querySelector("#generationModelField .themed-select-trigger");
        const menu = document.getElementById(trigger.getAttribute("aria-controls"));
        return {
          value: select.value,
          changes: window.__issue47ModelChanges,
          triggerText: trigger.textContent,
          expanded: trigger.getAttribute("aria-expanded"),
          menuHidden: menu.classList.contains("hidden"),
          focusRestored: document.activeElement === trigger,
        };
      });
      check(
        selectedByKeyboard.value === "model-two"
          && selectedByKeyboard.changes === 1
          && selectedByKeyboard.triggerText.includes("Model two"),
        `themed model keyboard selection did not update the native contract: ${JSON.stringify(selectedByKeyboard)}`,
      );
      check(
        selectedByKeyboard.expanded === "false"
          && selectedByKeyboard.menuHidden
          && selectedByKeyboard.focusRestored,
        `themed model keyboard selection did not close and restore focus: ${JSON.stringify(selectedByKeyboard)}`,
      );

      await themedModelTrigger.press("Enter");
      await page.keyboard.press("Escape");
      const escaped = await page.evaluate(() => {
        const trigger = document.querySelector("#generationModelField .themed-select-trigger");
        const menu = document.getElementById(trigger.getAttribute("aria-controls"));
        return trigger.getAttribute("aria-expanded") === "false"
          && menu.classList.contains("hidden")
          && document.activeElement === trigger;
      });
      check(escaped, "Escape did not close the themed model menu and restore trigger focus");

      await themedModelTrigger.press("Enter");
      await page.keyboard.press("Tab");
      const tabbed = await page.evaluate(() => {
        const trigger = document.querySelector("#generationModelField .themed-select-trigger");
        const menu = document.getElementById(trigger.getAttribute("aria-controls"));
        return trigger.getAttribute("aria-expanded") === "false" && menu.classList.contains("hidden");
      });
      check(tabbed, "Tab did not close the themed model menu");
    }

    layouts.push({ viewport, ...layout });
    await page.close();
  }

  const taskPage = await browser.newPage({ viewport: { width: 1568, height: 1286 } });
  await taskPage.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
  await taskPage.waitForFunction(() => Boolean(window.__codexImageWebUI?.methods?.selectTask));
  const taskSwitch = await taskPage.evaluate(async (task) => {
    const bridge = window.__codexImageWebUI;
    const bounds = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    const measure = () => ({
      image: bounds(".controls-col .image-panel"),
      prompt: bounds(".controls-col .prompt-panel"),
      output: bounds(".controls-col .output-panel"),
    });
    const before = measure();
    bridge.state.selectedModelId = "gpt-image-2";
    bridge.state.tasks = [task];
    await bridge.methods.selectTask(task.task_id);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const afterFirstSelection = measure();
    await bridge.methods.selectTask(task.task_id);
    await new Promise((resolve) => setTimeout(resolve, 25));
    document.querySelector("#generationModelField > label").textContent = "Generation model";
    const findActionBox = document.querySelector("#promptFindButton").getBoundingClientRect();
    const modelLabelBox = document.querySelector("#generationModelField > label").getBoundingClientRect();
    const settingsGrid = document.querySelector("#settingsGrid");
    return {
      before,
      afterFirstSelection,
      afterSecondSelection: measure(),
      inspectorVisible: !document.querySelector("#taskParameterInspector").classList.contains("hidden"),
      editorVisible: getComputedStyle(settingsGrid).display !== "none"
        && settingsGrid.getBoundingClientRect().height > 0,
      editorInert: settingsGrid.hasAttribute("inert"),
      outputValues: {
        selectedModelId: bridge.state.selectedModelId,
        concreteModelId: document.querySelector("#concreteModelSelect").value,
        size: document.querySelector("#size").value,
        customWidth: document.querySelector("#customWidth").value,
        customHeight: document.querySelector("#customHeight").value,
        customRatioWidth: document.querySelector("#customRatioWidth").value,
        customRatioHeight: document.querySelector("#customRatioHeight").value,
        count: document.querySelector("#nInput").value,
        format: document.querySelector("#outputFormat").value,
        quality: document.querySelector("#quality").value,
        moderation: document.querySelector("#moderation").value,
        promptFidelity: document.querySelector("#promptFidelity").value,
      },
      promptControls: {
        findRight: findActionBox.right,
        modelLabelLeft: modelLabelBox.left,
      },
    };
  }, issue47Task);
  const imageDrift = Math.abs(taskSwitch.afterFirstSelection.image.height - taskSwitch.before.image.height);
  const promptDrift = Math.abs(taskSwitch.afterFirstSelection.prompt.height - taskSwitch.before.prompt.height);
  check(
    imageDrift <= 2 && promptDrift <= 2,
    `task switch changed panel heights (image ${imageDrift.toFixed(2)}px, prompt ${promptDrift.toFixed(2)}px)`,
  );
  check(
    !taskSwitch.inspectorVisible && taskSwitch.editorVisible && !taskSwitch.editorInert,
    `task switch did not expose the editable output form: ${JSON.stringify(taskSwitch)}`,
  );
  check(
    taskSwitch.outputValues.size === "custom"
      && taskSwitch.outputValues.customWidth === "3024"
      && taskSwitch.outputValues.customHeight === "1296"
      && taskSwitch.outputValues.customRatioWidth === "7"
      && taskSwitch.outputValues.customRatioHeight === "3"
      && taskSwitch.outputValues.count === "1"
      && taskSwitch.outputValues.format === "png"
      && taskSwitch.outputValues.quality === "auto"
      && taskSwitch.outputValues.moderation === "auto"
      && taskSwitch.outputValues.promptFidelity === "strict",
    `editable output form did not load the historical values: ${JSON.stringify(taskSwitch.outputValues)}`,
  );
  await taskPage.locator('#quantityGroup [data-val="2"]').click();
  check(
    await taskPage.locator("#nInput").inputValue() === "2",
    "historical output form controls are not editable",
  );
  check(
    Math.abs(taskSwitch.afterSecondSelection.image.height - taskSwitch.afterFirstSelection.image.height) <= 1
      && Math.abs(taskSwitch.afterSecondSelection.prompt.height - taskSwitch.afterFirstSelection.prompt.height) <= 1,
    "repeated task selection caused cumulative panel drift",
  );
  check(
    taskSwitch.promptControls.findRight + 4 <= taskSwitch.promptControls.modelLabelLeft,
    "tall desktop prompt utilities overlap the generation model label",
  );
  await taskPage.close();

  const thumbnailPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await thumbnailPage.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
  await thumbnailPage.waitForFunction(() => Boolean(window.__codexImageWebUI?.methods?.renderImageStrip));
  await thumbnailPage.locator("#imageInput").setInputFiles({
    name: "reference.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#f8f1ec"/></svg>'),
  });
  await thumbnailPage.locator("#imageThumbItems .thumb").waitFor();
  const thumbnail = await thumbnailPage.evaluate(() => {
    const bounds = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    };
    const main = bounds(".image-input-main");
    const actions = Object.fromEntries([
      ["badge", "#imageThumbItems .thumb-badge"],
      ["remove", "#imageThumbItems .thumb-remove"],
      ["add", "#imageThumbItems .add-upload-to-gallery"],
    ].map(([name, selector]) => [name, bounds(selector)]));
    const visible = Object.fromEntries(Object.entries(actions).map(([name, box]) => [
      name,
      box.top >= main.top && box.left >= main.left && box.right <= main.right && box.bottom <= main.bottom,
    ]));
    return {
      main,
      thumb: bounds("#imageThumbItems .thumb"),
      actions,
      visible,
    };
  });
  const clippedActions = Object.entries(thumbnail.visible)
    .filter(([, visible]) => !visible)
    .map(([name]) => name);
  check(
    clippedActions.length === 0,
    `reference thumbnail actions are clipped: ${clippedActions.join(", ")}`,
  );
  await thumbnailPage.locator("#imageThumbItems .add-upload-to-gallery").click();
  await thumbnailPage.locator("#addToGalleryModal").waitFor({ state: "visible" });
  await thumbnailPage.locator("#addToGalleryClose").click();
  await thumbnailPage.locator("#imageThumbItems .thumb-remove").click();
  check(
    await thumbnailPage.locator("#imageThumbItems .thumb").count() === 0,
    "reference thumbnail remove action did not remove the input",
  );
  await thumbnailPage.close();

  console.log(JSON.stringify({ layouts, taskSwitch, thumbnail }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const bundle = await build({
  stdin: {
    contents: `
      import { mountThemedSelect } from "./codex_image/webui/frontend/src/themed-select.ts";
      window.mountThemedSelectForTest = mountThemedSelect;
    `,
    resolveDir: repositoryRoot,
    sourcefile: "themed-select-system-settings-harness.ts",
  },
  bundle: true,
  format: "iife",
  target: "es2020",
  write: false,
});

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <div id="systemSettingsModal" class="system-settings-shell" role="dialog" aria-modal="true">
          <div class="field">
            <select id="bindingModel" class="control" aria-label="具体型号">
              <option value="gpt-image-2" selected>GPT Image 2</option>
              <option value="doubao-seedream">Doubao Seedream</option>
            </select>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.addStyleTag({
    path: `${repositoryRoot}/codex_image/webui/static/styles.css`,
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    window.mountThemedSelectForTest(document.querySelector("#bindingModel"));
  });

  await page.getByRole("button", { name: "具体型号" }).click();
  await page.getByRole("option", { name: "Doubao Seedream" }).click({ timeout: 1_000 });

  const selected = await page.evaluate(() => ({
    value: document.querySelector("#bindingModel").value,
    label: document.querySelector(".themed-select-trigger").textContent.trim(),
  }));
  check(selected.value === "doubao-seedream", `expected Doubao value, got ${selected.value}`);
  check(selected.label === "Doubao Seedream", `expected Doubao label, got ${selected.label}`);
  console.log("themed select remains clickable above system settings");
} finally {
  await browser.close();
}

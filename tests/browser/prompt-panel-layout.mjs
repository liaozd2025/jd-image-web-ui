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
        "#generationModelSelect",
        "#promptTemplateButton",
      ].map((selector) => ({ selector, bottom: rect(selector).bottom }));
      return {
        panelBottom: panelRect.bottom,
        contentBottom,
        actionBottoms,
      };
    });

    const lowestAction = Math.max(...layout.actionBottoms.map(({ bottom }) => bottom));
    const highestAction = Math.min(...layout.actionBottoms.map(({ bottom }) => bottom));
    check(
      lowestAction <= layout.contentBottom + 1,
      `${viewport.width}x${viewport.height} prompt actions overflow the panel content box by ${(lowestAction - layout.contentBottom).toFixed(2)}px`,
    );
    if (viewport.expectSingleRow) {
      check(
        lowestAction - highestAction <= 1.5,
        `${viewport.width}x${viewport.height} prompt action bottoms are misaligned by ${(lowestAction - highestAction).toFixed(2)}px`,
      );
    }

    layouts.push({ viewport, ...layout });
    await page.close();
  }

  console.log(JSON.stringify(layouts, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

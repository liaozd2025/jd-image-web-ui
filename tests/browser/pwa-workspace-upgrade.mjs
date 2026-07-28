import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const indexSource = readFileSync(
  `${repositoryRoot}/codex_image/webui/static/index.html`,
  "utf8",
);
const serviceWorkerSource = readFileSync(
  `${repositoryRoot}/codex_image/webui/static/service-worker.js`,
  "utf8",
);
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const previousAppUrl = "/static/app.js?v=runtime-661";
const previousCacheName = "ilab-gpt-conjure-shell-v85";
const currentAppUrl = indexSource.match(
  /<script src="(\/static\/app\.js\?v=[^"]+)"><\/script>/,
)?.[1];
const currentCacheName = serviceWorkerSource.match(
  /const CACHE_NAME = "([^"]+)";/,
)?.[1];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(currentAppUrl, "workspace app URL is missing");
check(currentCacheName, "service worker cache generation is missing");

let release = "previous";

const previousServiceWorker = `
const CACHE_NAME = ${JSON.stringify(previousCacheName)};
const APP_URL = ${JSON.stringify(previousAppUrl)};
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(APP_URL))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
    return;
  }
  if (requestUrl.pathname !== "/static/app.js") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`;

const previousHtml = `<!doctype html>
<html>
  <body>
    <div id="generationModelSummary"></div>
    <div id="modelFamilyOptions"></div>
    <div id="taskList"></div>
    <script>
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    </script>
    <script src="${previousAppUrl}"></script>
  </body>
</html>`;

const currentHtml = `<!doctype html>
<html>
  <body>
    <div id="modelFamilyOptions"></div>
    <div id="taskList"></div>
    <script>
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    </script>
    <script src="${currentAppUrl}"></script>
  </body>
</html>`;

const previousApp = `
document.querySelector("#generationModelSummary").textContent = "legacy summary";
document.body.dataset.workspaceBoot = "previous";
`;

const currentApp = `
document.querySelector("#modelFamilyOptions").textContent = "GPT Seedream";
document.querySelector("#taskList").textContent = "历史任务已加载";
document.body.dataset.workspaceBoot = "current";
`;

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  response.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(release === "previous" ? previousHtml : currentHtml);
    return;
  }
  if (url.pathname === "/service-worker.js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(previousServiceWorker);
    return;
  }
  if (url.pathname === "/static/app.js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(release === "previous" ? previousApp : currentApp);
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.body.dataset.workspaceBoot === "previous",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  release = "current";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => ({
    boot: document.body.dataset.workspaceBoot || "",
    modelFamilies: document.querySelector("#modelFamilyOptions")?.textContent || "",
    history: document.querySelector("#taskList")?.textContent || "",
    summaryExists: Boolean(document.querySelector("#generationModelSummary")),
  }));

  check(
    currentAppUrl !== previousAppUrl,
    `workspace release reused stale app URL ${previousAppUrl}`,
  );
  check(
    currentCacheName !== previousCacheName,
    `workspace release reused stale cache generation ${previousCacheName}`,
  );
  check(
    state.boot === "current"
      && state.modelFamilies === "GPT Seedream"
      && state.history === "历史任务已加载"
      && !state.summaryExists,
    `workspace did not recover after a cached upgrade: ${JSON.stringify(state)}`,
  );

  console.log(JSON.stringify({
    previousAppUrl,
    currentAppUrl,
    previousCacheName,
    currentCacheName,
    state,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

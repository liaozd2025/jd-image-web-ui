import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stylesDir = join(root, "codex_image", "webui", "static", "styles");
const outputPath = join(root, "codex_image", "webui", "static", "styles.css");
const manifestPath = join(stylesDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (!Array.isArray(manifest) || manifest.some((item) => typeof item !== "string" || !item.endsWith(".css"))) {
  throw new Error("CSS manifest must be an array of CSS filenames");
}

const chunks = manifest.map((filename) => {
  const source = readFileSync(join(stylesDir, filename), "utf8").trimEnd();
  return `/* source: styles/${filename} */\n${source}`;
});

writeFileSync(outputPath, `${chunks.join("\n\n")}\n`, "utf8");

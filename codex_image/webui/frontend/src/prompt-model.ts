import { getLegacyBridge } from "./state";

const bridge = getLegacyBridge();
const els = bridge.els;

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function getPromptText(): string { return legacyMethod("getPromptText"); }
function expandPromptSnippets(prompt: any): string { return legacyMethod("expandPromptSnippets", prompt); }
function galleryInputs(): any[] { return legacyMethod("galleryInputs"); }
function uploadInputs(): any[] { return legacyMethod("uploadInputs"); }
function referenceAssetInputs(): any[] { return legacyMethod("referenceAssetInputs"); }
function categoryPromptRole(category: any): string { return legacyMethod("categoryPromptRole", category); }
export function promptTokenReplacement(prompt: any): string {
  return expandPromptSnippets(prompt);
}

export function galleryPromptText(galleries: any[] = galleryInputs()): string {
  if (!galleries.length) return "";
  const referenceOffset = uploadInputs().length + referenceAssetInputs().length;
  const lines = galleries.map((source: any, index: any) => galleryReferenceInstruction(source, referenceOffset + index + 1));
  return `参考图说明：\n${lines.join("\n")}`;
}

export function buildPromptForModel(): string {
  const prompt = expandPromptSnippets(getPromptText());
  const galleries = galleryInputs();
  const galleryText = galleryPromptText(galleries);
  if (!galleryText) return prompt;
  return `${prompt}\n\n${galleryText}`;
}

export function galleryReferenceInstruction(source: any, number: any): string {
  const role = source.category_prompt_role || categoryPromptRole(source.category);
  const promptNote = String(source.prompt_note || "").trim();
  return `- 参考图 ${number}：图库「${source.name}」，用途：${role}。提示词中的 @${source.name} 指这张图。${promptNote ? ` ${promptNote}` : ""}`;
}

export function currentPromptForModel(): string {
  return currentPromptFidelity() === "original" ? expandPromptSnippets(getPromptText()) : buildPromptForModel();
}

export function currentPromptFidelity(): string {
  const value = els.promptFidelity?.value || "strict";
  return ["strict", "original", "off"].includes(value) ? value : "strict";
}

export function initPromptModelFeature(): void {
  Object.assign(getLegacyBridge().methods, {
    promptTokenReplacement,
    galleryPromptText,
    buildPromptForModel,
    galleryReferenceInstruction,
    currentPromptForModel,
    currentPromptFidelity,
  });
}

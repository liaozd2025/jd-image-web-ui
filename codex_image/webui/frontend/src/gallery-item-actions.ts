import { getLegacyBridge } from "./state";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let galleryItemActionsFeatureInitialized = false;
let galleryEditPopoverEl: HTMLElement | null = null;
const galleryEditPopoverState: Record<string, any> = {
  anchor: null,
  onSave: null,
};

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function escapeHtml(value: any): string { return legacyMethod("escapeHtml", value); }
function setStatus(message: any, type?: any): void { legacyMethod("setStatus", message, type); }
function openConfirmPopover(anchor: any, options: any): void { legacyMethod("openConfirmPopover", anchor, options); }
function closeConfirmPopover(): void { legacyMethod("closeConfirmPopover"); }
function closePromptPopover(): void { legacyMethod("closePromptPopover"); }
function setMode(mode: any): void { legacyMethod("setMode", mode); }
function sourcePreviewUrl(source: any): string { return legacyMethod("sourcePreviewUrl", source); }
function sourceName(source: any): string { return legacyMethod("sourceName", source); }
function gallerySource(item: any): any { return legacyMethod("gallerySource", item); }
function revokeUploadPreviewUrl(source: any, options?: any): void { legacyMethod("revokeUploadPreviewUrl", source, options); }
function renderImageStrip(): void { legacyMethod("renderImageStrip"); }
function updateRequestPreview(): void { legacyMethod("updateRequestPreview"); }
function refreshGallery(): Promise<void> { return legacyMethod("refreshGallery"); }
function renderQuickGalleryDock(): void { legacyMethod("renderQuickGalleryDock"); }
function renderGalleryGrid(options?: any): void { legacyMethod("renderGalleryGrid", options); }
function renderGalleryCategoryControls(): void { legacyMethod("renderGalleryCategoryControls"); }
function findGalleryItem(itemId: any): any { return legacyMethod("findGalleryItem", itemId); }
function findGalleryCategory(categoryId: any): any { return legacyMethod("findGalleryCategory", categoryId); }
function normalizeGalleryCategories(categories: any): any[] { return legacyMethod("normalizeGalleryCategories", categories); }

function clampPopoverPosition(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

async function remoteImageSourceFile(source: any): Promise<File> {
  const imageUrl = sourcePreviewUrl(source);
  if (!imageUrl) throw new Error("无法载入这张图片");
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("无法载入这张图片");
  const blob = await response.blob();
  return new File([blob], sourceName(source), {
    type: blob.type || source.mime_type || "image/png",
    lastModified: Date.now(),
  });
}

function openAddToGallery(index: any) {
  const source = state.images[index];
  if (!canAddSourceToGallery(source)) return;
  state.addToGalleryIndex = index;
  if (els.addToGalleryPreview) {
    els.addToGalleryPreview.src = sourcePreviewUrl(source);
  }
  if (els.galleryNameInput) {
    els.galleryNameInput.value = sourceName(source).replace(/\.[^.]+$/, "");
  }
  if (els.galleryCategoryInput) {
    renderGalleryCategoryControls();
    els.galleryCategoryInput.value = findGalleryCategory(state.activeGalleryCategory) ? state.activeGalleryCategory : (state.galleryCategories[0]?.id || "portrait");
  }
  if (els.galleryPromptNoteInput) {
    els.galleryPromptNoteInput.value = "";
  }
  els.addToGalleryModal?.classList.remove("hidden");
  els.galleryNameInput?.focus();
}

function closeAddToGallery() {
  state.addToGalleryIndex = null;
  els.addToGalleryModal?.classList.add("hidden");
}

function canAddSourceToGallery(source: any) {
  if (!source || source.missing) return false;
  if (source.kind === "upload") return Boolean(source.file);
  return source.kind === "asset" && Boolean(sourcePreviewUrl(source));
}

async function galleryImageFileForSource(source: any) {
  if (source.kind === "upload") return source.file;
  if (source.kind === "asset") return remoteImageSourceFile(source);
  throw new Error("这张图片无法加入图库");
}

async function saveUploadToGallery() {
  const source = state.images[state.addToGalleryIndex];
  if (!canAddSourceToGallery(source)) return;
  const name = els.galleryNameInput.value.trim();
  const category = els.galleryCategoryInput.value;
  const promptNote = els.galleryPromptNoteInput?.value.trim() || "";
  if (!name) {
    setStatus("请输入图库名称", "error");
    return;
  }
  try {
    const form = new FormData();
    const imageFile = await galleryImageFileForSource(source);
    form.append("name", name);
    form.append("category", category);
    form.append("prompt_note", promptNote);
    form.append("image", imageFile);
    const response = await fetch("/api/gallery", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "保存图库失败");
    }
    state.images[state.addToGalleryIndex] = gallerySource(data.item);
    if (source.kind === "upload") revokeUploadPreviewUrl(source);
    await refreshGallery();
    closeAddToGallery();
    setMode("edit");
    renderImageStrip();
    updateRequestPreview();
    setStatus("已添加到图库，并切换为图库引用", "ok");
  } catch (error: any) {
    setStatus(error.message || "保存图库失败", "error");
  }
}

function renameGalleryItem(button: any, itemId: any) {
  const item = findGalleryItem(itemId);
  if (!item) return;
  openGalleryEditPopover(button, {
    title: "重命名图库图片",
    mode: "name",
    item,
    onSave: async (popover: any) => {
      const name = popover.querySelector("[data-gallery-edit-name]")?.value.trim();
      if (!name) {
        setStatus("请输入图库名称", "error");
        return false;
      }
      if (name === item.name) return true;
      await patchGalleryItem(itemId, { name });
      return true;
    },
  });
}

function moveGalleryItem(button: any, itemId: any) {
  const item = findGalleryItem(itemId);
  if (!item) return;
  openGalleryEditPopover(button, {
    title: "移动到分类",
    mode: "category",
    item,
    onSave: async (popover: any) => {
      const category = popover.querySelector("[data-gallery-edit-category]")?.value;
      if (!findGalleryCategory(category)) {
        setStatus("请选择图库分类", "error");
        return false;
      }
      if (category === item.category) return true;
      await patchGalleryItem(itemId, { category });
      return true;
    },
  });
}

function editGalleryPromptNote(button: any, itemId: any) {
  const item = findGalleryItem(itemId);
  if (!item) return;
  openGalleryEditPopover(button, {
    title: "图库引用备注",
    mode: "prompt_note",
    item,
    onSave: async (popover: any) => {
      const promptNote = popover.querySelector("[data-gallery-edit-prompt-note]")?.value.trim() || "";
      if (promptNote === (item.prompt_note || "")) return true;
      await patchGalleryItem(itemId, { prompt_note: promptNote });
      return true;
    },
  });
}

async function patchGalleryItem(itemId: any, payload: any) {
  try {
    const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "更新图库失败");
    await refreshGallery();
    state.images = state.images.map((source: any) => source.kind === "gallery" && source.id === itemId ? gallerySource(data.item) : source);
    renderImageStrip();
    updateRequestPreview();
  } catch (error: any) {
    setStatus(error.message || "更新图库失败", "error");
  }
}

function selectGalleryReplacementFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.addEventListener("change", () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

async function replaceGalleryItemImage(itemId: any) {
  const item = findGalleryItem(itemId);
  if (!item) return;
  const file = await selectGalleryReplacementFile();
  if (!file) return;
  if (file.type && !file.type.startsWith("image/")) {
    setStatus("请选择图片文件", "error");
    return;
  }
  const form = new FormData();
  form.append("image", file);
  try {
    const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}/image`, {
      method: "PUT",
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "替换图库图片失败");
    const updated = data.item;
    state.galleryItems = state.galleryItems.map((candidate: any) => (candidate.id === itemId ? updated : candidate));
    state.images = state.images.map((source: any) => (source.kind === "gallery" && source.id === itemId ? gallerySource(updated) : source));
    renderQuickGalleryDock();
    renderGalleryGrid();
    renderImageStrip();
    updateRequestPreview();
    setStatus(`已替换「${updated.name || item.name}」的原图`, "ok");
  } catch (error: any) {
    setStatus(error.message || "替换图库图片失败", "error");
  }
}

function deleteGalleryItem(button: any, itemId: any) {
  const item = findGalleryItem(itemId);
  if (!item) return;
  openConfirmPopover(button, {
    title: "删除图库图片？",
    message: "历史任务里的引用会显示为已删除。",
    detail: item.name,
    confirmText: "删除",
    onConfirm: async () => {
      await performDeleteGalleryItem(itemId);
    },
  });
}

async function performDeleteGalleryItem(itemId: any) {
  try {
    const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "删除图库失败");
    await refreshGallery();
    state.images = state.images.map((source: any) => {
      if (source.kind !== "gallery" || source.id !== itemId) return source;
      return { ...source, missing: true, image_url: "", previewUrl: "", name: `${source.name}（已删除）` };
    });
    renderImageStrip();
    updateRequestPreview();
  } catch (error: any) {
    setStatus(error.message || "删除图库失败", "error");
  }
}

function ensureGalleryEditPopover() {
  if (galleryEditPopoverEl) return galleryEditPopoverEl;
  galleryEditPopoverEl = document.createElement("div");
  galleryEditPopoverEl.className = "gallery-edit-popover hidden";
  galleryEditPopoverEl.setAttribute("role", "dialog");
  galleryEditPopoverEl.setAttribute("aria-label", "编辑图库图片");
  document.body.appendChild(galleryEditPopoverEl);
  return galleryEditPopoverEl;
}

function openGalleryEditPopover(anchor: any, options: any = {}) {
  if (!anchor || !options.item) return;
  const popover = ensureGalleryEditPopover();
  if (!popover.classList.contains("hidden") && galleryEditPopoverState.anchor === anchor) {
    closeGalleryEditPopover();
    return;
  }

  closePromptPopover();
  closeConfirmPopover();
  galleryEditPopoverState.anchor = anchor;
  galleryEditPopoverState.onSave = typeof options.onSave === "function" ? options.onSave : null;
  popover.innerHTML = `
    <form class="gallery-edit-form">
      <div class="gallery-edit-title">${escapeHtml(options.title || "编辑图库图片")}</div>
      ${galleryEditFieldHtml(options.mode, options.item)}
      <div class="gallery-edit-actions">
        <button class="ghost-button text-sm" type="button" data-gallery-edit-cancel>取消</button>
        <button class="ghost-button text-sm" type="submit" data-gallery-edit-save>保存</button>
      </div>
    </form>
  `;
  popover.querySelector("[data-gallery-edit-cancel]")?.addEventListener("click", closeGalleryEditPopover);
  popover.querySelector(".gallery-edit-form")?.addEventListener("submit", async (event: Event) => {
    event.preventDefault();
    const onSave = galleryEditPopoverState.onSave;
    if (!onSave) {
      closeGalleryEditPopover();
      return;
    }
    const shouldClose = await onSave(popover);
    if (shouldClose !== false) closeGalleryEditPopover();
  });
  popover.classList.remove("hidden");
  positionGalleryEditPopover(anchor, popover);
  const focusTarget = popover.querySelector("[data-gallery-edit-name], [data-gallery-edit-category], [data-gallery-edit-prompt-note]") as any;
  focusTarget?.focus({ preventScroll: true });
  focusTarget?.select?.();
}

function galleryEditFieldHtml(mode: any, item: any) {
  if (mode === "category") {
    const options = normalizeGalleryCategories(state.galleryCategories).map((category: any) => `
      <option value="${escapeHtml(category.id)}" ${category.id === item.category ? "selected" : ""}>${escapeHtml(category.name)}</option>
    `).join("");
    return `
      <label class="gallery-edit-field">
        <span>分类</span>
        <select class="gallery-edit-select" data-gallery-edit-category>${options}</select>
      </label>
    `;
  }
  if (mode === "prompt_note") {
    return `
      <label class="gallery-edit-field">
        <span>引用备注</span>
        <textarea class="gallery-edit-input gallery-edit-textarea" maxlength="160" data-gallery-edit-prompt-note>${escapeHtml(item.prompt_note || "")}</textarea>
      </label>
    `;
  }
  return `
    <label class="gallery-edit-field">
      <span>名称</span>
      <input class="gallery-edit-input" type="text" value="${escapeHtml(item.name)}" data-gallery-edit-name>
    </label>
  `;
}

function closeGalleryEditPopover() {
  if (!galleryEditPopoverEl) return;
  galleryEditPopoverEl.classList.add("hidden");
  galleryEditPopoverState.anchor = null;
  galleryEditPopoverState.onSave = null;
}

function positionGalleryEditPopover(anchor: any, popover: any) {
  const anchorRect = anchor.getBoundingClientRect();
  const margin = 10;
  const width = Math.min(300, Math.max(230, window.innerWidth - margin * 2));
  popover.style.width = `${width}px`;
  popover.style.left = "0px";
  popover.style.top = "0px";
  const height = popover.offsetHeight;
  const left = clampPopoverPosition(anchorRect.right - width, margin, window.innerWidth - width - margin);
  const belowTop = anchorRect.bottom + 8;
  const top = belowTop + height <= window.innerHeight - margin
    ? belowTop
    : clampPopoverPosition(anchorRect.top - height - 8, margin, window.innerHeight - height - margin);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function handleGalleryDocumentClick(event: any) {
  const target = event.target;
  if (galleryEditPopoverEl && !galleryEditPopoverEl.classList.contains("hidden")) {
    const clickedPopover = galleryEditPopoverEl.contains(target);
    const clickedAnchor = galleryEditPopoverState.anchor?.contains?.(target);
    if (!clickedPopover && !clickedAnchor) {
      closeGalleryEditPopover();
    }
  }
}

export function initGalleryItemActionsFeature() {
  if (galleryItemActionsFeatureInitialized) return;
  galleryItemActionsFeatureInitialized = true;
  Object.assign(getLegacyBridge().methods, {
    openAddToGallery,
    closeAddToGallery,
    canAddSourceToGallery,
    galleryImageFileForSource,
    saveUploadToGallery,
    renameGalleryItem,
    moveGalleryItem,
    editGalleryPromptNote,
    patchGalleryItem,
    selectGalleryReplacementFile,
    replaceGalleryItemImage,
    deleteGalleryItem,
    performDeleteGalleryItem,
    ensureGalleryEditPopover,
    openGalleryEditPopover,
    galleryEditFieldHtml,
    closeGalleryEditPopover,
    positionGalleryEditPopover,
    handleGalleryDocumentClick,
  });
}

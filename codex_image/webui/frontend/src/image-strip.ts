import { getEls } from "./dom";
import { getLegacyBridge, getState } from "./state";

let imageStripFeatureInitialized = false;

function legacyMethod(name: string, ...args: any[]) {
  return getLegacyBridge().methods[name]?.(...args);
}

function addImages(event: any) {
  legacyMethod("addImageFiles", event.target.files || []);
  event.target.value = "";
}

function clearImages() {
  const state = getState();
  legacyMethod("revokeUploadPreviewUrls", state.images);
  state.images = [];
  legacyMethod("syncPromptGalleryMentionsFromInputs");
  legacyMethod("setMode", "generate");
  renderImageStrip();
  legacyMethod("updateRequestPreview");
}

function createThumbAddIcon() {
  const icon = document.createElement("span");
  icon.className = "thumb-add-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-linecap="round"/></svg>';
  return icon;
}

function imageStripNeedsCompactGrid() {
  const state = getState();
  const els = getEls();
  if (!els.imageUploaderGrid || !state.images.length) return false;
  const availableWidth = Math.max(0, els.imageUploaderGrid.clientWidth - 24);
  if (!availableWidth) return false;
  const thumbCount = state.images.length;
  const fullSizeThumbsWidth = thumbCount * 116 + Math.max(0, thumbCount - 1) * 10;
  const fullSizeUploadWidth = 118;
  const fullSizeUploadGap = 10;
  return fullSizeThumbsWidth + fullSizeUploadGap + fullSizeUploadWidth > availableWidth;
}

function updateImageStripDensity() {
  const state = getState();
  const els = getEls();
  const hasImages = Boolean(state.images.length);
  const compactGrid = imageStripNeedsCompactGrid();
  els.imageUploaderGrid?.classList.toggle("has-images", hasImages);
  els.imageUploaderGrid?.classList.toggle("compact-grid", compactGrid);
}

function wheelDeltaInPixels(event: WheelEvent) {
  const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return dominantDelta * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const els = getEls();
    return dominantDelta * Math.max(1, els.imageStrip?.clientWidth || 1);
  }
  return dominantDelta;
}

function handleImageStripWheel(event: WheelEvent) {
  const els = getEls();
  const scrollTarget = els.imageUploaderGrid?.classList.contains("compact-grid") ? els.imageStrip : els.imageThumbList;
  if (!scrollTarget) return;
  const maxScrollLeft = Math.max(0, scrollTarget.scrollWidth - scrollTarget.clientWidth);
  if (!maxScrollLeft) return;
  const wheelDelta = wheelDeltaInPixels(event);
  if (!wheelDelta) return;
  const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, scrollTarget.scrollLeft + wheelDelta));
  if (nextScrollLeft === scrollTarget.scrollLeft) return;
  event.preventDefault();
  scrollTarget.scrollLeft = nextScrollLeft;
}

function renderImageStrip() {
  const state = getState();
  const els = getEls();
  const hasImages = Boolean(state.images.length);
  const thumbList = els.imageThumbList || els.imageStrip;
  updateImageStripDensity();
  if (!thumbList) return;
  if (!hasImages) {
    thumbList.innerHTML = "";
    legacyMethod("updateCustomRatioReferenceButtonState");
    return;
  }

  thumbList.innerHTML = "";
  state.images.forEach((source: any, index: number) => {
    const wrapper = document.createElement("div");
    wrapper.className = `thumb ${source.kind === "gallery" ? "gallery-thumb" : source.kind === "asset" ? "asset-thumb" : "upload-thumb"}${source.missing ? " missing-thumb" : ""}`;
    const image = document.createElement("img");
    const previewUrl = legacyMethod("sourcePreviewUrl", source);
    if (previewUrl) {
      image.src = previewUrl;
    }
    image.alt = legacyMethod("sourceName", source);
    wrapper.title = source.missing ? (source.kind === "asset" ? "最近上传已删除" : "图库图片已删除") : legacyMethod("sourceName", source);
    if (legacyMethod("isEditableImageSource", source)) {
      wrapper.classList.add("editable-thumb");
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("aria-label", `编辑${legacyMethod("sourceName", source)}`);
      wrapper.addEventListener("click", (event: any) => {
        if (event.target.closest("button")) return;
        legacyMethod("openImageEditor", index);
      });
      wrapper.addEventListener("keydown", (event: KeyboardEvent) => {
        if ((event.target as Element | null)?.closest("button")) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          legacyMethod("openImageEditor", index);
        }
      });
    }
    const badge = document.createElement("span");
    badge.className = "thumb-badge";
    badge.textContent = source.kind === "gallery" ? legacyMethod("categoryLabel", source.category) : source.kind === "asset" ? "最近" : "上传";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "thumb-remove";
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      const removedSource = state.images[index];
      legacyMethod("revokeUploadPreviewUrl", removedSource, { ignoredCurrentSources: new Set([removedSource]) });
      state.images.splice(index, 1);
      legacyMethod("syncPromptGalleryMentionsFromInputs");
      if (!state.images.length) {
        legacyMethod("setMode", "generate");
      }
      renderImageStrip();
      legacyMethod("updateRequestPreview");
    });
    wrapper.append(image, badge, remove);
    if (legacyMethod("canAddSourceToGallery", source)) {
      const addToGallery = document.createElement("button");
      addToGallery.type = "button";
      addToGallery.className = "add-upload-to-gallery";
      addToGallery.setAttribute("aria-label", "加入图库");
      addToGallery.title = "加入图库";
      addToGallery.append(createThumbAddIcon(), document.createTextNode("图库"));
      addToGallery.addEventListener("click", (event) => {
        event.stopPropagation();
        legacyMethod("openAddToGallery", index);
      });
      wrapper.append(addToGallery);
    }
    if (source.edited) {
      const editedBadge = document.createElement("span");
      editedBadge.className = "thumb-edited-badge";
      editedBadge.textContent = "已编辑";
      wrapper.append(editedBadge);
    }
    thumbList.append(wrapper);
  });
  legacyMethod("updateCustomRatioReferenceButtonState");
}

function bindImageStripEvents() {
  const els = getEls();
  els.imageInput?.addEventListener("change", addImages);
  els.clearImagesButton?.addEventListener("click", clearImages);
  els.imageStrip?.addEventListener("wheel", handleImageStripWheel, { passive: false });
  window.addEventListener("resize", updateImageStripDensity);
}

export function initImageStripFeature() {
  if (imageStripFeatureInitialized) return;
  imageStripFeatureInitialized = true;
  bindImageStripEvents();
  Object.assign(getLegacyBridge().methods, {
    addImages,
    clearImages,
    updateImageStripDensity,
    handleImageStripWheel,
    renderImageStrip,
  });
}

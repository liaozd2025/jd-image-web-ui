import { getLegacyBridge } from "./state";
import { formatTranslation, LOCALE_CHANGE_EVENT, translate } from "./i18n";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let recentAssetsFeatureInitialized = false;
const RECENT_ASSET_RENDER_BATCH_SIZE = 12;
const RECENT_ASSET_LOAD_AHEAD_PX = 96;
let recentAssetRenderLimit = RECENT_ASSET_RENDER_BATCH_SIZE;

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
function setMode(mode: any): void { legacyMethod("setMode", mode); }
function addReferenceAssetInput(item: any): void { legacyMethod("addReferenceAssetInput", item); }
function renderImageStrip(): void { legacyMethod("renderImageStrip"); }
function updateRequestPreview(): void { legacyMethod("updateRequestPreview"); }

function recentAssetName(item: any): string {
  return item?.filename || translate("recentAssets.defaultName");
}

async function refreshRecentAssets() {
  if (!els.recentAssetList) return;
  try {
    const response = await fetch("/api/reference-assets/recent?limit=50");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || translate("recentAssets.loadFailed"));
    }
    state.recentAssets = Array.isArray(data.items) ? data.items : [];
    recentAssetRenderLimit = RECENT_ASSET_RENDER_BATCH_SIZE;
    renderRecentAssets();
  } catch {
    state.recentAssets = [];
    recentAssetRenderLimit = RECENT_ASSET_RENDER_BATCH_SIZE;
    renderRecentAssets();
  }
}

function renderRecentAssets() {
  if (!els.recentAssetDock || !els.recentAssetList) return;
  const items = state.recentAssets.filter((item: any) => item?.id && item?.image_url);
  const visibleItems = items.slice(0, recentAssetRenderLimit);
  els.recentAssetDock.classList.toggle("hidden", !items.length);
  els.recentAssetList.innerHTML = visibleItems.map((item: any) => {
    const name = recentAssetName(item);
    return `
    <div class="recent-asset-button" title="${escapeHtml(name)}">
      <button class="recent-asset-use" type="button" data-reference-asset-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(formatTranslation("recentAssets.use", { name }))}">
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">
        <span>${escapeHtml(name)}</span>
      </button>
      <button class="recent-asset-delete" type="button" data-reference-asset-delete="${escapeHtml(item.id)}" aria-label="${escapeHtml(formatTranslation("recentAssets.delete", { name }))}">×</button>
    </div>
  `;
  }).join("");
}

function handleRecentAssetClick(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  const deleteButton = target?.closest("[data-reference-asset-delete]") as HTMLElement | null;
  if (deleteButton) {
    event.stopPropagation();
    const item = state.recentAssets.find((candidate: any) => candidate.id === deleteButton.dataset.referenceAssetDelete);
    if (!item) return;
    openConfirmPopover(deleteButton, {
      title: translate("recentAssets.deleteTitle"),
      message: translate("recentAssets.deleteMessage"),
      detail: recentAssetName(item),
      confirmText: translate("action.delete"),
      onConfirm: () => deleteRecentAsset(item.id),
    });
    return;
  }
  const useButton = target?.closest("[data-reference-asset-id]") as HTMLElement | null;
  if (!useButton) return;
  const item = state.recentAssets.find((candidate: any) => candidate.id === useButton.dataset.referenceAssetId);
  if (item) addReferenceAssetInput(item);
}

function handleRecentAssetScroll() {
  const list = els.recentAssetList;
  if (!list || recentAssetRenderLimit >= state.recentAssets.length) return;
  const remaining = list.scrollWidth - list.clientWidth - list.scrollLeft;
  if (remaining > RECENT_ASSET_LOAD_AHEAD_PX) return;
  const scrollLeft = list.scrollLeft;
  recentAssetRenderLimit += RECENT_ASSET_RENDER_BATCH_SIZE;
  renderRecentAssets();
  list.scrollLeft = scrollLeft;
}

function wheelDeltaInPixels(event: WheelEvent) {
  const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return dominantDelta * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return dominantDelta * Math.max(1, els.recentAssetList?.clientWidth || 1);
  }
  return dominantDelta;
}

function handleRecentAssetWheel(event: WheelEvent) {
  const list = els.recentAssetList;
  if (!list) return;
  const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
  if (!maxScrollLeft) return;
  const wheelDelta = wheelDeltaInPixels(event);
  if (!wheelDelta) return;
  const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, list.scrollLeft + wheelDelta));
  if (nextScrollLeft === list.scrollLeft) return;
  event.preventDefault();
  list.scrollLeft = nextScrollLeft;
}

async function deleteRecentAsset(assetId: any) {
  if (!assetId) return;
  try {
    const response = await fetch(`/api/reference-assets/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || translate("recentAssets.deleteFailed"));
    }
    state.recentAssets = state.recentAssets.filter((item: any) => item.id !== assetId);
    state.images = state.images.filter((source: any) => !(source.kind === "asset" && source.id === assetId));
    if (!state.images.length) {
      setMode("generate");
    }
    renderRecentAssets();
    renderImageStrip();
    updateRequestPreview();
    setStatus(translate("recentAssets.deleted"), "ok");
  } catch (error: any) {
    setStatus(error.message || translate("recentAssets.deleteFailed"), "error");
  }
}

export function initRecentAssetsFeature() {
  if (recentAssetsFeatureInitialized) return;
  recentAssetsFeatureInitialized = true;
  els.recentAssetList?.addEventListener("wheel", handleRecentAssetWheel, { passive: false });
  els.recentAssetList?.addEventListener("scroll", handleRecentAssetScroll, { passive: true });
  els.recentAssetList?.addEventListener("click", handleRecentAssetClick);
  document.addEventListener(LOCALE_CHANGE_EVENT, renderRecentAssets);
  Object.assign(getLegacyBridge().methods, {
    refreshRecentAssets,
    renderRecentAssets,
    handleRecentAssetWheel,
    handleRecentAssetScroll,
    deleteRecentAsset,
  });
}

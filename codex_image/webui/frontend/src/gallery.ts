import { getLegacyBridge } from "./state";
import { translate } from "./i18n";
import { getCurrentServerUser } from "./server-account";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let galleryFeatureInitialized = false;
let galleryFeatureEventsBound = false;
let lastGalleryTrigger: HTMLElement | null = null;

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") {
    throw new Error("Legacy method " + name + " is not initialized");
  }
  return method(...args);
}

function setStatus(message: any, type?: any): void { legacyMethod("setStatus", message, type); }
function closeConfirmPopover(): void { legacyMethod("closeConfirmPopover"); }
const defaultGalleryCategories = (): any => legacyMethod("defaultGalleryCategories");
const normalizeGalleryCategories = (categories: any): any => legacyMethod("normalizeGalleryCategories", categories);
const ensureActiveGalleryCategory = (): void => { legacyMethod("ensureActiveGalleryCategory"); };
const renderGalleryCategoryControls = (): void => { legacyMethod("renderGalleryCategoryControls"); };
const findGalleryCategory = (categoryId: any): any => legacyMethod("findGalleryCategory", categoryId);
const renderQuickGalleryDock = (): void => { legacyMethod("renderQuickGalleryDock"); };
const renderGalleryGrid = (options?: any): void => { legacyMethod("renderGalleryGrid", options); };
const resetGalleryGridTransition = (invalidate?: any): void => { legacyMethod("resetGalleryGridTransition", invalidate); };
const closeGalleryEditPopover = (): void => { legacyMethod("closeGalleryEditPopover"); };

function sortGalleryItems(items: any[]) {
  const categories = normalizeGalleryCategories(state.galleryCategories);
  const categoryOrder = new Map(categories.map((category: any) => [String(category.id), Number(category.order) || 0]));
  return [...items].sort((left, right) => {
    const leftCategoryOrder = Number(categoryOrder.get(String(left.category || "")) ?? Number.MAX_SAFE_INTEGER);
    const rightCategoryOrder = Number(categoryOrder.get(String(right.category || "")) ?? Number.MAX_SAFE_INTEGER);
    if (leftCategoryOrder !== rightCategoryOrder) {
      return leftCategoryOrder - rightCategoryOrder;
    }
    const leftOrder = Number(left.order) > 0 ? Number(left.order) : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number(right.order) > 0 ? Number(right.order) : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    const leftCreatedAt = String(left.created_at || "");
    const rightCreatedAt = String(right.created_at || "");
    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt.localeCompare(leftCreatedAt, "zh-CN", { numeric: true, sensitivity: "base" });
    }
    const leftName = String(left.name || "");
    const rightName = String(right.name || "");
    return leftName.localeCompare(rightName, "zh-CN", { numeric: true, sensitivity: "base" });
  });
}

function filterGalleryItems(category: any = state.activeGalleryCategory) {
  return sortGalleryItems(state.galleryItems.filter((item: any) => item.category === category));
}

async function refreshGallery() {
  try {
    const response = await fetch("/api/gallery");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || translate("gallery.loadFailed"));
    }
    state.galleryItems = sortGalleryItems(data.items || []);
    state.galleryCategories = normalizeGalleryCategories(data.categories);
    ensureActiveGalleryCategory();
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    if (els.galleryDrawer?.classList.contains("open")) renderGalleryGrid();
  } catch (error: any) {
    state.galleryItems = [];
    state.galleryCategories = defaultGalleryCategories();
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    setStatus(error.message || translate("gallery.loadFailed"), "error");
  }
}

async function openGallery(category: any) {
  legacyMethod("closePromptTemplateDrawer", { restoreFocus: false });
  lastGalleryTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : (els.galleryManageButton as HTMLElement | null);
  state.activeGalleryCategory = findGalleryCategory(category) ? category : (state.galleryCategories[0]?.id || "portrait");
  await refreshGallery();
  renderGalleryCategoryControls();
  renderGalleryGrid();
  els.galleryDrawer?.classList.add("open");
  els.galleryDrawer?.setAttribute("aria-hidden", "false");
  els.galleryDrawerBackdrop?.classList.remove("hidden");
  els.galleryManageButton?.setAttribute("aria-expanded", "true");
  window.setTimeout(() => {
    (els.galleryDrawerClose as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, 0);
}

function closeGallery(options: any = {}) {
  const restoreFocus = options?.restoreFocus !== false;
  closeGalleryEditPopover();
  closeConfirmPopover();
  resetGalleryGridTransition();
  els.galleryDrawer?.classList.remove("open");
  els.galleryDrawer?.setAttribute("aria-hidden", "true");
  els.galleryDrawerBackdrop?.classList.add("hidden");
  els.galleryManageButton?.setAttribute("aria-expanded", "false");
  if (restoreFocus) {
    const focusTarget = lastGalleryTrigger || (els.galleryManageButton as HTMLElement | null);
    focusTarget?.focus?.({ preventScroll: true });
  }
}

function findGalleryItem(itemId: any) {
  return state.galleryItems.find((item: any) => item.id === itemId);
}

function applyGalleryItemOrder(category: any, itemIds: string[]) {
  const orderMap = new Map(itemIds.map((itemId, index) => [itemId, (index + 1) * 10]));
  state.galleryItems = sortGalleryItems(
    state.galleryItems.map((item: any) => (
      item.category === category && orderMap.has(item.id)
        ? { ...item, order: orderMap.get(item.id) }
        : item
    ))
  );
  renderQuickGalleryDock();
  renderGalleryGrid();
}

async function persistGalleryItemOrder(category: any, itemIds: string[]) {
  try {
    const response = await fetch("/api/gallery/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, item_ids: itemIds }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || translate("gallery.imageOrderUpdateFailed"));
    const reorderedIds = new Set(itemIds);
    const reorderedItems = Array.isArray(data.items) ? data.items : [];
    state.galleryItems = sortGalleryItems([
      ...state.galleryItems.filter((item: any) => !(item.category === category && reorderedIds.has(item.id))),
      ...reorderedItems,
    ]);
    renderQuickGalleryDock();
    renderGalleryGrid();
    setStatus(translate("gallery.imageOrderUpdated"), "ok");
  } catch (error: any) {
    await refreshGallery();
    setStatus(error.message || translate("gallery.imageOrderUpdateFailed"), "error");
  }
}

function handleGalleryManageButtonClick() {
  void openGallery(state.activeGalleryCategory);
}

function syncGalleryRoleVisibility() {
  const isAdmin = getCurrentServerUser()?.role === "admin";
  if (els.gallerySharedImageUploadButton) {
    els.gallerySharedImageUploadButton.hidden = !isAdmin;
    els.gallerySharedImageUploadButton.classList.toggle("hidden", !isAdmin);
    els.gallerySharedImageUploadButton.disabled = !isAdmin;
  }
  if (els.gallerySharedImageInput) els.gallerySharedImageInput.disabled = !isAdmin;
  if (els.galleryScopeSharedOption) {
    els.galleryScopeSharedOption.hidden = !isAdmin;
    els.galleryScopeSharedOption.disabled = !isAdmin;
  }
  if (!isAdmin && els.galleryScopeInput?.value === "shared") {
    els.galleryScopeInput.value = "personal";
    els.galleryScopeInput.dispatchEvent(new Event("change"));
  }
  if (els.galleryDrawer?.classList.contains("open")) renderGalleryGrid();
}

function sharedGalleryImageName(file: File): string {
  return String(file.name || translate("gallery.sharedImageFallbackName"))
    .replace(/\.[^.]+$/, "")
    .trim()
    .slice(0, 160) || translate("gallery.sharedImageFallbackName");
}

function sharedGalleryItemFromAsset(asset: any) {
  const assetId = String(asset?.asset_id || "");
  if (!assetId || !asset?.download_url) return null;
  return {
    id: `shared:${assetId}`,
    name: String(asset.name || translate("gallery.sharedImageFallbackName")),
    category: "portrait",
    category_name: translate("gallery.categoryPortrait"),
    category_prompt_role: "",
    prompt_note: "",
    order: 0,
    image_url: asset.download_url,
    scope: "shared",
    read_only: true,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

async function uploadSharedGalleryImage(file: File): Promise<void> {
  if (getCurrentServerUser()?.role !== "admin") return;
  if (!String(file.type || "").startsWith("image/")) {
    setStatus(translate("gallery.sharedImageOnly"), "error");
    return;
  }
  if (els.gallerySharedImageUploadButton) els.gallerySharedImageUploadButton.disabled = true;
  try {
    const form = new FormData();
    form.append("name", sharedGalleryImageName(file));
    form.append("asset_kind", "image");
    form.append("file", file);
    const response = await fetch("/api/shared-assets", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || translate("gallery.sharedImageUploadFailed"));
    state.activeGalleryCategory = "portrait";
    await refreshGallery();
    const itemId = `shared:${data.asset?.asset_id || ""}`;
    const fallbackItem = findGalleryItem(itemId) ? null : sharedGalleryItemFromAsset(data.asset);
    if (fallbackItem) {
      state.galleryItems = sortGalleryItems([
        ...state.galleryItems.filter((item: any) => item.id !== fallbackItem.id),
        fallbackItem,
      ]);
      renderQuickGalleryDock();
      if (els.galleryDrawer?.classList.contains("open")) renderGalleryGrid();
    }
    setStatus(translate("gallery.sharedImageUploaded"), "ok");
  } catch (error: any) {
    setStatus(error.message || translate("gallery.sharedImageUploadFailed"), "error");
  } finally {
    if (els.gallerySharedImageInput) els.gallerySharedImageInput.value = "";
    if (els.gallerySharedImageUploadButton) {
      els.gallerySharedImageUploadButton.disabled = getCurrentServerUser()?.role !== "admin";
    }
  }
}

function handleSharedGalleryImageSelection(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void uploadSharedGalleryImage(file);
}

function bindGalleryFeatureEvents() {
  if (galleryFeatureEventsBound) return;
  galleryFeatureEventsBound = true;
  els.galleryManageButton?.addEventListener("click", handleGalleryManageButtonClick);
  els.gallerySharedImageUploadButton?.addEventListener("click", () => els.gallerySharedImageInput?.click());
  els.gallerySharedImageInput?.addEventListener("change", handleSharedGalleryImageSelection);
  els.galleryDrawerClose?.addEventListener("click", () => closeGallery());
  els.galleryDrawerBackdrop?.addEventListener("click", () => closeGallery());
}

export function initGalleryFeature() {
  if (galleryFeatureInitialized) return;
  galleryFeatureInitialized = true;
  bindGalleryFeatureEvents();
  syncGalleryRoleVisibility();
  document.addEventListener("codex-image-user-context", syncGalleryRoleVisibility);
  Object.assign(getLegacyBridge().methods, {
    sortGalleryItems,
    filterGalleryItems,
    refreshGallery,
    openGallery,
    closeGallery,
    findGalleryItem,
    applyGalleryItemOrder,
    persistGalleryItemOrder,
    syncGalleryRoleVisibility,
    uploadSharedGalleryImage,
  });
}

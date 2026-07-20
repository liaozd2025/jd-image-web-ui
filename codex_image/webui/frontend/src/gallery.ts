import { getLegacyBridge } from "./state";
import { translate } from "./i18n";
import { getCurrentServerUser } from "./server-account";
import { sharedGalleryItemFromAsset } from "./shared-gallery-item";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

type GalleryScope = "personal" | "shared";

let galleryFeatureInitialized = false;
let galleryFeatureEventsBound = false;
let lastGalleryTrigger: HTMLElement | null = null;
let pendingSharedFiles: File[] = [];

function legacyMethod(name: string, ...args: any[]): any {
  const method = getLegacyBridge().methods[name];
  if (typeof method !== "function") throw new Error(`Legacy method ${name} is not initialized`);
  return method(...args);
}

function setStatus(message: any, type?: any): void { legacyMethod("setStatus", message, type); }
function escapeHtml(value: any): string { return legacyMethod("escapeHtml", value); }
function closeConfirmPopover(): void { legacyMethod("closeConfirmPopover"); }
const defaultGalleryCategories = (): any[] => legacyMethod("defaultGalleryCategories");
const normalizeGalleryCategories = (categories: any): any[] => legacyMethod("normalizeGalleryCategories", categories);
const ensureActiveGalleryCategory = (): void => { legacyMethod("ensureActiveGalleryCategory"); };
const renderGalleryCategoryControls = (): void => { legacyMethod("renderGalleryCategoryControls"); };
const findGalleryCategory = (categoryId: any): any => legacyMethod("findGalleryCategory", categoryId);
const renderQuickGalleryDock = (): void => { legacyMethod("renderQuickGalleryDock"); };
const renderGalleryGrid = (options?: any): void => { legacyMethod("renderGalleryGrid", options); };
const resetGalleryGridTransition = (invalidate?: any): void => { legacyMethod("resetGalleryGridTransition", invalidate); };
const closeGalleryEditPopover = (): void => { legacyMethod("closeGalleryEditPopover"); };

function activeLibraryState() {
  return state.activeGalleryScope === "shared"
    ? state.galleryLibraryState.shared
    : state.galleryLibraryState.personal;
}

function activeCategories(): any[] {
  return state.activeGalleryScope === "shared"
    ? normalizeGalleryCategories(state.sharedGalleryCategories)
    : normalizeGalleryCategories(state.galleryCategories);
}

function sortGalleryItems(items: any[]) {
  const categoryOrder = new Map(activeCategories().map((category: any) => [String(category.id), Number(category.order) || 0]));
  return [...items].sort((left, right) => {
    const categoryDifference = Number(categoryOrder.get(String(left.category || "")) ?? Number.MAX_SAFE_INTEGER)
      - Number(categoryOrder.get(String(right.category || "")) ?? Number.MAX_SAFE_INTEGER);
    if (categoryDifference) return categoryDifference;
    const orderDifference = (Number(left.order) || Number.MAX_SAFE_INTEGER) - (Number(right.order) || Number.MAX_SAFE_INTEGER);
    if (orderDifference) return orderDifference;
    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN", { numeric: true, sensitivity: "base" });
  });
}

function filterGalleryItems(category: any = state.activeGalleryCategory) {
  const scope = state.activeGalleryScope as GalleryScope;
  const query = String(activeLibraryState()?.query || "").trim().toLocaleLowerCase();
  const status = activeLibraryState()?.status || "active";
  return sortGalleryItems(state.galleryItems.filter((item: any) => (
    item.scope === scope
    && item.category === category
    && (scope !== "shared" || (status === "inactive" ? item.is_active === false : item.is_active !== false))
    && (!query || String(item.name || "").toLocaleLowerCase().includes(query) || String(item.prompt_note || "").toLocaleLowerCase().includes(query))
  )));
}

async function refreshGallery() {
  try {
    const [galleryResponse, sharedCategoryResponse] = await Promise.all([
      fetch("/api/gallery"),
      fetch("/api/shared-gallery/categories"),
    ]);
    const galleryData = await galleryResponse.json();
    const sharedCategoryData = await sharedCategoryResponse.json();
    if (!galleryResponse.ok) throw new Error(galleryData.detail || translate("gallery.loadFailed"));
    if (!sharedCategoryResponse.ok) throw new Error(sharedCategoryData.detail || translate("gallery.categoryLoadFailed"));
    let items = Array.isArray(galleryData.items) ? galleryData.items : [];
    state.galleryCategories = normalizeGalleryCategories(galleryData.categories);
    state.sharedGalleryCategories = normalizeGalleryCategories(sharedCategoryData.categories);

    if (state.activeGalleryScope === "shared" && activeLibraryState()?.status === "inactive" && getCurrentServerUser()?.role === "admin") {
      const inactiveResponse = await fetch("/api/shared-gallery/items?status=inactive");
      const inactiveData = await inactiveResponse.json();
      if (!inactiveResponse.ok) throw new Error(inactiveData.detail || translate("gallery.loadFailed"));
      const inactiveItems = (inactiveData.items || []).map(sharedGalleryItemFromAsset).filter(Boolean);
      items = [...items.filter((item: any) => item.scope !== "shared"), ...inactiveItems];
    }
    state.galleryItems = sortGalleryItems(items);
    syncActiveCategory();
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

function syncActiveCategory() {
  const library = activeLibraryState();
  const categories = activeCategories();
  if (!categories.some((category: any) => category.id === library.category)) {
    library.category = categories[0]?.id || (state.activeGalleryScope === "shared" ? "uncategorized" : "portrait");
  }
  state.activeGalleryCategory = library.category;
}

async function openGallery(scope: GalleryScope) {
  legacyMethod("closePromptTemplateDrawer", { restoreFocus: false });
  lastGalleryTrigger = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : (scope === "shared" ? els.gallerySharedManageButton : els.galleryPersonalManageButton);
  state.activeGalleryScope = scope;
  syncActiveCategory();
  syncGalleryManagementControls();
  renderGalleryCategoryControls();
  renderGalleryGrid();
  els.galleryDrawer?.classList.add("open");
  els.galleryDrawer?.setAttribute("aria-hidden", "false");
  els.galleryDrawerBackdrop?.classList.remove("hidden");
  els.galleryPersonalManageButton?.setAttribute("aria-expanded", String(scope === "personal"));
  els.gallerySharedManageButton?.setAttribute("aria-expanded", String(scope === "shared"));
  await refreshGallery();
  syncGalleryManagementControls();
  window.setTimeout(() => (els.galleryDrawerClose as HTMLElement | null)?.focus?.({ preventScroll: true }), 0);
}

function closeGallery(options: any = {}) {
  const restoreFocus = options?.restoreFocus !== false;
  closeGalleryEditPopover();
  closeConfirmPopover();
  resetGalleryGridTransition();
  els.galleryDrawer?.classList.remove("open");
  els.galleryDrawer?.setAttribute("aria-hidden", "true");
  els.galleryDrawerBackdrop?.classList.add("hidden");
  els.galleryPersonalManageButton?.setAttribute("aria-expanded", "false");
  els.gallerySharedManageButton?.setAttribute("aria-expanded", "false");
  if (restoreFocus) lastGalleryTrigger?.focus?.({ preventScroll: true });
}

function findGalleryItem(itemId: any) {
  return state.galleryItems.find((item: any) => item.id === itemId);
}

function applyGalleryItemOrder(category: any, itemIds: string[]) {
  const orderMap = new Map(itemIds.map((itemId, index) => [itemId, (index + 1) * 10]));
  state.galleryItems = state.galleryItems.map((item: any) => orderMap.has(item.id) ? { ...item, order: orderMap.get(item.id) } : item);
  renderQuickGalleryDock();
  renderGalleryGrid();
}

async function persistGalleryItemOrder(category: any, itemIds: string[]) {
  const shared = state.activeGalleryScope === "shared";
  const normalizedIds = shared ? itemIds.map((itemId) => itemId.replace(/^shared:/, "")) : itemIds;
  try {
    const response = await fetch(shared ? "/api/shared-gallery/items/reorder" : "/api/gallery/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shared ? { category_id: category, item_ids: normalizedIds } : { category, item_ids: normalizedIds }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || translate("gallery.imageOrderUpdateFailed"));
    await refreshGallery();
    setStatus(translate("gallery.imageOrderUpdated"), "ok");
  } catch (error: any) {
    await refreshGallery();
    setStatus(error.message || translate("gallery.imageOrderUpdateFailed"), "error");
  }
}

function syncGalleryManagementControls() {
  const shared = state.activeGalleryScope === "shared";
  const isAdmin = getCurrentServerUser()?.role === "admin";
  document.querySelectorAll("[data-gallery-scope-tab]").forEach((tab: any) => {
    const selected = tab.dataset.galleryScopeTab === state.activeGalleryScope;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  if (els.gallerySearchInput) els.gallerySearchInput.value = activeLibraryState()?.query || "";
  if (els.galleryInactiveToggle) els.galleryInactiveToggle.checked = activeLibraryState()?.status === "inactive";
  const showSharedAdmin = shared && isAdmin;
  [els.gallerySharedImageUploadButton, els.galleryBatchUploadButton, els.galleryInactiveToggleLabel].forEach((element: any) => {
    if (!element) return;
    element.hidden = !showSharedAdmin;
    element.classList.toggle("hidden", !showSharedAdmin);
  });
  if (els.gallerySharedImageInput) els.gallerySharedImageInput.disabled = !showSharedAdmin;
  if (els.galleryBatchUploadInput) els.galleryBatchUploadInput.disabled = !showSharedAdmin;
  if (els.galleryCategoryManageToggle) {
    const canManageCategories = !shared || isAdmin;
    els.galleryCategoryManageToggle.hidden = !canManageCategories;
    els.galleryCategoryManageToggle.classList.toggle("hidden", !canManageCategories);
  }
}

function syncGalleryRoleVisibility() {
  const isAdmin = getCurrentServerUser()?.role === "admin";
  if (!isAdmin && state.activeGalleryScope === "shared" && activeLibraryState()?.status === "inactive") {
    activeLibraryState().status = "active";
  }
  if (els.galleryScopeSharedOption) {
    els.galleryScopeSharedOption.hidden = !isAdmin;
    els.galleryScopeSharedOption.disabled = !isAdmin;
  }
  syncGalleryManagementControls();
  if (els.galleryDrawer?.classList.contains("open")) renderGalleryGrid();
}

function sharedImageName(file: File): string {
  return String(file.name || translate("gallery.sharedImageFallbackName")).replace(/\.[^.]+$/, "").trim().slice(0, 160)
    || translate("gallery.sharedImageFallbackName");
}

function openSharedUpload(files: File[]) {
  if (getCurrentServerUser()?.role !== "admin" || !files.length) return;
  pendingSharedFiles = files;
  const categories = normalizeGalleryCategories(state.sharedGalleryCategories);
  if (els.sharedGalleryUploadCategory) {
    els.sharedGalleryUploadCategory.innerHTML = categories.map((category: any) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
    els.sharedGalleryUploadCategory.value = activeLibraryState()?.category || categories[0]?.id || "uncategorized";
  }
  if (els.sharedGalleryUploadNames) {
    els.sharedGalleryUploadNames.innerHTML = files.map((file, index) => `
      <label class="field-block">
        <span>${escapeHtml(file.name)}</span>
        <input class="control" data-shared-upload-name="${index}" maxlength="160" value="${escapeHtml(sharedImageName(file))}">
        <small class="shared-gallery-upload-result is-pending" data-shared-upload-result="${index}">${translate("gallery.uploadPending")}</small>
      </label>
    `).join("");
  }
  if (els.sharedGalleryUploadNote) els.sharedGalleryUploadNote.value = "";
  if (els.sharedGalleryUploadTitle) els.sharedGalleryUploadTitle.textContent = files.length > 1 ? translate("gallery.batchUpload") : translate("gallery.uploadTitle");
  els.sharedGalleryUploadModal?.classList.remove("hidden");
  els.sharedGalleryUploadSave.disabled = false;
  els.sharedGalleryUploadNames?.querySelector("input")?.focus();
}

function closeSharedUpload() {
  pendingSharedFiles = [];
  els.sharedGalleryUploadModal?.classList.add("hidden");
  if (els.gallerySharedImageInput) els.gallerySharedImageInput.value = "";
  if (els.galleryBatchUploadInput) els.galleryBatchUploadInput.value = "";
  if (els.sharedGalleryUploadSave) els.sharedGalleryUploadSave.disabled = false;
}

function sharedUploadErrorLabel(error: any) {
  const keyByError: Record<string, string> = {
    name_conflict: "gallery.uploadErrorNameConflict",
    invalid_image: "gallery.uploadErrorInvalidImage",
    file_too_large: "gallery.uploadErrorFileTooLarge",
    quota_exceeded: "gallery.uploadErrorQuotaExceeded",
  };
  const key = keyByError[String(error || "")];
  return key ? translate(key) : String(error || translate("gallery.uploadFailed"));
}

function renderSharedUploadResults(results: any[]) {
  results.forEach((result: any, index: number) => {
    const target = els.sharedGalleryUploadNames?.querySelector(`[data-shared-upload-result="${index}"]`);
    if (!target) return;
    const created = result?.status === "created";
    target.classList.toggle("is-pending", false);
    target.classList.toggle("is-success", created);
    target.classList.toggle("is-error", !created);
    target.textContent = created
      ? translate("gallery.uploadCreated")
      : `${translate("gallery.uploadFailed")}: ${sharedUploadErrorLabel(result?.error)}`;
  });
}

async function saveSharedUpload() {
  if (!pendingSharedFiles.length || getCurrentServerUser()?.role !== "admin") return;
  const names = pendingSharedFiles.map((_, index) => String(els.sharedGalleryUploadNames?.querySelector(`[data-shared-upload-name="${index}"]`)?.value || "").trim());
  if (names.some((name) => !name)) {
    setStatus(translate("gallery.nameRequired"), "error");
    return;
  }
  const categoryId = els.sharedGalleryUploadCategory?.value;
  const note = els.sharedGalleryUploadNote?.value.trim() || "";
  if (!categoryId) {
    setStatus(translate("gallery.categoryRequired"), "error");
    return;
  }
  els.sharedGalleryUploadSave.disabled = true;
  let retainResults = false;
  try {
    const form = new FormData();
    form.append("category_id", categoryId);
    form.append("prompt_note", note);
    let endpoint = "/api/shared-gallery/items";
    if (pendingSharedFiles.length === 1) {
      form.append("name", names[0]!);
      form.append("file", pendingSharedFiles[0]!);
    } else {
      endpoint = "/api/shared-gallery/items/batch";
      form.append("names", JSON.stringify(names));
      pendingSharedFiles.forEach((file) => form.append("files", file));
    }
    const response = await fetch(endpoint, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207) throw new Error(data.detail || translate("gallery.saveFailed"));
    if (response.status === 207) {
      renderSharedUploadResults(data.results || []);
      const failures = (data.results || []).filter((result: any) => result.status !== "created");
      setStatus(failures.length ? `${pendingSharedFiles.length - failures.length}/${pendingSharedFiles.length} ${translate("gallery.batchUploaded")}` : translate("gallery.batchUploaded"), failures.length ? "error" : "ok");
      retainResults = failures.length > 0;
    } else {
      setStatus(translate("gallery.savedAsReference"), "ok");
    }
    if (retainResults) pendingSharedFiles = [];
    else closeSharedUpload();
    await refreshGallery();
  } catch (error: any) {
    setStatus(error.message || translate("gallery.saveFailed"), "error");
  } finally {
    els.sharedGalleryUploadSave.disabled = retainResults;
  }
}

async function restoreSharedGalleryItem(itemId: string) {
  if (getCurrentServerUser()?.role !== "admin") return;
  const assetId = itemId.replace(/^shared:/, "");
  try {
    const response = await fetch(`/api/shared-assets/${encodeURIComponent(assetId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || translate("gallery.restoreFailed"));
    await refreshGallery();
    setStatus(translate("gallery.restored"), "ok");
  } catch (error: any) {
    setStatus(error.message || translate("gallery.restoreFailed"), "error");
  }
}

function bindGalleryFeatureEvents() {
  if (galleryFeatureEventsBound) return;
  galleryFeatureEventsBound = true;
  els.galleryPersonalManageButton?.addEventListener("click", () => void openGallery("personal"));
  els.gallerySharedManageButton?.addEventListener("click", () => void openGallery("shared"));
  els.galleryScopeTabs?.addEventListener("click", (event: any) => {
    const tab = event.target.closest?.("[data-gallery-scope-tab]");
    if (tab) void openGallery(tab.dataset.galleryScopeTab as GalleryScope);
  });
  els.gallerySearchInput?.addEventListener("input", () => {
    activeLibraryState().query = els.gallerySearchInput.value;
    renderGalleryGrid();
  });
  els.galleryInactiveToggle?.addEventListener("change", () => {
    activeLibraryState().status = els.galleryInactiveToggle.checked ? "inactive" : "active";
    void refreshGallery();
  });
  els.gallerySharedImageUploadButton?.addEventListener("click", () => els.gallerySharedImageInput?.click());
  els.galleryBatchUploadButton?.addEventListener("click", () => els.galleryBatchUploadInput?.click());
  els.gallerySharedImageInput?.addEventListener("change", (event: any) => openSharedUpload(Array.from(event.target.files || []).slice(0, 1) as File[]));
  els.galleryBatchUploadInput?.addEventListener("change", (event: any) => openSharedUpload(Array.from(event.target.files || []).slice(0, 50) as File[]));
  els.sharedGalleryUploadSave?.addEventListener("click", () => void saveSharedUpload());
  els.sharedGalleryUploadClose?.addEventListener("click", closeSharedUpload);
  els.sharedGalleryUploadCancel?.addEventListener("click", closeSharedUpload);
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
    restoreSharedGalleryItem,
  });
}

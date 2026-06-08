import { getLegacyBridge } from "./state";
import { setGalleryDragPreview } from "./gallery-drag-preview";

interface GalleryCategory {
  id: string;
  name: string;
  prompt_role: string;
  order: number;
  locked: boolean;
}

const DEFAULT_GALLERY_CATEGORY_LABELS: Record<string, string> = {
  portrait: "人像",
  character: "角色",
  product: "产品",
};

const DEFAULT_GALLERY_CATEGORIES: GalleryCategory[] = [
  { id: "portrait", name: "人像", prompt_role: "人像参考", order: 10, locked: false },
  { id: "character", name: "角色", prompt_role: "角色参考", order: 20, locked: false },
  { id: "product", name: "产品", prompt_role: "产品参考", order: 30, locked: false },
];

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let galleryCategoriesFeatureInitialized = false;
let galleryCategoriesEventsBound = false;
let galleryCategoryManagerExpanded = false;
let draggedGalleryCategoryId: string | null = null;
let galleryCategoryDropTargetId: string | null = null;
let galleryCategoryDropPlacement: "before" | "after" = "after";
let galleryCategoryOriginalOrder: string[] = [];

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
function closeGalleryEditPopover(): void { legacyMethod("closeGalleryEditPopover"); }
function renderQuickGalleryDock(): void { legacyMethod("renderQuickGalleryDock"); }
function renderGalleryGrid(options?: any): void { legacyMethod("renderGalleryGrid", options); }
function renderImageStrip(): void { legacyMethod("renderImageStrip"); }
function updateRequestPreview(): void { legacyMethod("updateRequestPreview"); }
function refreshGallery(): Promise<void> { return legacyMethod("refreshGallery"); }

function cssEscape(value: any): string {
  const text = String(value || "");
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

function defaultGalleryCategories(): GalleryCategory[] {
  return DEFAULT_GALLERY_CATEGORIES.map((category) => ({ ...category }));
}

function normalizeGalleryCategory(category: any): GalleryCategory | null {
  const id = String(category?.id || "").trim();
  if (!id) return null;
  const name = String(category?.name || DEFAULT_GALLERY_CATEGORY_LABELS[id] || id).trim() || id;
  const promptRole = String(category?.prompt_role || name).trim() || name;
  const order = Number.isFinite(Number(category?.order)) ? Number(category.order) : 0;
  return {
    id,
    name,
    prompt_role: promptRole,
    order,
    locked: Boolean(category?.locked),
  };
}

function normalizeGalleryCategories(categories: any): GalleryCategory[] {
  const source: any[] = Array.isArray(categories) && categories.length ? categories : defaultGalleryCategories();
  const seen = new Set();
  return source
    .map(normalizeGalleryCategory)
    .filter((category): category is GalleryCategory => {
      if (!category || seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    })
    .sort((left, right) => (left.order - right.order) || left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }));
}

function handleQuickGalleryCategoryEvent(event: any) {
  const button = event.target.closest?.("[data-quick-gallery-category]");
  if (!button || !els.quickGalleryRail?.contains(button)) return;
  setQuickGalleryCategory(button.dataset.quickGalleryCategory);
}

function ensureActiveGalleryCategory() {
  if (findGalleryCategory(state.activeGalleryCategory)) return;
  state.activeGalleryCategory = state.galleryCategories[0]?.id || "portrait";
}

function renderGalleryCategoryControls() {
  ensureActiveGalleryCategory();
  const categories = normalizeGalleryCategories(state.galleryCategories);
  if (els.quickGalleryRail) {
    els.quickGalleryRail.innerHTML = categories.map((category) => `
      <button class="quick-gallery-category${category.id === state.activeGalleryCategory ? " active" : ""}" data-quick-gallery-category="${escapeHtml(category.id)}" type="button">${escapeHtml(category.name)}</button>
    `).join("");
  }
  if (els.galleryCategoryInput) {
    const currentValue = els.galleryCategoryInput.value || state.activeGalleryCategory;
    els.galleryCategoryInput.innerHTML = categories.map((category) => `
      <option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>
    `).join("");
    els.galleryCategoryInput.value = findGalleryCategory(currentValue) ? currentValue : state.activeGalleryCategory;
  }
  renderGalleryDrawerCategoryTabs();
  renderGalleryCategoryManager();
  syncGalleryCategoryManagerVisibility();
}

function renderGalleryDrawerCategoryTabs() {
  if (!els.galleryDrawerCategoryTabs) return;
  const categories = normalizeGalleryCategories(state.galleryCategories);
  els.galleryDrawerCategoryTabs.innerHTML = categories.map((category) => `
    <button
      class="quick-gallery-category${category.id === state.activeGalleryCategory ? " active" : ""}"
      data-gallery-drawer-category="${escapeHtml(category.id)}"
      type="button"
    >
      ${escapeHtml(category.name)}
    </button>
  `).join("");
}

function renderGalleryCategoryManager() {
  if (!els.galleryCategoryList) return;
  const categories = normalizeGalleryCategories(state.galleryCategories);
  els.galleryCategoryList.innerHTML = categories.map((category) => `
    <div
      class="gallery-category-row${category.id === state.activeGalleryCategory ? " is-current" : ""}"
      data-gallery-category-row="${escapeHtml(category.id)}"
      ${category.id === state.activeGalleryCategory ? 'aria-current="true"' : ""}
    >
      <div class="gallery-category-row-toolbar">
        <button
          class="ghost-button gallery-drag-handle gallery-category-drag-handle"
          type="button"
          draggable="true"
          data-gallery-category-id="${escapeHtml(category.id)}"
          data-gallery-category-drag-handle
          aria-label="拖拽排序分类 ${escapeHtml(category.name)}"
          title="拖拽排序"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="5" cy="4" r="1.1" />
            <circle cx="11" cy="4" r="1.1" />
            <circle cx="5" cy="8" r="1.1" />
            <circle cx="11" cy="8" r="1.1" />
            <circle cx="5" cy="12" r="1.1" />
            <circle cx="11" cy="12" r="1.1" />
          </svg>
        </button>
      </div>
      <input class="control" type="text" maxlength="32" value="${escapeHtml(category.name)}" data-gallery-category-name="${escapeHtml(category.id)}" aria-label="分类名称">
      <input class="control" type="text" maxlength="48" value="${escapeHtml(category.prompt_role)}" data-gallery-category-prompt-role="${escapeHtml(category.id)}" aria-label="提示词用途">
      <div class="gallery-category-row-actions">
        <button class="ghost-button text-sm" type="button" data-gallery-category-save="${escapeHtml(category.id)}">保存</button>
        <button class="ghost-button text-sm danger-button" type="button" data-gallery-category-delete="${escapeHtml(category.id)}" ${categories.length <= 1 ? "disabled" : ""}>删除</button>
      </div>
    </div>
  `).join("");
}

function handleGalleryDrawerCategoryTabClick(event: any) {
  const button = event.target.closest?.("[data-gallery-drawer-category]");
  if (!button || !els.galleryDrawerCategoryTabs?.contains(button)) return;
  setGalleryDrawerCategory(button.dataset.galleryDrawerCategory);
}

function handleGalleryCategoryListClick(event: any) {
  const button = event.target.closest?.("[data-gallery-category-save],[data-gallery-category-delete]");
  if (!button || !els.galleryCategoryList?.contains(button) || button.disabled) return;
  if (button.dataset.galleryCategorySave) {
    updateGalleryCategory(button.dataset.galleryCategorySave);
    return;
  }
  if (button.dataset.galleryCategoryDelete) {
    deleteGalleryCategory(button, button.dataset.galleryCategoryDelete);
  }
}

function toggleGalleryCategoryManager() {
  galleryCategoryManagerExpanded = !galleryCategoryManagerExpanded;
  syncGalleryCategoryManagerVisibility();
}

function syncGalleryCategoryManagerVisibility() {
  els.galleryCategoryManagePanel?.classList.toggle("hidden", !galleryCategoryManagerExpanded);
  els.galleryCategoryManageToggle?.setAttribute("aria-expanded", galleryCategoryManagerExpanded ? "true" : "false");
  els.galleryCategoryManageToggle?.classList.toggle("active", galleryCategoryManagerExpanded);
}

async function refreshGalleryCategories() {
  try {
    const response = await fetch("/api/gallery/categories");
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "分类读取失败");
    state.galleryCategories = normalizeGalleryCategories(data.categories);
    ensureActiveGalleryCategory();
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    renderGalleryGrid();
    renderImageStrip();
    updateRequestPreview();
  } catch (error: any) {
    setStatus(error.message || "分类读取失败", "error");
  }
}

async function createGalleryCategory() {
  const name = els.newGalleryCategoryName?.value.trim() || "";
  const promptRole = els.newGalleryCategoryPromptRole?.value.trim() || name;
  if (!name) {
    setStatus("请输入分类名称", "error");
    return;
  }
  try {
    const response = await fetch("/api/gallery/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, prompt_role: promptRole }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "新增分类失败");
    if (els.newGalleryCategoryName) els.newGalleryCategoryName.value = "";
    if (els.newGalleryCategoryPromptRole) els.newGalleryCategoryPromptRole.value = "";
    state.activeGalleryCategory = data.category?.id || state.activeGalleryCategory;
    await refreshGalleryCategories();
    setStatus("分类已新增", "ok");
  } catch (error: any) {
    setStatus(error.message || "新增分类失败", "error");
  }
}

async function updateGalleryCategory(categoryId: any) {
  const row = els.galleryCategoryList?.querySelector(`[data-gallery-category-row="${cssEscape(categoryId)}"]`);
  if (!row) return;
  const name = row.querySelector("[data-gallery-category-name]")?.value.trim();
  const promptRole = row.querySelector("[data-gallery-category-prompt-role]")?.value.trim() || name;
  const category = findGalleryCategory(categoryId);
  if (!name) {
    setStatus("请输入分类名称", "error");
    return;
  }
  try {
    const response = await fetch(`/api/gallery/categories/${encodeURIComponent(categoryId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, prompt_role: promptRole, order: category?.order }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "保存分类失败");
    await refreshGalleryCategories();
    setStatus("分类已保存", "ok");
  } catch (error: any) {
    setStatus(error.message || "保存分类失败", "error");
  }
}

function deleteGalleryCategory(button: any, categoryId: any) {
  const category = findGalleryCategory(categoryId);
  if (!category || state.galleryCategories.length <= 1) return;
  const moveTo = state.galleryCategories.find((candidate: any) => candidate.id !== categoryId)?.id;
  const target = findGalleryCategory(moveTo);
  openConfirmPopover(button, {
    title: "删除图库分类？",
    message: "分类下的图片会移动到其他分类，图库图片不会被删除。",
    detail: target ? `${category.name} -> ${target.name}` : category.name,
    confirmText: "删除分类",
    onConfirm: async () => {
      await performDeleteGalleryCategory(categoryId, moveTo, category.name);
    },
  });
}

async function performDeleteGalleryCategory(categoryId: any, moveTo: any, categoryName: any) {
  try {
    const response = await fetch(`/api/gallery/categories/${encodeURIComponent(categoryId)}?move_to=${encodeURIComponent(moveTo)}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "删除分类失败");
    if (state.activeGalleryCategory === categoryId) state.activeGalleryCategory = moveTo;
    await refreshGallery();
    setStatus(`分类「${categoryName}」已删除，图片已迁移`, "ok");
  } catch (error: any) {
    setStatus(error.message || "删除分类失败", "error");
  }
}

function setQuickGalleryCategory(category: any) {
  if (!findGalleryCategory(category)) return;
  state.activeGalleryCategory = category;
  state.hoveredGalleryItemId = null;
  state.quickGalleryFocusItemId = null;
  renderGalleryCategoryControls();
  renderQuickGalleryDock();
  if (els.galleryDrawer?.classList.contains("open")) renderGalleryGrid({ animateHeight: true });
}

function setGalleryDrawerCategory(category: any) {
  if (!findGalleryCategory(category)) return;
  state.activeGalleryCategory = category;
  state.hoveredGalleryItemId = null;
  state.quickGalleryFocusItemId = null;
  closeGalleryEditPopover();
  closeConfirmPopover();
  renderGalleryCategoryControls();
  renderQuickGalleryDock();
  renderGalleryGrid({ animateHeight: true });
}

function findGalleryCategory(categoryId: any) {
  return state.galleryCategories.find((category: any) => category.id === categoryId);
}

function categoryRow(categoryId: any) {
  return els.galleryCategoryList?.querySelector?.(`[data-gallery-category-row="${cssEscape(categoryId)}"]`) || null;
}

function clearGalleryCategoryDragState() {
  const originalOrder = galleryCategoryOriginalOrder.slice();
  const shouldRestoreOriginalOrder = Boolean(draggedGalleryCategoryId && originalOrder.length);
  if (shouldRestoreOriginalOrder) restoreGalleryCategoryDomOrder(originalOrder);
  draggedGalleryCategoryId = null;
  galleryCategoryDropTargetId = null;
  galleryCategoryDropPlacement = "after";
  galleryCategoryOriginalOrder = [];
  els.galleryCategoryList?.classList.remove("is-drag-sorting");
  els.galleryCategoryList?.querySelectorAll?.(".gallery-category-row").forEach((row: any) => {
    row.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
  });
}

function finishGalleryCategoryDrag() {
  draggedGalleryCategoryId = null;
  galleryCategoryDropTargetId = null;
  galleryCategoryDropPlacement = "after";
  galleryCategoryOriginalOrder = [];
  els.galleryCategoryList?.classList.remove("is-drag-sorting");
  els.galleryCategoryList?.querySelectorAll?.(".gallery-category-row").forEach((row: any) => {
    row.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
  });
}

function applyGalleryCategoryOrder(categoryIds: string[]) {
  const orderMap = new Map(categoryIds.map((categoryId, index) => [categoryId, (index + 1) * 10]));
  state.galleryCategories = normalizeGalleryCategories(
    state.galleryCategories.map((category: any) => (
      orderMap.has(category.id)
        ? { ...category, order: orderMap.get(category.id) }
        : category
    ))
  );
  renderGalleryCategoryControls();
  renderQuickGalleryDock();
  renderGalleryGrid();
}

function categoryDomOrder(): string[] {
  return Array.from(els.galleryCategoryList?.querySelectorAll("[data-gallery-category-row]") || [])
    .map((row: any) => String(row.dataset.galleryCategoryRow || ""))
    .filter(Boolean);
}

function sameGalleryCategoryOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function restoreGalleryCategoryDomOrder(categoryIds: string[]) {
  if (!els.galleryCategoryList) return;
  const rows = new Map(
    Array.from(els.galleryCategoryList.querySelectorAll("[data-gallery-category-row]"))
      .map((row: any) => [String(row.dataset.galleryCategoryRow || ""), row] as [string, HTMLElement])
  );
  categoryIds.forEach((categoryId) => {
    const row = rows.get(categoryId);
    if (row) els.galleryCategoryList?.append(row);
  });
}

function moveGalleryCategoryDragPlaceholder(targetRow: HTMLElement, placement: "before" | "after") {
  if (!draggedGalleryCategoryId || !els.galleryCategoryList) return;
  const draggedRow = categoryRow(draggedGalleryCategoryId) as HTMLElement | null;
  if (!draggedRow || draggedRow === targetRow) return;
  if (placement === "before") {
    els.galleryCategoryList.insertBefore(draggedRow, targetRow);
    return;
  }
  els.galleryCategoryList.insertBefore(draggedRow, targetRow.nextSibling);
}

async function persistGalleryCategoryOrder(categoryIds: string[]) {
  try {
    const response = await fetch("/api/gallery/categories/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_ids: categoryIds }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "更新分类顺序失败");
    state.galleryCategories = normalizeGalleryCategories(data.categories);
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    renderGalleryGrid();
    setStatus("分类顺序已更新", "ok");
  } catch (error: any) {
    await refreshGalleryCategories();
    setStatus(error.message || "更新分类顺序失败", "error");
  }
}

function handleGalleryCategoryDragStart(event: DragEvent) {
  const handle = (event.target as Element | null)?.closest?.("[data-gallery-category-drag-handle]");
  const categoryId = String((handle as HTMLElement | null)?.dataset.galleryCategoryId || "");
  if (!handle || !categoryId || !els.galleryCategoryList?.contains(handle)) return;
  const category = findGalleryCategory(categoryId);
  draggedGalleryCategoryId = categoryId;
  galleryCategoryDropTargetId = null;
  galleryCategoryDropPlacement = "after";
  galleryCategoryOriginalOrder = normalizeGalleryCategories(state.galleryCategories).map((galleryCategory) => galleryCategory.id);
  event.dataTransfer?.setData("text/plain", categoryId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  setGalleryDragPreview(event, {
    type: "category",
    title: category?.name || categoryId,
    subtitle: category?.prompt_role || "图库分类",
    sourceElement: categoryRow(categoryId) as HTMLElement | null,
  });
  window.requestAnimationFrame(() => {
    categoryRow(categoryId)?.classList.add("is-dragging");
    els.galleryCategoryList?.classList.add("is-drag-sorting");
  });
}

function handleGalleryCategoryDragOver(event: DragEvent) {
  if (!draggedGalleryCategoryId || !els.galleryCategoryList) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const targetRow = (event.target as Element | null)?.closest?.("[data-gallery-category-row]") as HTMLElement | null;
  if (!targetRow || !els.galleryCategoryList.contains(targetRow)) return;
  const targetId = String(targetRow.dataset.galleryCategoryRow || "");
  if (!targetId || targetId === draggedGalleryCategoryId) return;
  const rect = targetRow.getBoundingClientRect();
  const placement = (event.clientY - rect.top) < (rect.height / 2) ? "before" : "after";
  if (galleryCategoryDropTargetId === targetId && galleryCategoryDropPlacement === placement) return;
  galleryCategoryDropTargetId = targetId;
  galleryCategoryDropPlacement = placement;
  moveGalleryCategoryDragPlaceholder(targetRow, placement);
  els.galleryCategoryList.querySelectorAll(".gallery-category-row").forEach((row: any) => {
    row.classList.toggle("drop-target", row === targetRow);
    row.classList.toggle("drop-before", row === targetRow && placement === "before");
    row.classList.toggle("drop-after", row === targetRow && placement === "after");
  });
}

function handleGalleryCategoryDrop(event: DragEvent) {
  if (!draggedGalleryCategoryId) {
    finishGalleryCategoryDrag();
    return;
  }
  const draggedId = draggedGalleryCategoryId;
  event.preventDefault();
  const originalOrder = galleryCategoryOriginalOrder.length
    ? galleryCategoryOriginalOrder.slice()
    : normalizeGalleryCategories(state.galleryCategories).map((category) => category.id);
  const reorderedIds = categoryDomOrder();
  finishGalleryCategoryDrag();
  if (!reorderedIds.includes(draggedId) || sameGalleryCategoryOrder(originalOrder, reorderedIds)) return;
  applyGalleryCategoryOrder(reorderedIds);
  void persistGalleryCategoryOrder(reorderedIds);
}

function handleGalleryCategoryDragEnd() {
  clearGalleryCategoryDragState();
}

function categoryLabel(category: any) {
  return findGalleryCategory(category)?.name || DEFAULT_GALLERY_CATEGORY_LABELS[category] || category || "未分类";
}

function categoryPromptRole(category: any) {
  const galleryCategory = findGalleryCategory(category);
  return galleryCategory?.prompt_role || galleryCategory?.name || DEFAULT_GALLERY_CATEGORY_LABELS[category] || "参考图";
}

function bindGalleryCategoryEvents() {
  if (galleryCategoriesEventsBound) return;
  galleryCategoriesEventsBound = true;
  els.galleryDrawerCategoryTabs?.addEventListener("click", handleGalleryDrawerCategoryTabClick);
  els.galleryCategoryManageToggle?.addEventListener("click", toggleGalleryCategoryManager);
  els.galleryCategoryList?.addEventListener("click", handleGalleryCategoryListClick);
  els.galleryCategoryList?.addEventListener("dragstart", handleGalleryCategoryDragStart);
  els.galleryCategoryList?.addEventListener("dragover", handleGalleryCategoryDragOver);
  els.galleryCategoryList?.addEventListener("drop", handleGalleryCategoryDrop);
  els.galleryCategoryList?.addEventListener("dragend", handleGalleryCategoryDragEnd);
  els.galleryCategoryList?.addEventListener("dragleave", (event: DragEvent) => {
    if (!draggedGalleryCategoryId) return;
    const related = event.relatedTarget as Node | null;
    if (related && els.galleryCategoryList?.contains(related)) return;
    els.galleryCategoryList?.querySelectorAll(".gallery-category-row").forEach((row: any) => {
      row.classList.remove("drop-target", "drop-before", "drop-after");
    });
    galleryCategoryDropTargetId = null;
  });
}

export function initGalleryCategoriesFeature() {
  if (galleryCategoriesFeatureInitialized) return;
  galleryCategoriesFeatureInitialized = true;
  bindGalleryCategoryEvents();
  Object.assign(getLegacyBridge().methods, {
    defaultGalleryCategories,
    normalizeGalleryCategory,
    normalizeGalleryCategories,
    handleQuickGalleryCategoryEvent,
    ensureActiveGalleryCategory,
    renderGalleryCategoryControls,
    renderGalleryDrawerCategoryTabs,
    renderGalleryCategoryManager,
    handleGalleryDrawerCategoryTabClick,
    handleGalleryCategoryListClick,
    toggleGalleryCategoryManager,
    refreshGalleryCategories,
    createGalleryCategory,
    updateGalleryCategory,
    deleteGalleryCategory,
    performDeleteGalleryCategory,
    setQuickGalleryCategory,
    setGalleryDrawerCategory,
    findGalleryCategory,
    categoryLabel,
    categoryPromptRole,
    applyGalleryCategoryOrder,
    persistGalleryCategoryOrder,
    handleGalleryCategoryDragStart,
    handleGalleryCategoryDragOver,
    handleGalleryCategoryDrop,
    handleGalleryCategoryDragEnd,
  });
}

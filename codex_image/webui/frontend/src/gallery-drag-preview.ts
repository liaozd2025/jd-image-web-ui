interface GalleryDragPreviewOptions {
  type: "category" | "item";
  title: string;
  subtitle?: string;
  imageUrl?: string;
  sourceElement?: HTMLElement | null;
}

export function createGalleryDragPreview(options: GalleryDragPreviewOptions): HTMLElement {
  const preview = document.createElement("div");
  preview.className = `gallery-drag-preview gallery-drag-preview-${options.type}`;
  preview.setAttribute("aria-hidden", "true");

  const visual = document.createElement("span");
  visual.className = "gallery-drag-preview-visual";
  if (options.imageUrl) {
    const image = document.createElement("img");
    image.src = options.imageUrl;
    image.alt = "";
    image.draggable = false;
    visual.append(image);
  } else {
    visual.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="5" cy="4" r="1.1" />
        <circle cx="11" cy="4" r="1.1" />
        <circle cx="5" cy="8" r="1.1" />
        <circle cx="11" cy="8" r="1.1" />
        <circle cx="5" cy="12" r="1.1" />
        <circle cx="11" cy="12" r="1.1" />
      </svg>
    `;
  }

  const copy = document.createElement("span");
  copy.className = "gallery-drag-preview-copy";

  const title = document.createElement("strong");
  title.textContent = options.title;
  copy.append(title);

  if (options.subtitle) {
    const subtitle = document.createElement("span");
    subtitle.textContent = options.subtitle;
    copy.append(subtitle);
  }

  preview.append(visual, copy);
  document.body.append(preview);
  return preview;
}

export function createGalleryElementDragPreview(sourceElement: HTMLElement): HTMLElement {
  const preview = sourceElement.cloneNode(true) as HTMLElement;
  const rect = sourceElement.getBoundingClientRect();
  preview.classList.add("gallery-drag-preview-clone");
  preview.setAttribute("aria-hidden", "true");
  preview.removeAttribute("id");
  preview.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  preview.querySelectorAll("[draggable]").forEach((node) => node.setAttribute("draggable", "false"));
  preview.querySelectorAll("button, input, select, textarea").forEach((node) => {
    (node as HTMLElement).setAttribute("tabindex", "-1");
  });
  preview.style.width = `${Math.ceil(rect.width)}px`;
  preview.style.height = `${Math.ceil(rect.height)}px`;
  document.body.append(preview);
  return preview;
}

function clampDragImageOffset(value: number, size: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  return Math.max(0, Math.min(Math.round(value), Math.round(size)));
}

export function setGalleryDragPreview(event: DragEvent, options: GalleryDragPreviewOptions): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer || typeof dataTransfer.setDragImage !== "function") return;

  const sourceElement = options.sourceElement || null;
  const preview = sourceElement ? createGalleryElementDragPreview(sourceElement) : createGalleryDragPreview(options);
  const rect = preview.getBoundingClientRect();
  const sourceRect = sourceElement?.getBoundingClientRect();
  const offsetX = sourceRect
    ? clampDragImageOffset(event.clientX - sourceRect.left, sourceRect.width)
    : 22;
  const offsetY = sourceRect
    ? clampDragImageOffset(event.clientY - sourceRect.top, sourceRect.height)
    : Math.max(18, Math.round(rect.height / 2));
  dataTransfer.setDragImage(preview, offsetX, offsetY);
  window.setTimeout(() => preview.remove(), 0);
}

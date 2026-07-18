const PROMPT_POPOVER_MARGIN = 8;
const PROMPT_POPOVER_GAP = 8;
const PROMPT_POPOVER_MIN_HEIGHT = 88;

type PromptPopoverVars = {
  left: string;
  top: string;
  width: string;
  maxHeight: string;
};

type PromptPopoverOptions = {
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  minVisibleHeight?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function viewportSize() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  };
}

function boundedPromptPopoverWidth(hostRect: DOMRect, options: PromptPopoverOptions, viewportWidth: number): number {
  const availableWidth = Math.max(
    0,
    Math.min(hostRect.width - PROMPT_POPOVER_MARGIN * 2, viewportWidth - PROMPT_POPOVER_MARGIN * 2),
  );
  const preferredWidth = Math.min(options.maxWidth, availableWidth);
  return Math.max(Math.min(options.minWidth, availableWidth), preferredWidth);
}

export function positionPromptPopoverAtAnchor(
  popover: HTMLElement | null,
  host: Element | null,
  anchorRect: DOMRect | null,
  vars: PromptPopoverVars,
  options: PromptPopoverOptions,
): void {
  if (!popover || !host || !anchorRect) return;
  const hostRect = host.getBoundingClientRect();
  const viewport = viewportSize();
  const popupWidth = boundedPromptPopoverWidth(hostRect, options, viewport.width);
  const minLeft = Math.max(PROMPT_POPOVER_MARGIN, hostRect.left + PROMPT_POPOVER_MARGIN);
  const maxLeft = Math.max(
    minLeft,
    Math.min(
      viewport.width - popupWidth - PROMPT_POPOVER_MARGIN,
      hostRect.right - popupWidth - PROMPT_POPOVER_MARGIN,
    ),
  );
  const left = clamp(anchorRect.left, minLeft, maxLeft);
  const belowTop = anchorRect.bottom + PROMPT_POPOVER_GAP;
  const belowRoom = viewport.height - belowTop - PROMPT_POPOVER_MARGIN;
  const aboveRoom = anchorRect.top - PROMPT_POPOVER_GAP - PROMPT_POPOVER_MARGIN;
  const minVisibleHeight = Math.min(options.minVisibleHeight || 120, options.maxHeight);
  const placeAbove = belowRoom < minVisibleHeight && aboveRoom > belowRoom;
  const availableHeight = placeAbove ? aboveRoom : belowRoom;
  const maxHeight = Math.max(
    PROMPT_POPOVER_MIN_HEIGHT,
    Math.min(options.maxHeight, Math.max(0, availableHeight)),
  );
  const top = placeAbove
    ? Math.max(PROMPT_POPOVER_MARGIN, anchorRect.top - PROMPT_POPOVER_GAP - maxHeight)
    : Math.max(PROMPT_POPOVER_MARGIN, belowTop);
  popover.style.setProperty(vars.left, `${left}px`);
  popover.style.setProperty(vars.top, `${top}px`);
  popover.style.setProperty(vars.width, `${popupWidth}px`);
  popover.style.setProperty(vars.maxHeight, `${maxHeight}px`);
}

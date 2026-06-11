export type HistoryWindowDirection = "next" | "previous";
export type HistoryWindowEdge = "top" | "bottom";

export type HistoryScrollAnchor = {
  taskId: string;
  offset: number;
} | null;

export function historyTaskCards(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".history-task-card[data-history-task-card-id]")];
}

export function encodeHistoryCursor(createdAt: string, taskId: string): string {
  const raw = JSON.stringify({ created_at: createdAt, task_id: taskId });
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function historyWindowEdgeCursor(root: HTMLElement, edge: HistoryWindowEdge): string {
  const cards = historyTaskCards(root);
  const card = edge === "top" ? cards[0] : cards[cards.length - 1];
  if (!card) return "";
  const taskId = String(card.dataset.historyTaskCardId || "");
  const createdAt = String(card.dataset.historyCreatedAt || "");
  return taskId && createdAt ? encodeHistoryCursor(createdAt, taskId) : "";
}

export function captureHistoryScrollAnchor(root: HTMLElement): HistoryScrollAnchor {
  const rootTop = root.getBoundingClientRect().top;
  for (const card of historyTaskCards(root)) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom < rootTop) continue;
    const taskId = String(card.dataset.historyTaskCardId || "");
    if (!taskId) continue;
    return { taskId, offset: rect.top - rootTop };
  }
  return null;
}

export function restoreHistoryScrollAnchor(root: HTMLElement, anchor: HistoryScrollAnchor): void {
  if (!anchor) return;
  const card = historyTaskCards(root).find((item) => String(item.dataset.historyTaskCardId || "") === anchor.taskId);
  if (!card) return;
  const rootTop = root.getBoundingClientRect().top;
  const nextOffset = card.getBoundingClientRect().top - rootTop;
  root.scrollTop += nextOffset - anchor.offset;
}

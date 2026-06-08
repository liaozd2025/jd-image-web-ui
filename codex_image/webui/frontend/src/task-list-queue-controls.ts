import {
  cancelRunningTask,
  deleteQueuedTask,
  handleQueueDragEnd,
  handleQueueDragOver,
  handleQueueDragStart,
  handleQueueDrop,
  moveQueueTask,
  promoteQueueTask,
} from "./queue";
import { getLegacyBridge } from "./state";

const bridge = getLegacyBridge();
const state = bridge.state;
const els = bridge.els;

let taskListQueueControlsInitialized = false;
let taskListQueueControlsBound = false;

function eventTargetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function stopQueueControlEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function stopQueueDragEvent(event: Event): void {
  event.stopPropagation();
}

function taskListQueueControlRoots(): HTMLElement[] {
  return [els.taskActiveList, els.taskList].filter((root): root is HTMLElement => root instanceof HTMLElement);
}

function bindTaskListQueueControls(): void {
  if (taskListQueueControlsBound) return;
  taskListQueueControlsBound = true;
  taskListQueueControlRoots().forEach((root) => {
    root.addEventListener("click", handleTaskListQueueClick);
    root.addEventListener("dragstart", handleTaskListQueueDragStart);
    root.addEventListener("dragover", handleTaskListQueueDragOver);
    root.addEventListener("drop", handleTaskListQueueDrop);
    root.addEventListener("dragend", handleTaskListQueueDragEnd);
  });
}

function handleTaskListQueueClick(event: MouseEvent): void {
  const target = eventTargetElement(event);
  const dragHandle = target?.closest("[data-task-queue-drag-handle-id]");
  if (dragHandle instanceof HTMLElement) {
    stopQueueControlEvent(event);
    return;
  }

  const cancelButton = target?.closest("[data-task-queue-cancel-id]");
  if (cancelButton instanceof HTMLElement) {
    stopQueueControlEvent(event);
    cancelRunningTask(cancelButton, cancelButton.dataset.taskQueueCancelId);
    return;
  }

  const moveButton = target?.closest("[data-task-queue-move-id]");
  if (moveButton instanceof HTMLElement) {
    stopQueueControlEvent(event);
    moveQueueTask(moveButton.dataset.taskQueueMoveId, moveButton.dataset.taskQueueDirection);
    return;
  }

  const promoteButton = target?.closest("[data-task-queue-promote-id]");
  if (promoteButton instanceof HTMLElement) {
    stopQueueControlEvent(event);
    void promoteQueueTask(promoteButton.dataset.taskQueuePromoteId);
    return;
  }

  const deleteButton = target?.closest("[data-task-queue-delete-id]");
  if (deleteButton instanceof HTMLElement) {
    stopQueueControlEvent(event);
    deleteQueuedTask(deleteButton, deleteButton.dataset.taskQueueDeleteId);
  }
}

function waitingDropTarget(event: DragEvent): Element | null {
  return eventTargetElement(event)?.closest("[data-active-task-section=\"waiting\"]") || null;
}

function handleTaskListQueueDragStart(event: DragEvent): void {
  const handle = eventTargetElement(event)?.closest("[data-task-queue-drag-handle-id]");
  if (!(handle instanceof HTMLElement)) return;
  const card = handle.closest("[data-queue-task-id]");
  if (!(card instanceof HTMLElement)) return;
  stopQueueDragEvent(event);
  card.classList.add("queue-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.setDragImage(card, Math.min(28, card.clientWidth / 2), Math.min(28, card.clientHeight / 2));
  }
  handleQueueDragStart(event);
}

function handleTaskListQueueDragOver(event: DragEvent): void {
  if (!state.queueDragTaskId || !waitingDropTarget(event)) return;
  handleQueueDragOver(event);
}

function handleTaskListQueueDrop(event: DragEvent): void {
  if (!state.queueDragTaskId || !waitingDropTarget(event)) return;
  handleQueueDrop(event);
}

function handleTaskListQueueDragEnd(event: DragEvent): void {
  if (!state.queueDragTaskId) return;
  handleQueueDragEnd(event);
  taskListQueueControlRoots().forEach((root) => {
    root.querySelectorAll(".queue-dragging").forEach((element: Element) => {
      element.classList.remove("queue-dragging");
    });
  });
}

export function initTaskListQueueControlsFeature(): void {
  if (taskListQueueControlsInitialized) return;
  taskListQueueControlsInitialized = true;
  Object.assign(getLegacyBridge().methods, {
    bindTaskListQueueControls,
    handleTaskListQueueClick,
    handleTaskListQueueDragStart,
    handleTaskListQueueDragOver,
    handleTaskListQueueDrop,
    handleTaskListQueueDragEnd,
  });
  bindTaskListQueueControls();
}

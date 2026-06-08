import type { WebUIState } from "./state";

export const DEFAULT_GALLERY_CATEGORY_LABELS = {
  portrait: "人像",
  character: "角色",
  product: "产品",
};

export const DEFAULT_GALLERY_CATEGORIES = [
  { id: "portrait", name: "人像", prompt_role: "人像参考", order: 10 },
  { id: "character", name: "角色", prompt_role: "角色参考", order: 20 },
  { id: "product", name: "产品", prompt_role: "产品参考", order: 30 },
];

export const PROMPT_SNIPPETS_ENDPOINT = "/api/prompt-snippets";
export const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_API_IMAGE_MODEL = "gpt-image-2";
export const DEFAULT_API_MODE = "images";
export const DEFAULT_API_IMAGES_CONCURRENCY = 4;
export const API_SETTINGS_STORAGE_KEY = "codex-image-api-settings";
export const DEFAULT_DOCUMENT_TITLE = document.title || "iLab GPT CONJURE";
export const SUBMIT_TASK_TIMEOUT_MS = 45000;
export const TASK_CARD_SELECTOR = ".task-card[data-task-id]";
export const TASK_HISTORY_EXPANDED_GROUP_STORAGE_KEY = "codex-image-task-history-expanded-group";
export const PROMPT_TOKEN_PATTERN = /@([^\s@，。,.#~～〜∼˜]+)|#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])|(?:^|[\s\n，。,.；;：:！？!?、（）()\[\]【】"'“”‘’])([~～〜∼˜]+)([^\s~～〜∼˜@#，。,.；;：:！？!?、（）()\[\]【】"'“”‘’]+)/g;
export const PROMPT_SNIPPET_TRIGGER_PATTERN = /(^|[\s\n，。,.；;：:！？!?、（）()\[\]【】"'“”‘’])([~～〜∼˜]+)([^\s~～〜∼˜@#，。,.；;：:！？!?、（）()\[\]【】"'“”‘’]*)$/;
export const QUICK_GALLERY_WHEEL_COOLDOWN_MS = 220;

export function defaultGalleryCategories() {
  return DEFAULT_GALLERY_CATEGORIES.map((category) => ({ ...category }));
}

export function createDefaultState(): WebUIState {
  return {
  mode: "generate",
  images: [],
  tasks: [],
  selectedTaskId: null,
  taskInputRestoreSeq: 0,
  authAvailable: false,
  runTimerId: null,
  runStartedAt: null,
  runFeedbackAction: null,
  uiClockTimerId: null,
  previewRenderKey: null,
  tasksRenderKey: null,
  pendingTaskId: null,
  galleryItems: [],
  promptSnippets: [],
  promptTemplates: [],
  promptTemplateCategories: [],
  promptTemplateFilter: "all",
  promptTemplateCategory: "",
  promptTemplateQuery: "",
  selectedPromptTemplateId: null,
  recentAssets: [],
  collectedReferences: [],
  galleryCategories: defaultGalleryCategories(),
  activeGalleryCategory: "portrait",
  hoveredGalleryItemId: null,
  quickGalleryFocusItemId: null,
  colorPalette: {
    version: 1,
    favorites: [
      { name: "白色", hex: "#FFFFFF", order: 10 },
      { name: "黑色", hex: "#111111", order: 20 },
      { name: "暖米色", hex: "#F6E8D8", order: 30 },
      { name: "浅绿", hex: "#E6F0EC", order: 40 },
      { name: "品牌绿", hex: "#457B66", order: 50 },
      { name: "桃橙", hex: "#F4B183", order: 60 },
      { name: "浅蓝", hex: "#B7D7F0", order: 70 },
      { name: "浅粉", hex: "#F8D7DA", order: 80 },
    ],
    recent_colors: [],
    recent_limit: 6,
  },
  colorPaletteManageMode: false,
  selectedColorCode: "#FFFFFF",
  activeColorRange: null,
  activeColorChip: null,
  activePromptSnippetRange: null,
  activePromptSnippetChip: null,
  promptSnippetSelectionRange: null,
  promptSnippetSelectionText: "",
  addToGalleryIndex: null,
  authStatus: null,
  pendingAuthSource: null,
  customSizeMode: null,
  customSizeTransitionSeq: 0,
  customAspectRatioLocked: false,
  customAspectRatioValue: null,
  customAspectRatioSource: "manual",
  galleryGridTransitionSeq: 0,
  galleryGridTransitionTimerId: null,
  queue: { waiting: [], running: [], summary: { waiting_count: 0, running_count: 0, channel_count: 0 } },
  accountQuota: { items: [], summary: {} },
  queueRenderKey: null,
  queueRequestSeq: 0,
  queueDispatchSyncTimerId: null,
  taskViewedRequestIds: new Set(),
  tasksRequestSeq: 0,
  realtimeSource: null,
  realtimeSnapshotNeedsArchiveMigration: false,
  queueDragTaskId: null,
  expandedTaskGroupKey: null,
  taskNotifications: [],
  taskNotificationUnreadCount: 0,
  taskNotificationCenterOpen: false,
  taskNotificationToastTimerIds: [],
  taskNotificationSettings: { inApp: true, system: false },
  taskNotificationSeenKeys: new Set(),
  draggedPromptChip: null,
  legacyArchivedTaskIds: [],
  batchMode: false,
  batchSelectedTaskIds: [],
  batchSelectionDrag: null,
  suppressTaskClickAfterDrag: false,
  sidebarResize: null,
  themePreference: "system",
  themeSystemQuery: null,
  apiSettings: {
    active_provider_id: "default",
    providers: [{
      id: "default",
      name: "Default",
      base_url: DEFAULT_API_BASE_URL,
      api_key: "",
      image_model: DEFAULT_API_IMAGE_MODEL,
      api_mode: DEFAULT_API_MODE,
      images_concurrency: DEFAULT_API_IMAGES_CONCURRENCY,
    }],
  },
  apiSettingsSaveTimerId: null,
  mainModelComboboxOpen: false,
  mainModelOptionIndex: 0,
  mainModelShowAllOptions: false,
  } as WebUIState;
}

export const ARCHIVED_TASKS_STORAGE_KEY = "codex-image-archived-task-ids";

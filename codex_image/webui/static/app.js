(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // codex_image/webui/frontend/src/event-bindings.ts
  function call(methods, name, ...args) {
    return methods[name]?.(...args);
  }
  async function handleRefreshButtonClick(methods) {
    call(methods, "closePromptPopover");
    await call(methods, "refreshTasks");
  }
  function isRunTaskShortcut(event) {
    return event.key === "Enter" && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing;
  }
  function hasOpenShortcutBlockingLayer() {
    return Boolean(document.querySelector(
      "#promptTemplateDrawer.open, #galleryDrawer.open, #accountQuotaDrawer.open, .modal-overlay:not(.hidden), .prompt-popover:not(.hidden), .confirm-popover:not(.hidden), .compression-popover:not(.hidden), .task-notification-center:not(.hidden)"
    ));
  }
  function handleRunTaskShortcut(event, els43, methods) {
    if (!isRunTaskShortcut(event)) return;
    if (hasOpenShortcutBlockingLayer() || els43.runButton.disabled) return;
    event.preventDefault();
    void call(methods, "runTask");
  }
  function bindWebUIEvents(state33, els43, methods) {
    call(methods, "bindShellUiEvents");
    call(methods, "bindFormControlEvents");
    els43.clearPromptButton.addEventListener("click", () => {
      call(methods, "setPromptText", "");
      call(methods, "syncGalleryInputsFromPrompt");
      call(methods, "updatePromptCount");
      call(methods, "updateRequestPreview");
    });
    els43.quickGalleryRail?.addEventListener("mouseover", (event) => call(methods, "handleQuickGalleryCategoryEvent", event));
    els43.quickGalleryRail?.addEventListener("focusin", (event) => call(methods, "handleQuickGalleryCategoryEvent", event));
    els43.quickGalleryRail?.addEventListener("click", (event) => call(methods, "handleQuickGalleryCategoryEvent", event));
    els43.quickGalleryList?.addEventListener("scroll", () => call(methods, "scheduleQuickGalleryFocusUpdate"));
    els43.quickGalleryList?.addEventListener("wheel", (event) => call(methods, "handleQuickGalleryBoundaryWheel", event), { passive: false });
    els43.addGalleryCategoryButton?.addEventListener("click", () => call(methods, "createGalleryCategory"));
    els43.addToGalleryClose?.addEventListener("click", () => call(methods, "closeAddToGallery"));
    els43.addToGalleryModal?.addEventListener("click", (event) => {
      if (event.target === els43.addToGalleryModal) call(methods, "closeAddToGallery");
    });
    els43.saveToGalleryButton?.addEventListener("click", () => call(methods, "saveUploadToGallery"));
    els43.accountQuotaButton?.addEventListener("click", () => call(methods, "openAccountQuotaDrawer"));
    els43.accountQuotaDrawerClose?.addEventListener("click", () => call(methods, "closeAccountQuotaDrawer"));
    els43.accountQuotaDrawerBackdrop?.addEventListener("click", () => call(methods, "closeAccountQuotaDrawer"));
    els43.accountQuotaRefresh?.addEventListener("click", () => call(methods, "refreshAccountQuota", true));
    els43.accountQuotaList?.addEventListener("click", (event) => {
      const button = event.target?.closest("[data-account-manual-disabled-key]");
      if (!button) return;
      const accountKey = button.dataset.accountManualDisabledKey || "";
      const nextDisabled = button.dataset.accountManualDisabledValue !== "true";
      call(methods, "toggleAccountQueueEnabled", accountKey, nextDisabled, button);
    });
    els43.settingsButton?.addEventListener("click", () => call(methods, "openSettingsModal"));
    els43.settingsModalClose?.addEventListener("click", () => call(methods, "closeSettingsModal"));
    els43.settingsModal?.addEventListener("click", (event) => {
      if (event.target === els43.settingsModal) call(methods, "closeSettingsModal");
    });
    els43.saveSettingsButton?.addEventListener("click", () => call(methods, "saveSettings"));
    els43.authSourceGroup?.addEventListener("click", (event) => call(methods, "handleAuthSourceClick", event));
    els43.authSourceGroup?.addEventListener("dblclick", (event) => call(methods, "handleAuthSourceDoubleClick", event));
    els43.apiDirectSettingsButton?.addEventListener("click", () => call(methods, "openApiSettingsModal"));
    els43.apiSettingsModalClose?.addEventListener("click", () => call(methods, "closeApiSettingsModal"));
    els43.apiSettingsModal?.addEventListener("click", (event) => {
      if (event.target === els43.apiSettingsModal) call(methods, "closeApiSettingsModal");
    });
    els43.saveApiSettingsButton?.addEventListener("click", () => call(methods, "saveApiSettings"));
    els43.apiProviderQuick?.addEventListener("change", () => {
      call(methods, "readApiSettingsForm");
      state33.apiSettings.active_provider_id = els43.apiProviderQuick?.value || call(methods, "currentApiProviderId");
      call(methods, "populateApiSettingsForm");
      call(methods, "persistApiSettings");
      call(methods, "renderAuthSource", state33.authStatus);
      call(methods, "updateRequestPreview");
    });
    els43.apiProvider?.addEventListener("change", () => {
      call(methods, "readApiSettingsForm");
      state33.apiSettings.active_provider_id = els43.apiProvider?.value || call(methods, "currentApiProviderId");
      call(methods, "populateApiSettingsForm");
      call(methods, "persistApiSettings");
      call(methods, "renderAuthSource", state33.authStatus);
      call(methods, "updateRequestPreview");
    });
    els43.addApiProviderButton?.addEventListener("click", () => call(methods, "addApiProvider"));
    els43.deleteApiProviderButton?.addEventListener("click", () => call(methods, "deleteApiProvider"));
    [els43.apiProviderName, els43.apiBaseUrl, els43.apiKey, els43.apiMode, els43.apiImageModel, els43.apiImagesConcurrency].filter(Boolean).forEach((element2) => {
      element2?.addEventListener("input", () => {
        call(methods, "readApiSettingsForm");
        call(methods, "persistApiSettings");
        call(methods, "renderAuthSource", state33.authStatus);
        call(methods, "updateRequestPreview");
      });
    });
    call(methods, "bindOverlayPopoverEvents");
    els43.runButton.addEventListener("click", () => call(methods, "runTask"));
    document.addEventListener("keydown", (event) => handleRunTaskShortcut(event, els43, methods));
    els43.refreshButton.addEventListener("click", () => {
      void handleRefreshButtonClick(methods);
    });
    call(methods, "bindTaskListControlEvents");
  }

  // codex_image/webui/frontend/src/boot.ts
  function call2(methods, name, ...args) {
    return methods[name]?.(...args);
  }
  function bootWebUI(state33, els43, methods) {
    bindWebUIEvents(state33, els43, methods);
    call2(methods, "restoreThemePreference");
    call2(methods, "restoreSidebarWidth");
    call2(methods, "restoreMainModel");
    call2(methods, "restoreApiSettings");
    call2(methods, "refreshColorPalette");
    call2(methods, "refreshPromptSnippets");
    call2(methods, "refreshPromptTemplates");
    call2(methods, "renderGalleryCategoryControls");
    call2(methods, "restoreLegacyArchivedTasks");
    call2(methods, "restoreExpandedTaskGroupKey");
    call2(methods, "setMode", "generate");
    call2(methods, "updatePromptCount");
    call2(methods, "updateQuantity");
    call2(methods, "updateCompression");
    call2(methods, "updateSizeFromPreset");
    call2(methods, "updateCustomSize");
    call2(methods, "renderImageStrip");
    call2(methods, "refreshSettings");
    call2(methods, "refreshApiSettings");
    call2(methods, "refreshHealth");
    call2(methods, "refreshGallery");
    call2(methods, "refreshRecentAssets");
    call2(methods, "refreshAccountQuota", false);
    const realtimeStarted = window.startRealtimeUpdates?.({ migrateLegacyArchives: true });
    if (realtimeStarted) {
      void window.refreshQueue?.();
      Promise.resolve(call2(methods, "refreshTasks", { migrateLegacyArchives: true })).finally(() => {
        state33.realtimeSnapshotNeedsArchiveMigration = false;
      });
    } else {
      void window.refreshQueue?.();
      void call2(methods, "refreshTasks", { migrateLegacyArchives: true });
    }
    call2(methods, "startUiClock");
    call2(methods, "updateRequestPreview");
    call2(methods, "setupPreviewPanelHeightSync");
  }

  // codex_image/webui/frontend/src/elements.ts
  function createWebUIElements() {
    return {
      themeSwitcher: document.querySelector("#themeSwitcher"),
      sidebar: document.querySelector("#sidebar"),
      sidebarResizeHandle: document.querySelector("#sidebarResizeHandle"),
      authSourceGroup: document.querySelector("#authSourceGroup"),
      authSourceDetail: document.querySelector("#authSourceDetail"),
      apiStatus: document.querySelector("#apiStatus"),
      apiDirectSettingsButton: document.querySelector("#apiDirectSettingsButton"),
      queueButton: document.querySelector("#queueButton"),
      queueStatusText: document.querySelector("#queueStatusText"),
      taskNotificationButton: document.querySelector("#taskNotificationButton"),
      taskNotificationBadge: document.querySelector("#taskNotificationBadge"),
      taskNotificationCenter: document.querySelector("#taskNotificationCenter"),
      taskNotificationUnreadSummary: document.querySelector("#taskNotificationUnreadSummary"),
      taskNotificationClearButton: document.querySelector("#taskNotificationClearButton"),
      taskNotificationList: document.querySelector("#taskNotificationList"),
      taskNotificationToastRegion: document.querySelector("#taskNotificationToastRegion"),
      taskNotificationInApp: document.querySelector("#taskNotificationInApp"),
      taskNotificationSystem: document.querySelector("#taskNotificationSystem"),
      taskHistoryShell: document.querySelector(".task-history-shell"),
      sidebarContent: document.querySelector(".sidebar-content"),
      taskActiveList: document.querySelector("#taskActiveList"),
      accountQuotaButton: document.querySelector("#accountQuotaButton"),
      accountQuotaBadge: document.querySelector("#accountQuotaBadge"),
      accountQuotaDrawer: document.querySelector("#accountQuotaDrawer"),
      accountQuotaDrawerClose: document.querySelector("#accountQuotaDrawerClose"),
      accountQuotaDrawerBackdrop: document.querySelector("#accountQuotaDrawerBackdrop"),
      accountQuotaRefresh: document.querySelector("#accountQuotaRefresh"),
      accountQuotaSummary: document.querySelector("#accountQuotaSummary"),
      accountQuotaList: document.querySelector("#accountQuotaList"),
      taskList: document.querySelector("#taskList"),
      taskSearch: document.querySelector("#taskSearch"),
      taskRatioFilter: document.querySelector("#taskRatioFilter"),
      taskOrientationFilter: document.querySelector("#taskOrientationFilter"),
      taskPromptFidelityFilter: document.querySelector("#taskPromptFidelityFilter"),
      taskResolutionFilter: document.querySelector("#taskResolutionFilter"),
      taskHistoryTopAnchors: document.querySelector("#taskHistoryTopAnchors"),
      taskHistoryBottomAnchors: document.querySelector("#taskHistoryBottomAnchors"),
      archiveButton: document.querySelector("#archiveButton"),
      batchManageButton: document.querySelector("#batchManageButton"),
      settingsButton: document.querySelector("#settingsButton"),
      batchToolbar: document.querySelector("#batchToolbar"),
      batchSelectedCount: document.querySelector("#batchSelectedCount"),
      batchArchiveButton: document.querySelector("#batchArchiveButton"),
      batchDeleteButton: document.querySelector("#batchDeleteButton"),
      batchCancelButton: document.querySelector("#batchCancelButton"),
      archiveModal: document.querySelector("#archiveModal"),
      archiveModalClose: document.querySelector("#archiveModalClose"),
      archiveList: document.querySelector("#archiveList"),
      archiveCount: document.querySelector("#archiveCount"),
      settingsModal: document.querySelector("#settingsModal"),
      settingsModalClose: document.querySelector("#settingsModalClose"),
      settingsStatus: document.querySelector("#settingsStatus"),
      settingsInputRoot: document.querySelector("#settingsInputRoot"),
      settingsOutputRoot: document.querySelector("#settingsOutputRoot"),
      settingsGalleryRoot: document.querySelector("#settingsGalleryRoot"),
      settingsSourceDataRoot: document.querySelector("#settingsSourceDataRoot"),
      saveSettingsButton: document.querySelector("#saveSettingsButton"),
      apiSettingsModal: document.querySelector("#apiSettingsModal"),
      apiSettingsModalClose: document.querySelector("#apiSettingsModalClose"),
      apiSettingsStatus: document.querySelector("#apiSettingsStatus"),
      apiProviderQuick: document.querySelector("#apiProviderQuick"),
      apiProvider: document.querySelector("#apiProvider"),
      apiProviderName: document.querySelector("#apiProviderName"),
      addApiProviderButton: document.querySelector("#addApiProviderButton"),
      deleteApiProviderButton: document.querySelector("#deleteApiProviderButton"),
      apiBaseUrl: document.querySelector("#apiBaseUrl"),
      apiKey: document.querySelector("#apiKey"),
      apiMode: document.querySelector("#apiMode"),
      apiImageModel: document.querySelector("#apiImageModel"),
      apiImagesConcurrency: document.querySelector("#apiImagesConcurrency"),
      saveApiSettingsButton: document.querySelector("#saveApiSettingsButton"),
      newTaskButton: document.querySelector("#newTaskButton"),
      imageInput: document.querySelector("#imageInput"),
      imageEditorModal: document.querySelector("#imageEditorModal"),
      imageEditorClose: document.querySelector("#imageEditorClose"),
      imageEditorSubtitle: document.querySelector("#imageEditorSubtitle"),
      imageEditorCanvas: document.querySelector("#imageEditorCanvas"),
      imageEditorCanvasWrap: document.querySelector("#imageEditorCanvasWrap"),
      imageEditorCropBox: document.querySelector("#imageEditorCropBox"),
      imageEditorToolBrush: document.querySelector("#imageEditorToolBrush"),
      imageEditorToolArrow: document.querySelector("#imageEditorToolArrow"),
      imageEditorToolCrop: document.querySelector("#imageEditorToolCrop"),
      imageEditorToolFill: document.querySelector("#imageEditorToolFill"),
      imageEditorColor: document.querySelector("#imageEditorColor"),
      imageEditorStroke: document.querySelector("#imageEditorStroke"),
      imageEditorStrokeValue: document.querySelector("#imageEditorStrokeValue"),
      imageEditorUndo: document.querySelector("#imageEditorUndo"),
      imageEditorRedo: document.querySelector("#imageEditorRedo"),
      imageEditorReset: document.querySelector("#imageEditorReset"),
      imageEditorSave: document.querySelector("#imageEditorSave"),
      imageEditorCancel: document.querySelector("#imageEditorCancel"),
      imageEditorStatus: document.querySelector("#imageEditorStatus"),
      recentAssetDock: document.querySelector("#recentAssetDock"),
      recentAssetList: document.querySelector("#recentAssetList"),
      referenceCollector: document.querySelector("#referenceCollector"),
      imageStrip: document.querySelector("#imageStrip"),
      imageThumbList: document.querySelector("#imageThumbList"),
      imageUploaderGrid: document.querySelector(".image-uploader-grid"),
      imageUploadSource: document.querySelector("#imageUploadSource"),
      quickGalleryDock: document.querySelector("#quickGalleryDock"),
      quickGalleryPreview: document.querySelector("#quickGalleryPreview"),
      quickGalleryList: document.querySelector("#quickGalleryList"),
      quickGalleryRail: document.querySelector("#quickGalleryRail"),
      galleryManagePanel: document.querySelector("#galleryManagePanel"),
      galleryManageButton: document.querySelector("#galleryManageButton"),
      galleryDrawer: document.querySelector("#galleryDrawer"),
      galleryDrawerClose: document.querySelector("#galleryDrawerClose"),
      galleryDrawerBackdrop: document.querySelector("#galleryDrawerBackdrop"),
      galleryDrawerSubtitle: document.querySelector("#galleryDrawerSubtitle"),
      galleryDrawerCategoryTabs: document.querySelector("#galleryDrawerCategoryTabs"),
      galleryCategoryManagePanel: document.querySelector("#galleryCategoryManagePanel"),
      galleryCategoryManageToggle: document.querySelector("#galleryCategoryManageToggle"),
      galleryCategoryList: document.querySelector("#galleryCategoryList"),
      newGalleryCategoryName: document.querySelector("#newGalleryCategoryName"),
      newGalleryCategoryPromptRole: document.querySelector("#newGalleryCategoryPromptRole"),
      addGalleryCategoryButton: document.querySelector("#addGalleryCategoryButton"),
      galleryGrid: document.querySelector("#galleryGrid"),
      addToGalleryModal: document.querySelector("#addToGalleryModal"),
      addToGalleryClose: document.querySelector("#addToGalleryClose"),
      addToGalleryPreview: document.querySelector("#addToGalleryPreview"),
      galleryNameInput: document.querySelector("#galleryNameInput"),
      galleryCategoryInput: document.querySelector("#galleryCategoryInput"),
      galleryPromptNoteInput: document.querySelector("#galleryPromptNoteInput"),
      saveToGalleryButton: document.querySelector("#saveToGalleryButton"),
      clearImagesButton: document.querySelector("#clearImagesButton"),
      pasteClipboardButton: document.querySelector("#pasteClipboardButton"),
      prompt: document.querySelector("#prompt"),
      promptEditor: document.querySelector("#promptEditor"),
      promptTemplateButton: document.querySelector("#promptTemplateButton"),
      promptTemplateRecentDock: document.querySelector("#promptTemplateRecentDock"),
      promptTemplateDrawer: document.querySelector("#promptTemplateDrawer"),
      promptTemplateDrawerClose: document.querySelector("#promptTemplateDrawerClose"),
      promptTemplateDrawerBackdrop: document.querySelector("#promptTemplateDrawerBackdrop"),
      promptTemplateSummary: document.querySelector("#promptTemplateSummary"),
      promptTemplateSearch: document.querySelector("#promptTemplateSearch"),
      promptTemplateCreateButton: document.querySelector("#promptTemplateCreateButton"),
      promptTemplateImportButton: document.querySelector("#promptTemplateImportButton"),
      promptTemplateImportInput: document.querySelector("#promptTemplateImportInput"),
      promptTemplateExportButton: document.querySelector("#promptTemplateExportButton"),
      promptTemplateCategoryList: document.querySelector("#promptTemplateCategoryList"),
      promptTemplateCategoryManageButton: document.querySelector("#promptTemplateCategoryManageButton"),
      promptTemplateCategoryPanel: document.querySelector("#promptTemplateCategoryPanel"),
      promptTemplateList: document.querySelector("#promptTemplateList"),
      promptTemplateDetail: document.querySelector("#promptTemplateDetail"),
      promptTemplateForm: document.querySelector("#promptTemplateForm"),
      mentionSuggest: document.querySelector("#mentionSuggest"),
      colorSuggest: document.querySelector("#colorSuggest"),
      charCount: document.querySelector("#charCount"),
      clearPromptButton: document.querySelector("#clearPromptButton"),
      promptFindButton: document.querySelector("#promptFindButton"),
      promptFindPanel: document.querySelector("#promptFindPanel"),
      promptFindInput: document.querySelector("#promptFindInput"),
      promptReplaceInput: document.querySelector("#promptReplaceInput"),
      promptFindCount: document.querySelector("#promptFindCount"),
      promptFindStatus: document.querySelector("#promptFindStatus"),
      promptFindClose: document.querySelector("#promptFindClose"),
      modeSettingsSlot: document.querySelector("#modeSettingsSlot"),
      modeSpecificSettings: document.querySelector("#modeSpecificSettings"),
      mainModelField: document.querySelector("#mainModelField"),
      mainModelCombobox: document.querySelector("#mainModelCombobox"),
      mainModel: document.querySelector("#mainModel"),
      mainModelToggle: document.querySelector("#mainModelToggle"),
      mainModelOptions: document.querySelector("#mainModelOptions"),
      promptFidelityField: document.querySelector("#promptFidelityField"),
      promptFidelity: document.querySelector("#promptFidelity"),
      apiDirectSettingsNotice: document.querySelector("#apiDirectSettingsNotice"),
      settingsGrid: document.querySelector("#settingsGrid"),
      model: document.querySelector("#model"),
      size: document.querySelector("#size"),
      sizeModeGroup: document.querySelector("#sizeModeGroup"),
      customSizeToggle: document.querySelector("#customSizeToggle"),
      nInput: document.querySelector("#nInput"),
      nValue: document.querySelector("#nValue"),
      resolution: document.querySelector("#resolution"),
      ratio: document.querySelector("#ratio"),
      orientation: document.querySelector("#orientation"),
      pixelPreview: document.querySelector("#pixelPreview"),
      customSize: document.querySelector("#customSize"),
      customSizeHint: document.querySelector("#customSizeHint"),
      customWidth: document.querySelector("#customWidth"),
      customHeight: document.querySelector("#customHeight"),
      customRatioField: document.querySelector(".custom-ratio-field"),
      customRatioWidth: document.querySelector("#customRatioWidth"),
      customRatioHeight: document.querySelector("#customRatioHeight"),
      customRatioFromImageButton: document.querySelector("#customRatioFromImageButton"),
      swapCustomSizeButton: document.querySelector("#swapCustomSizeButton"),
      quality: document.querySelector("#quality"),
      outputFormat: document.querySelector("#outputFormat"),
      outputFormatField: document.querySelector("#outputFormatField"),
      outputFormatGroup: document.querySelector("#outputFormatGroup"),
      moderation: document.querySelector("#moderation"),
      compressionPopover: document.querySelector("#compressionPopover"),
      compressionField: document.querySelector("#compressionField"),
      compression: document.querySelector("#compression"),
      compressionValue: document.querySelector("#compressionValue"),
      runButton: document.querySelector("#runButton"),
      statusText: document.querySelector("#statusText"),
      previewGrid: document.querySelector("#previewGrid"),
      downloadAllButton: document.querySelector("#downloadAllButton"),
      previewSelectionActions: document.querySelector("#previewSelectionActions"),
      previewSelectionCount: document.querySelector("#previewSelectionCount"),
      downloadSelectedButton: document.querySelector("#downloadSelectedButton"),
      deleteUnselectedOutputsButton: document.querySelector("#deleteUnselectedOutputsButton"),
      refreshButton: document.querySelector("#refreshButton"),
      copyJsonButton: document.querySelector("#copyJsonButton"),
      requestJson: document.querySelector("#requestJson"),
      controlsCol: document.querySelector(".controls-col"),
      previewCol: document.querySelector(".preview-col"),
      previewPanel: document.querySelector(".preview-panel")
    };
  }

  // codex_image/webui/frontend/src/legacy-bridge.ts
  function installLegacyBridge(bridge40) {
    window.__codexImageWebUI = bridge40;
    return bridge40;
  }
  function bindBridgeMethod(name, options = {}) {
    const proxy2 = (...args) => {
      const method = window.__codexImageWebUI?.methods?.[name];
      if (typeof method !== "function" || method === proxy2) {
        if (options.required) {
          throw new Error("Legacy bridge method " + name + " is not initialized");
        }
        return void 0;
      }
      return method(...args);
    };
    return proxy2;
  }

  // codex_image/webui/frontend/src/state.ts
  function getLegacyBridge() {
    const bridge40 = window.__codexImageWebUI;
    if (!bridge40) {
      throw new Error("WebUI legacy bridge is not initialized");
    }
    return bridge40;
  }
  function getState() {
    return getLegacyBridge().state;
  }

  // codex_image/webui/frontend/src/runtime-feedback.ts
  function legacyMethod(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var renderTasks = (...args) => legacyMethod("renderTasks", ...args);
  var renderPreview = (...args) => legacyMethod("renderPreview", ...args);
  var revokeTaskUploadPreviewUrls = (...args) => legacyMethod("revokeTaskUploadPreviewUrls", ...args);
  var taskProgressStartValue = (...args) => legacyMethod("taskProgressStartValue", ...args);
  var taskStatusAccessibleLabel = (...args) => legacyMethod("taskStatusAccessibleLabel", ...args);
  var taskMetaText = (...args) => legacyMethod("taskMetaText", ...args);
  var taskRuntimeText = (...args) => legacyMethod("taskRuntimeText", ...args);
  var taskRetryStateText = (...args) => legacyMethod("taskRetryStateText", ...args);
  var timestampMs = (...args) => legacyMethod("timestampMs", ...args);
  var elapsedSecondsSince = (...args) => legacyMethod("elapsedSecondsSince", ...args);
  var elapsedMillisecondsSince = (...args) => legacyMethod("elapsedMillisecondsSince", ...args);
  var formatDuration = (...args) => legacyMethod("formatDuration", ...args);
  var formatDurationParts = (...args) => legacyMethod("formatDurationParts", ...args);
  var formatDurationTenths = (...args) => legacyMethod("formatDurationTenths", ...args);
  var elapsedPartMarkup = (...args) => legacyMethod("elapsedPartMarkup", ...args);
  var elapsedTimerMarkup = (...args) => legacyMethod("elapsedTimerMarkup", ...args);
  var setStatus = (...args) => legacyMethod("setStatus", ...args);
  var getPromptText = (...args) => legacyMethod("getPromptText", ...args);
  function updateTaskInState(task) {
    const state33 = getLegacyBridge().state;
    if (!task?.task_id) return false;
    const taskId = String(task.task_id);
    const previousIndex = state33.tasks.findIndex((item) => String(item.task_id) === taskId);
    if (previousIndex === -1) {
      state33.tasks.unshift(task);
      return true;
    }
    const previousTask = state33.tasks[previousIndex];
    if (previousTask?.local_pending) {
      revokeTaskUploadPreviewUrls(previousTask);
    }
    state33.tasks = state33.tasks.map((item, index) => index === previousIndex ? task : item);
    if (state33.pendingTaskId && String(state33.pendingTaskId) === taskId && !task.local_pending) {
      state33.pendingTaskId = null;
    }
    return true;
  }
  function formatTaskStatus(task) {
    if (!task) return "";
    if (task.status === "submitting") return "\u63D0\u4EA4\u4E2D";
    if (task.status === "running") {
      const progressStartedAt = taskProgressStartValue(task);
      const elapsed = progressStartedAt ? ` \xB7 ${formatDuration(elapsedSecondsSince(progressStartedAt))}` : "";
      return `\u751F\u6210\u4E2D${elapsed}`;
    }
    if (task.status === "completed") return "\u5DF2\u5B8C\u6210";
    if (task.status === "partial_failed") return "\u90E8\u5206\u5931\u8D25";
    if (task.status === "failed") return "\u5931\u8D25";
    if (task.status === "queued") return "\u6392\u961F\u4E2D";
    return task.status || "";
  }
  function startUiClock() {
    const state33 = getLegacyBridge().state;
    if (state33.uiClockTimerId) return;
    state33.uiClockTimerId = window.setInterval(updateElapsedDisplays, 100);
  }
  function updateElapsedDisplays() {
    updateTaskElapsedDisplays();
    window.updateQueueElapsedDisplays?.();
    updatePreviewElapsedDisplay();
  }
  function updateTaskElapsedDisplays() {
    const { state: state33, els: els43 } = getLegacyBridge();
    const root = els43.taskHistoryShell || els43.taskList;
    if (!root) return;
    const tasksById = new Map(state33.tasks.map((task) => [String(task.task_id), task]));
    root.querySelectorAll("[data-task-status-id]").forEach((element2) => {
      const task = tasksById.get(String(element2.dataset.taskStatusId || ""));
      if (task) {
        element2.textContent = formatTaskStatus(task) || "\u672A\u77E5\u72B6\u6001";
        element2.closest(".task-status-row")?.setAttribute("aria-label", taskStatusAccessibleLabel(task));
      }
    });
    root.querySelectorAll("[data-task-meta-id]").forEach((element2) => {
      const task = tasksById.get(String(element2.dataset.taskMetaId || ""));
      if (task) element2.textContent = taskMetaText(task);
    });
    root.querySelectorAll("[data-task-runtime-id]").forEach((element2) => {
      const task = tasksById.get(String(element2.dataset.taskRuntimeId || ""));
      if (task) element2.textContent = taskRuntimeText(task);
    });
    root.querySelectorAll("[data-task-retry-id]").forEach((element2) => {
      const task = tasksById.get(String(element2.dataset.taskRetryId || ""));
      if (task) element2.textContent = taskRetryStateText(task);
    });
  }
  function updatePreviewElapsedDisplay() {
    const { els: els43 } = getLegacyBridge();
    if (!els43.previewGrid) return;
    els43.previewGrid.querySelectorAll("[data-preview-elapsed]").forEach((element2) => {
      updateElapsedTimerElement(element2, elapsedMillisecondsSince(element2.dataset.previewStart));
    });
  }
  function updateElapsedTimerElement(element2, totalMilliseconds) {
    const elapsed = formatDurationParts(totalMilliseconds);
    element2.setAttribute("aria-label", elapsed.text);
    const main = element2.querySelector(".elapsed-main");
    const ms = element2.querySelector(".elapsed-ms");
    if (main && ms) {
      updateElapsedPartElement(main, elapsed.clock);
      updateElapsedPartElement(ms, elapsed.fraction);
      return;
    }
    element2.innerHTML = elapsedTimerMarkup(totalMilliseconds);
  }
  function updateElapsedPartElement(element2, text) {
    const chars = Array.from(text);
    const charNodes = Array.from(element2.querySelectorAll("[data-elapsed-char]"));
    if (charNodes.length !== chars.length) {
      element2.innerHTML = elapsedPartMarkup(text);
      return;
    }
    for (const [index, node] of charNodes.entries()) {
      const char = chars[index];
      if (node.dataset.elapsedCharValue === char) continue;
      if (!/^\d$/.test(char || "") || !node.classList.contains("elapsed-wheel")) {
        element2.innerHTML = elapsedPartMarkup(text);
        return;
      }
      node.dataset.elapsedCharValue = char;
      node.dataset.elapsedChar = char;
      node.style.setProperty("--digit-offset", char);
    }
  }
  function updatePromptCount() {
    const { els: els43 } = getLegacyBridge();
    if (!els43.charCount) return;
    els43.charCount.textContent = `${getPromptText().length} / 4000`;
  }
  function addPendingTask(task) {
    const state33 = getLegacyBridge().state;
    state33.pendingTaskId = task.task_id;
    state33.selectedTaskId = task.task_id;
    state33.tasks = [task, ...state33.tasks.filter((item) => item.task_id !== task.task_id)];
    renderTasks();
    renderPreview(task);
  }
  function replacePendingTask(pendingTaskId, completedTask) {
    const state33 = getLegacyBridge().state;
    const removedPendingTasks = state33.tasks.filter((task) => task?.local_pending && (task.task_id === completedTask.task_id || task.task_id === pendingTaskId));
    state33.tasks = [
      completedTask,
      ...state33.tasks.filter((task) => task.task_id !== completedTask.task_id && task.task_id !== pendingTaskId)
    ];
    removedPendingTasks.forEach(revokeTaskUploadPreviewUrls);
    state33.selectedTaskId = completedTask.task_id;
    state33.pendingTaskId = null;
    renderTasks();
    renderPreview(completedTask);
  }
  function markPendingTaskFailed(pendingTaskId, message) {
    const state33 = getLegacyBridge().state;
    const task = state33.tasks.find((item) => item.task_id === pendingTaskId);
    if (!task) return;
    task.status = "failed";
    task.error = message;
    task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    state33.selectedTaskId = pendingTaskId;
    state33.pendingTaskId = null;
    renderTasks();
    renderPreview(task);
  }
  function startRunFeedback(task, actionLabel = null) {
    const { state: state33, els: els43 } = getLegacyBridge();
    stopRunFeedback();
    state33.runFeedbackAction = actionLabel;
    state33.runStartedAt = timestampMs(task.started_at || task.created_at) || Date.now();
    state33.runTimerId = window.setInterval(updateRunFeedback, 100);
    els43.runButton?.classList.add("running");
    updateRunFeedback();
  }
  function updateRunFeedback() {
    const { state: state33, els: els43 } = getLegacyBridge();
    if (!state33.runStartedAt) return;
    const elapsed = formatDurationTenths(elapsedMillisecondsSince(state33.runStartedAt));
    const action = state33.runFeedbackAction || (state33.mode === "edit" ? "\u7F16\u8F91\u4E2D" : "\u751F\u6210\u4E2D");
    if (els43.runButton) els43.runButton.textContent = `${action} ${elapsed}`;
    setStatus(`${action}\uFF0C\u8BA1\u65F6 ${elapsed}`, "running");
    updateElapsedDisplays();
    if (state33.selectedTaskId === state33.pendingTaskId) {
      renderPreview();
    }
  }
  function stopRunFeedback() {
    const { state: state33, els: els43 } = getLegacyBridge();
    if (state33.runTimerId) {
      window.clearInterval(state33.runTimerId);
    }
    state33.runTimerId = null;
    state33.runStartedAt = null;
    state33.runFeedbackAction = null;
    els43.runButton?.classList.remove("running");
    if (els43.runButton) els43.runButton.textContent = state33.mode === "edit" ? "\u5F00\u59CB\u7F16\u8F91" : "\u5F00\u59CB\u751F\u6210";
  }

  // codex_image/webui/frontend/src/state-defaults.ts
  var DEFAULT_GALLERY_CATEGORIES = [
    { id: "portrait", name: "\u4EBA\u50CF", prompt_role: "\u4EBA\u50CF\u53C2\u8003", order: 10 },
    { id: "character", name: "\u89D2\u8272", prompt_role: "\u89D2\u8272\u53C2\u8003", order: 20 },
    { id: "product", name: "\u4EA7\u54C1", prompt_role: "\u4EA7\u54C1\u53C2\u8003", order: 30 }
  ];
  var DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
  var DEFAULT_API_IMAGE_MODEL = "gpt-image-2";
  var DEFAULT_API_MODE = "images";
  var DEFAULT_API_IMAGES_CONCURRENCY = 4;
  var API_SETTINGS_STORAGE_KEY = "codex-image-api-settings";
  var DEFAULT_DOCUMENT_TITLE = document.title || "iLab GPT CONJURE";
  var TASK_HISTORY_EXPANDED_GROUP_STORAGE_KEY = "codex-image-task-history-expanded-group";
  function defaultGalleryCategories() {
    return DEFAULT_GALLERY_CATEGORIES.map((category) => ({ ...category }));
  }
  function createDefaultState() {
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
          { name: "\u767D\u8272", hex: "#FFFFFF", order: 10 },
          { name: "\u9ED1\u8272", hex: "#111111", order: 20 },
          { name: "\u6696\u7C73\u8272", hex: "#F6E8D8", order: 30 },
          { name: "\u6D45\u7EFF", hex: "#E6F0EC", order: 40 },
          { name: "\u54C1\u724C\u7EFF", hex: "#457B66", order: 50 },
          { name: "\u6843\u6A59", hex: "#F4B183", order: 60 },
          { name: "\u6D45\u84DD", hex: "#B7D7F0", order: 70 },
          { name: "\u6D45\u7C89", hex: "#F8D7DA", order: 80 }
        ],
        recent_colors: [],
        recent_limit: 6
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
      taskViewedRequestIds: /* @__PURE__ */ new Set(),
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
      taskNotificationSeenKeys: /* @__PURE__ */ new Set(),
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
          images_concurrency: DEFAULT_API_IMAGES_CONCURRENCY
        }]
      },
      apiSettingsSaveTimerId: null,
      mainModelComboboxOpen: false,
      mainModelOptionIndex: 0,
      mainModelShowAllOptions: false
    };
  }

  // codex_image/webui/frontend/src/webui-utils.ts
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function cssEscape(value) {
    const text = String(value || "");
    if (window.CSS?.escape) return window.CSS.escape(text);
    return text.replace(/["\\]/g, "\\$&");
  }

  // codex_image/webui/frontend/src/bootstrap.ts
  var state = createDefaultState();
  var els = createWebUIElements();
  var proxy = (name) => bindBridgeMethod(name);
  function syncActiveLightboxUrls() {
  }
  var bridgeMethods = {
    addApiProvider: proxy("addApiProvider"),
    addGalleryInput: proxy("addGalleryInput"),
    addImageFiles: proxy("addImageFiles"),
    addPendingTask,
    addReferenceAssetInput: proxy("addReferenceAssetInput"),
    acceptTaskSuccesses: proxy("acceptTaskSuccesses"),
    applyTaskUpdate: proxy("applyTaskUpdate"),
    applyTasksSnapshot: proxy("applyTasksSnapshot"),
    assetSource: proxy("assetSource"),
    backendForAuthSource: proxy("backendForAuthSource"),
    bindFormControlEvents: proxy("bindFormControlEvents"),
    bindOverlayPopoverEvents: proxy("bindOverlayPopoverEvents"),
    bindShellUiEvents: proxy("bindShellUiEvents"),
    bindTaskListControlEvents: proxy("bindTaskListControlEvents"),
    canAddSourceToGallery: proxy("canAddSourceToGallery"),
    categoryLabel: proxy("categoryLabel"),
    categoryPromptRole: proxy("categoryPromptRole"),
    closeAccountQuotaDrawer: proxy("closeAccountQuotaDrawer"),
    closeAddToGallery: proxy("closeAddToGallery"),
    closeApiSettingsModal: proxy("closeApiSettingsModal"),
    closeConfirmPopover: proxy("closeConfirmPopover"),
    closeGallery: proxy("closeGallery"),
    closePromptPopover: proxy("closePromptPopover"),
    closeSettingsModal: proxy("closeSettingsModal"),
    cleanupSessionSelections: proxy("cleanupSessionSelections"),
    collectReferenceOutput: proxy("collectReferenceOutput"),
    colorNameForHex: proxy("colorNameForHex"),
    colorSwatchButton: proxy("colorSwatchButton"),
    buildPromptForModel: proxy("buildPromptForModel"),
    createGalleryChip: proxy("createGalleryChip"),
    createPromptSnippetChip: proxy("createPromptSnippetChip"),
    currentApiImagesConcurrency: proxy("currentApiImagesConcurrency"),
    currentApiMode: proxy("currentApiMode"),
    currentApiProviderId: proxy("currentApiProviderId"),
    currentApiProviderLabel: proxy("currentApiProviderLabel"),
    currentAuthSource: proxy("currentAuthSource"),
    currentMainModel: proxy("currentMainModel"),
    currentPromptFidelity: proxy("currentPromptFidelity"),
    currentPromptForModel: proxy("currentPromptForModel"),
    currentSize: proxy("currentSize"),
    currentTaskParams: proxy("currentTaskParams"),
    customSizeValidationMessage: proxy("customSizeValidationMessage"),
    deleteApiProvider: proxy("deleteApiProvider"),
    deleteTask: proxy("deleteTask"),
    escapeHtml,
    favoriteColorsForDisplay: proxy("favoriteColorsForDisplay"),
    findGalleryItem: proxy("findGalleryItem"),
    firstVisibleTaskId: proxy("firstVisibleTaskId"),
    formatTaskStatus,
    galleryInputs: proxy("galleryInputs"),
    gallerySource: proxy("gallerySource"),
    getPromptText: proxy("getPromptText"),
    handleAuthSourceClick: proxy("handleAuthSourceClick"),
    handleAuthSourceDoubleClick: proxy("handleAuthSourceDoubleClick"),
    handleCustomDimensionInput: proxy("handleCustomDimensionInput"),
    handleQuickGalleryBoundaryWheel: proxy("handleQuickGalleryBoundaryWheel"),
    handleQuickGalleryCategoryEvent: proxy("handleQuickGalleryCategoryEvent"),
    imageFileFromUrl: proxy("imageFileFromUrl"),
    importColorPalette: proxy("importColorPalette"),
    isDirectApiMode: proxy("isDirectApiMode"),
    isQueueDispatchPending: proxy("isQueueDispatchPending"),
    isEditableImageSource: proxy("isEditableImageSource"),
    isTaskArchived: proxy("isTaskArchived"),
    markPendingTaskFailed,
    markTaskViewed: proxy("markTaskViewed"),
    migrateLegacyArchivedTasks: proxy("migrateLegacyArchivedTasks"),
    missingGalleryInputs: proxy("missingGalleryInputs"),
    missingReferenceAssetInputs: proxy("missingReferenceAssetInputs"),
    normalizeApiImagesConcurrency: proxy("normalizeApiImagesConcurrency"),
    normalizeApiSettings: proxy("normalizeApiSettings"),
    normalizeHexColor: proxy("normalizeHexColor"),
    notifyTaskUpdate: proxy("notifyTaskUpdate"),
    openAccountQuotaDrawer: proxy("openAccountQuotaDrawer"),
    openAddToGallery: proxy("openAddToGallery"),
    openApiSettingsModal: proxy("openApiSettingsModal"),
    openConfirmPopover: proxy("openConfirmPopover"),
    openGallery: proxy("openGallery"),
    openPromptPopover: proxy("openPromptPopover"),
    openSettingsModal: proxy("openSettingsModal"),
    persistApiSettings: proxy("persistApiSettings"),
    persistMainModel: proxy("persistMainModel"),
    populateApiSettingsForm: proxy("populateApiSettingsForm"),
    populateSettingsForm: proxy("populateSettingsForm"),
    positionPromptPopover: proxy("positionPromptPopover"),
    readApiSettingsForm: proxy("readApiSettingsForm"),
    recentColorsForDisplay: proxy("recentColorsForDisplay"),
    refreshAccountQuota: proxy("refreshAccountQuota"),
    refreshApiSettings: proxy("refreshApiSettings"),
    refreshColorPalette: proxy("refreshColorPalette"),
    refreshGallery: proxy("refreshGallery"),
    refreshHealth: proxy("refreshHealth"),
    refreshPromptTemplates: proxy("refreshPromptTemplates"),
    refreshPromptSnippets: proxy("refreshPromptSnippets"),
    refreshRecentAssets: proxy("refreshRecentAssets"),
    refreshSettings: proxy("refreshSettings"),
    refreshTasks: proxy("refreshTasks"),
    revealActiveTaskGroup: proxy("revealActiveTaskGroup"),
    retryFailedTask: proxy("retryFailedTask"),
    referenceAssetInputs: proxy("referenceAssetInputs"),
    rememberRecentColor: proxy("rememberRecentColor"),
    removeBatchSelectedTaskId: proxy("removeBatchSelectedTaskId"),
    removeFavoriteColor: proxy("removeFavoriteColor"),
    renderArchiveButton: proxy("renderArchiveButton"),
    renderArchiveModal: proxy("renderArchiveModal"),
    renderAccountQuota: proxy("renderAccountQuota"),
    renderAuthSource: proxy("renderAuthSource"),
    renderBatchToolbar: proxy("renderBatchToolbar"),
    renderGalleryCategoryControls: proxy("renderGalleryCategoryControls"),
    renderImageStrip: proxy("renderImageStrip"),
    renderPreview: proxy("renderPreview"),
    renderTaskHistoryAnchors: proxy("renderTaskHistoryAnchors"),
    renderReferenceCollector: proxy("renderReferenceCollector"),
    renderTasks: proxy("renderTasks"),
    replacePendingTask,
    replaceTask: proxy("replaceTask"),
    restoreApiSettings: proxy("restoreApiSettings"),
    restoreExpandedTaskGroupKey: proxy("restoreExpandedTaskGroupKey"),
    restoreLegacyArchivedTasks: proxy("restoreLegacyArchivedTasks"),
    restoreMainModel: proxy("restoreMainModel"),
    restoreSidebarWidth: proxy("restoreSidebarWidth"),
    restoreThemePreference: proxy("restoreThemePreference"),
    revokeTaskUploadPreviewUrls: proxy("revokeTaskUploadPreviewUrls"),
    revokeUploadPreviewUrl: proxy("revokeUploadPreviewUrl"),
    revokeUploadPreviewUrls: proxy("revokeUploadPreviewUrls"),
    runTask: proxy("runTask"),
    saveApiSettings: proxy("saveApiSettings"),
    saveFavoriteColor: proxy("saveFavoriteColor"),
    saveSettings: proxy("saveSettings"),
    saveUploadToGallery: proxy("saveUploadToGallery"),
    scheduleQuickGalleryFocusUpdate: proxy("scheduleQuickGalleryFocusUpdate"),
    selectTask: proxy("selectTask"),
    ensureExpandedTaskGroupKey: proxy("ensureExpandedTaskGroupKey"),
    setMode: proxy("setMode"),
    setExpandedTaskGroupKey: proxy("setExpandedTaskGroupKey"),
    setPromptText: proxy("setPromptText"),
    setPromptWithGalleryRefs: proxy("setPromptWithGalleryRefs"),
    setStatus: proxy("setStatus"),
    setTaskArchiveState: proxy("setTaskArchiveState"),
    setupPreviewPanelHeightSync: proxy("setupPreviewPanelHeightSync"),
    sourceName: proxy("sourceName"),
    sourcePreviewUrl: proxy("sourcePreviewUrl"),
    startRunFeedback,
    startUiClock,
    stopRunFeedback,
    scrollExpandedTaskGroupToTop: proxy("scrollExpandedTaskGroupToTop"),
    syncActiveLightboxUrls,
    syncGalleryInputsFromPrompt: proxy("syncGalleryInputsFromPrompt"),
    syncPromptFromEditor: proxy("syncPromptFromEditor"),
    syncPromptGalleryMentionsFromInputs: proxy("syncPromptGalleryMentionsFromInputs"),
    syncRadioButtons: proxy("syncRadioButtons"),
    syncSizeControlsFromSize: proxy("syncSizeControlsFromSize"),
    taskApiProviderId: proxy("taskApiProviderId"),
    taskApiProviderLabel: proxy("taskApiProviderLabel"),
    taskBackendLabel: proxy("taskBackendLabel"),
    taskHasViewableUpdate: proxy("taskHasViewableUpdate"),
    taskRetryStateText: proxy("taskRetryStateText"),
    taskTotalCount: proxy("taskTotalCount"),
    accountQuotaLimitRowsHtml: proxy("accountQuotaLimitRowsHtml"),
    toggleAccountQueueEnabled: proxy("toggleAccountQueueEnabled"),
    toggleColorPaletteManageMode: proxy("toggleColorPaletteManageMode"),
    updateCompression: proxy("updateCompression"),
    applyFirstReferenceImageAspectRatio: proxy("applyFirstReferenceImageAspectRatio"),
    updateCustomRatioFieldState: proxy("updateCustomRatioFieldState"),
    updateCustomRatioReferenceButtonState: proxy("updateCustomRatioReferenceButtonState"),
    updateCustomSize: proxy("updateCustomSize"),
    updateDocumentTitle: proxy("updateDocumentTitle"),
    addImages: proxy("addImages"),
    clearImages: proxy("clearImages"),
    updateImageStripDensity: proxy("updateImageStripDensity"),
    updatePixelPreview: proxy("updatePixelPreview"),
    updatePreviewElapsedDisplay,
    updatePromptCount,
    updateQuantity: proxy("updateQuantity"),
    updateRequestPreview: proxy("updateRequestPreview"),
    updateSizeFromPreset: proxy("updateSizeFromPreset"),
    updateTaskElapsedDisplays,
    updateTaskInState,
    uploadInputs: proxy("uploadInputs"),
    uploadSource: proxy("uploadSource")
  };
  function initializeLegacyBridge() {
    installLegacyBridge({
      state,
      els,
      boot: () => bootWebUI(state, els, bridgeMethods),
      constants: {
        defaultDocumentTitle: DEFAULT_DOCUMENT_TITLE
      },
      methods: bridgeMethods
    });
  }

  // codex_image/webui/frontend/legacy-app.js
  initializeLegacyBridge();

  // codex_image/webui/frontend/src/dom.ts
  function getEls() {
    return getLegacyBridge().els;
  }

  // codex_image/webui/frontend/src/input-sources.ts
  var inputSourcesFeatureInitialized = false;
  function legacyMethod2(name, ...args) {
    return getLegacyBridge().methods[name]?.(...args);
  }
  function setStatus2(message, type) {
    legacyMethod2("setStatus", message, type);
  }
  function escapeHtml2(value) {
    return legacyMethod2("escapeHtml", value);
  }
  function uploadSource(file) {
    return {
      kind: "upload",
      file,
      originalFile: file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      edited: false
    };
  }
  function gallerySource(item) {
    return {
      kind: "gallery",
      id: item.id,
      name: item.name,
      category: item.category,
      category_name: item.category_name || legacyMethod2("categoryLabel", item.category),
      category_prompt_role: item.category_prompt_role || legacyMethod2("categoryPromptRole", item.category),
      prompt_note: item.prompt_note || "",
      image_url: item.image_url || "",
      previewUrl: item.image_url || "",
      missing: Boolean(item.missing)
    };
  }
  function assetSource(item) {
    return {
      kind: "asset",
      id: item.id,
      name: item.name || item.filename || "\u6700\u8FD1\u4E0A\u4F20",
      filename: item.filename || "",
      mime_type: item.mime_type || "",
      image_url: item.image_url || "",
      previewUrl: item.image_url || "",
      missing: Boolean(item.missing)
    };
  }
  function sourcePreviewUrl(source) {
    if (!source) return "";
    if (source.kind === "upload") return source.previewUrl;
    return source.image_url || source.previewUrl || "";
  }
  function sourceListUsesPreviewUrl(sources, previewUrl, ignoredSources = /* @__PURE__ */ new Set()) {
    return Array.isArray(sources) && sources.some((source) => {
      if (!source || ignoredSources.has(source)) return false;
      if (typeof source === "string") return source === previewUrl;
      return sourcePreviewUrl(source) === previewUrl || source.preview_url === previewUrl;
    });
  }
  function uploadPreviewUrlInUse(previewUrl, options = {}) {
    const state33 = getState();
    if (!previewUrl) return false;
    const ignoredCurrentSources = options.ignoredCurrentSources || /* @__PURE__ */ new Set();
    const ignoredTasks = options.ignoredTasks || /* @__PURE__ */ new Set();
    if (sourceListUsesPreviewUrl(state33.images, previewUrl, ignoredCurrentSources)) return true;
    return state33.tasks.some((task) => {
      if (!task || ignoredTasks.has(task)) return false;
      return task.preview_url === previewUrl || sourceListUsesPreviewUrl(task.local_input_files, previewUrl) || sourceListUsesPreviewUrl(task.input_sources, previewUrl);
    });
  }
  function revokeUploadPreviewUrl(source, options = {}) {
    if (!source || source.kind !== "upload" || !source.previewUrl?.startsWith("blob:")) return;
    if (uploadPreviewUrlInUse(source.previewUrl, options)) return;
    URL.revokeObjectURL(source.previewUrl);
  }
  function revokeUploadPreviewUrls(sources) {
    const uploadSources = (Array.isArray(sources) ? sources : []).filter((source) => source?.kind === "upload");
    const ignoredCurrentSources = new Set(uploadSources);
    uploadSources.forEach((source) => revokeUploadPreviewUrl(source, { ignoredCurrentSources }));
  }
  function taskUploadSources(task) {
    const sources = [];
    const seenPreviewUrls = /* @__PURE__ */ new Set();
    [task?.local_input_files, task?.input_sources].forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((source) => {
        if (!source || source.kind !== "upload" || !source.previewUrl) return;
        if (seenPreviewUrls.has(source.previewUrl)) return;
        seenPreviewUrls.add(source.previewUrl);
        sources.push(source);
      });
    });
    return sources;
  }
  function revokeTaskUploadPreviewUrls2(task) {
    if (!task) return;
    const ignoredTasks = /* @__PURE__ */ new Set([task]);
    taskUploadSources(task).forEach((source) => revokeUploadPreviewUrl(source, { ignoredTasks }));
  }
  function sourceName(source) {
    if (!source) return "";
    if (source.kind === "upload") return source.name || source.file?.name || "\u4E0A\u4F20\u56FE\u7247";
    if (source.kind === "asset") return source.name || source.filename || "\u6700\u8FD1\u4E0A\u4F20";
    return source.name || "\u56FE\u5E93\u56FE\u7247";
  }
  function addGalleryInput(item, options = {}) {
    const state33 = getState();
    if (!item) return;
    const alreadySelected = state33.images.some((source) => source.kind === "gallery" && source.id === item.id);
    if (!alreadySelected) {
      state33.images.push(gallerySource(item));
      if (state33.mode !== "edit") {
        legacyMethod2("setMode", "edit");
      }
      legacyMethod2("renderImageStrip");
    }
    if (options.syncPrompt !== false) legacyMethod2("ensurePromptGalleryMention", item);
    legacyMethod2("updateRequestPreview");
  }
  function galleryInputs() {
    const galleries = getState().images.filter((image) => image.kind === "gallery");
    return galleries.filter((image) => !image.missing);
  }
  function referenceAssetInputs() {
    return getState().images.filter((image) => image.kind === "asset" && !image.missing);
  }
  function uploadInputs() {
    return getState().images.filter((image) => image.kind === "upload");
  }
  function addImageFiles(files, options = {}) {
    const state33 = getState();
    const imageFiles = Array.from(files || []).filter((file) => file?.type?.startsWith("image/"));
    if (!imageFiles.length) {
      if (options.emptyMessage) setStatus2(options.emptyMessage, "error");
      return false;
    }
    state33.images.push(...imageFiles.map((file) => uploadSource(file)));
    if (state33.images.length > 0 && state33.mode !== "edit") {
      legacyMethod2("setMode", "edit");
    }
    legacyMethod2("renderImageStrip");
    legacyMethod2("updateRequestPreview");
    if (options.successMessage) {
      setStatus2(typeof options.successMessage === "function" ? options.successMessage(imageFiles.length) : options.successMessage, "ok");
    }
    return true;
  }
  function clipboardImageFilename(type, index) {
    const extensionByType = {
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };
    const extension = extensionByType[String(type || "").toLowerCase()] || "png";
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    return `clipboard-${timestamp}-${index + 1}.${extension}`;
  }
  function clipboardFileFromDataTransferItem(item, index) {
    const file = item?.getAsFile?.();
    if (!file) return null;
    const type = file.type || item.type || "image/png";
    return new File([file], clipboardImageFilename(type, index), {
      type,
      lastModified: file.lastModified || Date.now()
    });
  }
  function imageFilesFromClipboardItems(items) {
    return Array.from(items || []).filter((item) => item?.kind === "file" && item.type?.startsWith("image/")).map((item, index) => clipboardFileFromDataTransferItem(item, index)).filter(Boolean);
  }
  function clipboardPasteShortcutLabel() {
    return /Mac|iPhone|iPad|iPod/.test(String(globalThis.navigator?.platform || "")) ? "Cmd+V" : "Ctrl+V";
  }
  function clipboardReadFallbackMessage(prefix) {
    return `${prefix}\uFF0C\u56FE\u7247\u8F93\u5165\u533A\u5DF2\u805A\u7126\uFF0C\u8BF7\u6309 ${clipboardPasteShortcutLabel()} \u7C98\u8D34\u56FE\u7247`;
  }
  function focusImagePasteTarget() {
    const els43 = getEls();
    els43.imageUploadSource?.focus({ preventScroll: true });
  }
  function handleImagePaste(event) {
    const files = imageFilesFromClipboardItems(event.clipboardData?.items);
    if (!files.length) return;
    event.preventDefault();
    addImageFiles(files, {
      successMessage: (count) => `\u5DF2\u7C98\u8D34 ${count} \u5F20\u526A\u8D34\u677F\u56FE\u7247`
    });
  }
  async function readClipboardImageFiles() {
    const clipboardItems = await navigator.clipboard?.read();
    const files = [];
    for (const item of clipboardItems || []) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      files.push(new File([blob], clipboardImageFilename(imageType, files.length), {
        type: imageType,
        lastModified: Date.now()
      }));
    }
    return files;
  }
  async function pasteClipboardImages() {
    const els43 = getEls();
    if (!navigator.clipboard?.read) {
      focusImagePasteTarget();
      setStatus2(clipboardReadFallbackMessage("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u76F4\u63A5\u8BFB\u53D6\u526A\u8D34\u677F"), "error");
      return;
    }
    els43.pasteClipboardButton.disabled = true;
    try {
      const files = await readClipboardImageFiles();
      const added = addImageFiles(files, {
        emptyMessage: clipboardReadFallbackMessage("\u6CA1\u6709\u8BFB\u5230\u526A\u8D34\u677F\u56FE\u7247"),
        successMessage: (count) => `\u5DF2\u7C98\u8D34 ${count} \u5F20\u526A\u8D34\u677F\u56FE\u7247`
      });
      if (!added) focusImagePasteTarget();
    } catch (error) {
      focusImagePasteTarget();
      const reason = ["NotAllowedError", "SecurityError"].includes(String(error?.name || "")) ? "\u6D4F\u89C8\u5668\u62D2\u7EDD\u76F4\u63A5\u8BFB\u53D6\u526A\u8D34\u677F" : "\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F";
      setStatus2(clipboardReadFallbackMessage(reason), "error");
    } finally {
      els43.pasteClipboardButton.disabled = false;
    }
  }
  function missingGalleryInputs() {
    return getState().images.filter((image) => image.kind === "gallery" && image.missing);
  }
  function missingReferenceAssetInputs() {
    return getState().images.filter((image) => image.kind === "asset" && image.missing);
  }
  function addReferenceAssetInput(item) {
    const state33 = getState();
    if (!item?.id) return;
    const alreadySelected = state33.images.some((source) => source.kind === "asset" && source.id === item.id);
    if (alreadySelected) return;
    state33.images.push(assetSource(item));
    if (state33.mode !== "edit") {
      legacyMethod2("setMode", "edit");
    }
    legacyMethod2("renderImageStrip");
    legacyMethod2("updateRequestPreview");
  }
  function collectReferenceOutput(url, options = {}) {
    const state33 = getState();
    if (!url) return;
    if (state33.collectedReferences.some((item) => item.url === url)) {
      setStatus2("\u5DF2\u5728\u5F85\u52A0\u5165\u53C2\u8003\u56FE", "ok");
      return;
    }
    state33.collectedReferences.push({
      url,
      name: options.name || "",
      sourceTaskId: options.sourceTaskId || "",
      outputIndex: options.outputIndex || null
    });
    renderReferenceCollector();
    setStatus2(`\u5DF2\u6682\u5B58 ${state33.collectedReferences.length} \u5F20\u53C2\u8003\u56FE`, "ok");
  }
  function renderReferenceCollector() {
    const state33 = getState();
    const els43 = getEls();
    if (!els43.referenceCollector) return;
    const items = state33.collectedReferences;
    if (!items.length) {
      els43.referenceCollector.classList.add("hidden");
      els43.referenceCollector.innerHTML = "";
      return;
    }
    els43.referenceCollector.classList.remove("hidden");
    els43.referenceCollector.innerHTML = `
    <div class="reference-collector-header">
      <span>\u5F85\u52A0\u5165\u53C2\u8003\u56FE \xB7 ${items.length} \u5F20</span>
      <div class="reference-collector-actions">
        <button class="ghost-button text-sm" type="button" data-reference-collector-add-all>\u5168\u90E8\u52A0\u5165\u53C2\u8003\u56FE</button>
        <button class="ghost-button text-sm" type="button" data-reference-collector-clear>\u6E05\u7A7A</button>
      </div>
    </div>
    <div class="reference-collector-list">
      ${items.map((item, index) => `
        <div class="reference-collector-item" title="${escapeHtml2(item.name || "\u5F85\u52A0\u5165\u53C2\u8003\u56FE")}">
          <img src="${escapeHtml2(item.url)}" alt="">
          <button type="button" data-reference-collector-remove="${index}" aria-label="\u79FB\u9664\u5F85\u52A0\u5165\u53C2\u8003\u56FE">\xD7</button>
        </div>
      `).join("")}
    </div>
  `;
    els43.referenceCollector.querySelector("[data-reference-collector-add-all]")?.addEventListener("click", addCollectedReferencesToInput);
    els43.referenceCollector.querySelector("[data-reference-collector-clear]")?.addEventListener("click", () => clearCollectedReferences());
    els43.referenceCollector.querySelectorAll("[data-reference-collector-remove]").forEach((button) => {
      button.addEventListener("click", () => removeCollectedReference(button.dataset.referenceCollectorRemove));
    });
  }
  function removeCollectedReference(index) {
    const itemIndex = Number.parseInt(index, 10);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= getState().collectedReferences.length) return;
    getState().collectedReferences.splice(itemIndex, 1);
    renderReferenceCollector();
  }
  function clearCollectedReferences(options = {}) {
    getState().collectedReferences = [];
    renderReferenceCollector();
    if (!options.silent) setStatus2("\u5F85\u52A0\u5165\u53C2\u8003\u56FE\u5DF2\u6E05\u7A7A", "ok");
  }
  function imageExtensionFromType(type) {
    const normalized = String(type || "").toLowerCase();
    if (normalized === "image/jpeg") return "jpg";
    if (normalized === "image/webp") return "webp";
    if (normalized === "image/gif") return "gif";
    return "png";
  }
  function filenameFromImageUrl(url, fallback) {
    try {
      const pathname = new URL(url, window.location.origin).pathname;
      const filename = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      return filename || fallback;
    } catch {
      return fallback;
    }
  }
  function ensureImageFilenameExtension(filename, type) {
    const clean = String(filename || "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "reference.png";
    if (/\.(png|jpe?g|webp|gif)$/i.test(clean)) return clean;
    return `${clean}.${imageExtensionFromType(type)}`;
  }
  async function imageFileFromUrl(url, fallbackName) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`\u56FE\u7247\u8BFB\u53D6\u5931\u8D25\uFF1A${response.status}`);
    }
    const blob = await response.blob();
    const type = blob.type || "image/png";
    const filename = ensureImageFilenameExtension(filenameFromImageUrl(url, fallbackName), type);
    return new File([blob], filename, { type });
  }
  function collectedReferenceFilename(item, index) {
    return ensureImageFilenameExtension(item?.name || `collected-reference-${index + 1}`, "image/png");
  }
  async function addCollectedReferencesToInput() {
    const state33 = getState();
    const els43 = getEls();
    const items = state33.collectedReferences.slice();
    if (!items.length) return;
    const addButton = els43.referenceCollector?.querySelector("[data-reference-collector-add-all]");
    if (addButton) addButton.disabled = true;
    try {
      const files = [];
      for (const [index, item] of items.entries()) {
        files.push(await imageFileFromUrl(item.url, collectedReferenceFilename(item, index)));
      }
      const added = addImageFiles(files, {
        successMessage: (count) => `\u5DF2\u52A0\u5165 ${count} \u5F20\u53C2\u8003\u56FE`
      });
      if (added) clearCollectedReferences({ silent: true });
    } catch (error) {
      setStatus2(error.message || "\u5F85\u52A0\u5165\u53C2\u8003\u56FE\u52A0\u5165\u5931\u8D25", "error");
      renderReferenceCollector();
    }
  }
  function bindInputSourceEvents() {
    const els43 = getEls();
    els43.pasteClipboardButton?.addEventListener("click", pasteClipboardImages);
    document.addEventListener("paste", handleImagePaste);
  }
  function initInputSourcesFeature() {
    if (inputSourcesFeatureInitialized) return;
    inputSourcesFeatureInitialized = true;
    bindInputSourceEvents();
    Object.assign(getLegacyBridge().methods, {
      uploadSource,
      gallerySource,
      assetSource,
      sourcePreviewUrl,
      revokeUploadPreviewUrl,
      revokeUploadPreviewUrls,
      revokeTaskUploadPreviewUrls: revokeTaskUploadPreviewUrls2,
      sourceName,
      addGalleryInput,
      galleryInputs,
      referenceAssetInputs,
      uploadInputs,
      addImageFiles,
      handleImagePaste,
      pasteClipboardImages,
      missingGalleryInputs,
      missingReferenceAssetInputs,
      addReferenceAssetInput,
      collectReferenceOutput,
      renderReferenceCollector,
      imageFileFromUrl
    });
  }

  // codex_image/webui/frontend/src/image-editor.ts
  var IMAGE_EDITOR_PROMPT_HINT = "\u56FE\u4E2D\u7684\u624B\u7ED8\u7BAD\u5934\u548C\u6807\u8BB0\u4EC5\u7528\u4E8E\u6307\u793A\u7F16\u8F91\u8981\u6C42\uFF0C\u4E0D\u8981\u4FDD\u7559\u5728\u6700\u7EC8\u753B\u9762\u4E2D\u3002";
  var IMAGE_EDITOR_MAX_EXPORT_EDGE = 4096;
  var IMAGE_EDITOR_HISTORY_LIMIT = 30;
  var imageEditorState = {
    sessionId: 0,
    sourceIndex: null,
    source: null,
    originalFile: null,
    image: null,
    baseCanvas: null,
    workCanvas: null,
    brushBoundaryCanvas: null,
    brushOverlayCanvas: null,
    displayScale: 1,
    tool: "crop",
    color: "#ff3b30",
    strokeWidth: 8,
    crop: null,
    hasInstructionMarks: false,
    history: [],
    historyIndex: -1,
    drawing: null
  };
  var imageEditorFeatureInitialized = false;
  function legacyMethod3(name, ...args) {
    return getLegacyBridge().methods[name]?.(...args);
  }
  function editedUploadFilename(name) {
    const sourceName3 = String(name || "input.png");
    const dotIndex = sourceName3.lastIndexOf(".");
    const base = dotIndex > 0 ? sourceName3.slice(0, dotIndex) : sourceName3;
    return `${base}-edited.png`;
  }
  function isEditableImageSource(source) {
    if (!source || source.missing) return false;
    if (source.kind === "upload") return Boolean(source.file);
    return ["gallery", "asset"].includes(source.kind) && Boolean(legacyMethod3("sourcePreviewUrl", source));
  }
  function imageEditorSourceName(source) {
    if (!source) return "input.png";
    if (source.kind === "asset") return source.filename || source.name || "recent-image.png";
    if (source.kind === "gallery") return source.name || "gallery-image.png";
    return source.originalFile?.name || source.file?.name || source.name || "input.png";
  }
  async function remoteImageSourceFile(source) {
    const imageUrl = legacyMethod3("sourcePreviewUrl", source);
    if (!imageUrl) throw new Error("\u65E0\u6CD5\u8F7D\u5165\u8FD9\u5F20\u56FE\u7247\u8FDB\u884C\u7F16\u8F91");
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("\u65E0\u6CD5\u8F7D\u5165\u8FD9\u5F20\u56FE\u7247\u8FDB\u884C\u7F16\u8F91");
    const blob = await response.blob();
    return new File([blob], imageEditorSourceName(source), {
      type: blob.type || source.mime_type || "image/png",
      lastModified: Date.now()
    });
  }
  async function imageEditorSourceFile(source) {
    if (source.kind === "upload") return source.originalFile || source.file;
    return remoteImageSourceFile(source);
  }
  function setImageEditorStatus(message, type = "") {
    const els43 = getEls();
    if (!els43.imageEditorStatus) return;
    els43.imageEditorStatus.textContent = message || "";
    els43.imageEditorStatus.className = `image-editor-status ${type || ""}`.trim();
  }
  function nextImageEditorSession() {
    imageEditorState.sessionId += 1;
    return imageEditorState.sessionId;
  }
  function imageEditorContext(canvas = imageEditorState.workCanvas) {
    return canvas?.getContext("2d", { willReadFrequently: true }) || null;
  }
  function imageEditorBrushBoundaryContext() {
    return imageEditorState.brushBoundaryCanvas?.getContext("2d", { willReadFrequently: true }) || null;
  }
  function imageEditorBrushOverlayContext() {
    return imageEditorState.brushOverlayCanvas?.getContext("2d", { willReadFrequently: true }) || null;
  }
  function imageEditorVisibleContext() {
    return getEls().imageEditorCanvas?.getContext("2d") || null;
  }
  function imageEditorCanvasSnapshot(canvas) {
    if (!canvas) return null;
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const ctx = snapshot.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    return snapshot;
  }
  function imageEditorSnapshot() {
    const workCanvas = imageEditorCanvasSnapshot(imageEditorState.workCanvas);
    if (!workCanvas) return null;
    return {
      workCanvas,
      brushBoundaryCanvas: imageEditorCanvasSnapshot(imageEditorState.brushBoundaryCanvas),
      brushOverlayCanvas: imageEditorCanvasSnapshot(imageEditorState.brushOverlayCanvas),
      hasInstructionMarks: imageEditorState.hasInstructionMarks
    };
  }
  function restoreImageEditorCanvas(canvas, snapshot) {
    if (!canvas || !snapshot) return;
    const ctx = imageEditorContext(canvas);
    if (!ctx) return;
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    ctx.clearRect(0, 0, snapshot.width, snapshot.height);
    ctx.drawImage(snapshot, 0, 0);
  }
  function restoreImageEditorSnapshot(snapshot) {
    const canvas = imageEditorState.workCanvas;
    if (!snapshot || !canvas) return;
    const workSnapshot = snapshot.workCanvas || snapshot;
    restoreImageEditorCanvas(canvas, workSnapshot);
    imageEditorState.hasInstructionMarks = Boolean(snapshot.hasInstructionMarks);
    if (imageEditorState.brushBoundaryCanvas) {
      const boundarySnapshot = snapshot.brushBoundaryCanvas;
      if (boundarySnapshot) {
        restoreImageEditorCanvas(imageEditorState.brushBoundaryCanvas, boundarySnapshot);
      } else {
        const boundaryCtx = imageEditorBrushBoundaryContext();
        boundaryCtx?.clearRect(0, 0, imageEditorState.brushBoundaryCanvas.width, imageEditorState.brushBoundaryCanvas.height);
      }
    }
    if (imageEditorState.brushOverlayCanvas) {
      const overlaySnapshot = snapshot.brushOverlayCanvas;
      if (overlaySnapshot) {
        restoreImageEditorCanvas(imageEditorState.brushOverlayCanvas, overlaySnapshot);
      } else {
        const overlayCtx = imageEditorBrushOverlayContext();
        overlayCtx?.clearRect(0, 0, imageEditorState.brushOverlayCanvas.width, imageEditorState.brushOverlayCanvas.height);
      }
    }
    renderImageEditor();
  }
  async function loadImageEditorImage(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function imageEditorExportDimensions(image) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const longest = Math.max(width, height);
    if (longest <= IMAGE_EDITOR_MAX_EXPORT_EDGE) {
      return { width, height, scale: 1 };
    }
    const scale = IMAGE_EDITOR_MAX_EXPORT_EDGE / longest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      scale
    };
  }
  function initializeImageEditorCanvases(image) {
    const dimensions = imageEditorExportDimensions(image);
    const baseCanvas = document.createElement("canvas");
    const workCanvas = document.createElement("canvas");
    const brushBoundaryCanvas = document.createElement("canvas");
    const brushOverlayCanvas = document.createElement("canvas");
    baseCanvas.width = dimensions.width;
    baseCanvas.height = dimensions.height;
    workCanvas.width = dimensions.width;
    workCanvas.height = dimensions.height;
    brushBoundaryCanvas.width = dimensions.width;
    brushBoundaryCanvas.height = dimensions.height;
    brushOverlayCanvas.width = dimensions.width;
    brushOverlayCanvas.height = dimensions.height;
    const baseCtx = baseCanvas.getContext("2d");
    if (!baseCtx) throw new Error("\u65E0\u6CD5\u521B\u5EFA\u56FE\u7247\u7F16\u8F91\u753B\u5E03");
    baseCtx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    const workCtx = workCanvas.getContext("2d");
    if (!workCtx) throw new Error("\u65E0\u6CD5\u521B\u5EFA\u56FE\u7247\u7F16\u8F91\u753B\u5E03");
    workCtx.drawImage(baseCanvas, 0, 0);
    imageEditorState.baseCanvas = baseCanvas;
    imageEditorState.workCanvas = workCanvas;
    imageEditorState.brushBoundaryCanvas = brushBoundaryCanvas;
    imageEditorState.brushOverlayCanvas = brushOverlayCanvas;
    imageEditorState.crop = null;
    imageEditorState.hasInstructionMarks = false;
    imageEditorState.history = [];
    imageEditorState.historyIndex = -1;
    pushImageEditorHistory();
  }
  function renderImageEditor() {
    const els43 = getEls();
    const visible = els43.imageEditorCanvas;
    const work = imageEditorState.workCanvas;
    if (!visible || !work) return;
    visible.width = work.width;
    visible.height = work.height;
    const ctx = imageEditorVisibleContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, visible.width, visible.height);
    ctx.drawImage(work, 0, 0);
    updateImageEditorCropBox();
    updateImageEditorControls();
  }
  function pushImageEditorHistory() {
    const snapshot = imageEditorSnapshot();
    if (!snapshot) return;
    imageEditorState.history = imageEditorState.history.slice(0, imageEditorState.historyIndex + 1);
    imageEditorState.history.push(snapshot);
    imageEditorState.historyIndex = imageEditorState.history.length - 1;
    if (imageEditorState.history.length > IMAGE_EDITOR_HISTORY_LIMIT) {
      const trimCount = imageEditorState.history.length - IMAGE_EDITOR_HISTORY_LIMIT;
      imageEditorState.history = imageEditorState.history.slice(trimCount);
      imageEditorState.historyIndex = Math.max(0, imageEditorState.historyIndex - trimCount);
    }
    updateImageEditorControls();
  }
  function undoImageEdit() {
    if (imageEditorState.historyIndex <= 0) return;
    imageEditorState.historyIndex -= 1;
    restoreImageEditorSnapshot(imageEditorState.history[imageEditorState.historyIndex]);
  }
  function redoImageEdit() {
    if (imageEditorState.historyIndex >= imageEditorState.history.length - 1) return;
    imageEditorState.historyIndex += 1;
    restoreImageEditorSnapshot(imageEditorState.history[imageEditorState.historyIndex]);
  }
  function updateImageEditorControls() {
    const els43 = getEls();
    const canUndo = imageEditorState.historyIndex > 0;
    const canRedo = imageEditorState.historyIndex >= 0 && imageEditorState.historyIndex < imageEditorState.history.length - 1;
    if (els43.imageEditorUndo) els43.imageEditorUndo.disabled = !canUndo;
    if (els43.imageEditorRedo) els43.imageEditorRedo.disabled = !canRedo;
    if (els43.imageEditorStrokeValue) els43.imageEditorStrokeValue.textContent = `${imageEditorState.strokeWidth}px`;
    document.querySelectorAll("[data-image-editor-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.imageEditorTool === imageEditorState.tool);
    });
    document.querySelectorAll("[data-image-editor-color]").forEach((button) => {
      button.classList.toggle("active", button.dataset.imageEditorColor?.toLowerCase() === imageEditorState.color.toLowerCase());
    });
  }
  function updateImageEditorCropBox() {
    const els43 = getEls();
    const box = els43.imageEditorCropBox;
    const canvas = els43.imageEditorCanvas;
    const crop = imageEditorState.crop;
    if (!box || !canvas || !crop) {
      box?.classList.add("hidden");
      return;
    }
    const scaleX = canvas.clientWidth / Math.max(1, canvas.width);
    const scaleY = canvas.clientHeight / Math.max(1, canvas.height);
    box.style.left = `${crop.left * scaleX}px`;
    box.style.top = `${crop.top * scaleY}px`;
    box.style.width = `${crop.width * scaleX}px`;
    box.style.height = `${crop.height * scaleY}px`;
    box.classList.remove("hidden");
  }
  function imageEditorPoint(event) {
    const canvas = getEls().imageEditorCanvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY))
    };
  }
  function normalizedRect(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 4 || height < 4) return null;
    return { left, top, width, height };
  }
  function imageEditorPointDistance(from, to) {
    return Math.hypot(to.x - from.x, to.y - from.y);
  }
  function isImageEditorLineGesture(from, to) {
    return imageEditorPointDistance(from, to) >= 4;
  }
  function imageEditorPixelOffset(index) {
    return index * 4;
  }
  function imageEditorBucketFillColor() {
    const normalized = String(imageEditorState.color || "#ff3b30").replace("#", "").trim();
    const hex = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "ff3b30";
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      255
    ];
  }
  function imageEditorBoundaryPixelBlocks(data, index) {
    return data[imageEditorPixelOffset(index) + 3] > 0;
  }
  function imageEditorBoundaryHasPixels(data) {
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] > 0) return true;
    }
    return false;
  }
  function imageEditorPixelTouchesCanvasEdge(index, width, height) {
    const column = index % width;
    const row = Math.floor(index / width);
    return column === 0 || column === width - 1 || row === 0 || row === height - 1;
  }
  function paintBucketFillRegion(point) {
    const canvas = imageEditorState.workCanvas;
    const ctx = imageEditorContext(canvas);
    const boundaryCanvas = imageEditorState.brushBoundaryCanvas;
    const boundaryCtx = imageEditorBrushBoundaryContext();
    if (!canvas || !ctx || !boundaryCanvas || !boundaryCtx) return false;
    const width = canvas.width;
    const height = canvas.height;
    const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const boundaryData = boundaryCtx.getImageData(0, 0, width, height).data;
    if (!imageEditorBoundaryHasPixels(boundaryData)) return false;
    const startIndex = y * width + x;
    if (imageEditorBoundaryPixelBlocks(boundaryData, startIndex)) return false;
    const visited = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    const region = [];
    let stackLength = 0;
    const pushPixel = (index) => {
      if (visited[index]) return;
      visited[index] = 1;
      if (imageEditorBoundaryPixelBlocks(boundaryData, index)) return;
      stack[stackLength] = index;
      stackLength += 1;
    };
    pushPixel(startIndex);
    while (stackLength > 0) {
      stackLength -= 1;
      const index = stack[stackLength];
      if (index === void 0) break;
      if (imageEditorPixelTouchesCanvasEdge(index, width, height)) return false;
      region.push(index);
      const column = index % width;
      if (column > 0) pushPixel(index - 1);
      if (column < width - 1) pushPixel(index + 1);
      if (index >= width) pushPixel(index - width);
      if (index < width * (height - 1)) pushPixel(index + width);
    }
    if (!region.length) return false;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const fill = imageEditorBucketFillColor();
    const [red = 0, green = 0, blue = 0, alpha = 255] = fill;
    region.forEach((index) => {
      const offset = imageEditorPixelOffset(index);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = alpha;
    });
    ctx.putImageData(imageData, 0, 0);
    redrawImageEditorBrushOverlay(ctx);
    return true;
  }
  function configureImageEditorStroke(ctx, options = {}) {
    if (!ctx) return;
    ctx.strokeStyle = imageEditorState.color;
    ctx.fillStyle = imageEditorState.color;
    ctx.lineWidth = imageEditorState.strokeWidth;
    ctx.lineCap = options.lineCap || "round";
    ctx.lineJoin = options.lineJoin || "round";
    ctx.miterLimit = options.miterLimit || 10;
  }
  function drawEditorBrushBoundarySegment(from, to) {
    const ctx = imageEditorBrushBoundaryContext();
    if (!ctx) return;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = imageEditorState.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  function drawEditorBrushOverlaySegment(from, to) {
    const ctx = imageEditorBrushOverlayContext();
    if (!ctx) return;
    configureImageEditorStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  function redrawImageEditorBrushOverlay(ctx) {
    if (!ctx || !imageEditorState.brushOverlayCanvas) return;
    ctx.drawImage(imageEditorState.brushOverlayCanvas, 0, 0);
  }
  function drawEditorBrushSegment(from, to) {
    const ctx = imageEditorContext();
    if (!ctx) return;
    configureImageEditorStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    drawEditorBrushBoundarySegment(from, to);
    drawEditorBrushOverlaySegment(from, to);
  }
  function drawEditorArrowOnContext(ctx, start, end) {
    if (!ctx) return;
    configureImageEditorStroke(ctx, { lineCap: "butt", lineJoin: "miter" });
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.max(12, imageEditorState.strokeWidth * 3.2);
    const shaftEnd = {
      x: end.x - headLength * Math.cos(angle),
      y: end.y - headLength * Math.sin(angle)
    };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(shaftEnd.x, shaftEnd.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
  function previewEditorArrow(start, end) {
    renderImageEditor();
    const ctx = imageEditorVisibleContext();
    if (!ctx) return;
    drawEditorArrowOnContext(ctx, start, end);
  }
  function handleImageEditorPointerDown(event) {
    if (!imageEditorState.workCanvas) return;
    event.preventDefault();
    const point = imageEditorPoint(event);
    if (imageEditorState.tool === "fill") {
      if (paintBucketFillRegion(point)) {
        imageEditorState.hasInstructionMarks = true;
        pushImageEditorHistory();
        setImageEditorStatus("");
      } else {
        setImageEditorStatus("\u8BF7\u5148\u7528\u753B\u7B14\u5708\u51FA\u5C01\u95ED\u533A\u57DF", "error");
      }
      renderImageEditor();
      return;
    }
    getEls().imageEditorCanvas?.setPointerCapture?.(event.pointerId);
    imageEditorState.drawing = {
      pointerId: event.pointerId,
      start: point,
      last: point
    };
    if (imageEditorState.tool === "crop") {
      imageEditorState.crop = { left: point.x, top: point.y, width: 0, height: 0 };
      updateImageEditorCropBox();
    }
  }
  function handleImageEditorPointerMove(event) {
    const drawing = imageEditorState.drawing;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = imageEditorPoint(event);
    if (imageEditorState.tool === "brush") {
      drawEditorBrushSegment(drawing.last, point);
      if (imageEditorPointDistance(drawing.last, point) > 0) {
        imageEditorState.hasInstructionMarks = true;
      }
      drawing.last = point;
      renderImageEditor();
      return;
    }
    if (imageEditorState.tool === "arrow") {
      previewEditorArrow(drawing.start, point);
      return;
    }
    if (imageEditorState.tool === "crop") {
      imageEditorState.crop = normalizedRect(drawing.start, point);
      updateImageEditorCropBox();
    }
  }
  function handleImageEditorPointerUp(event) {
    const drawing = imageEditorState.drawing;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = imageEditorPoint(event);
    getEls().imageEditorCanvas?.releasePointerCapture?.(event.pointerId);
    if (imageEditorState.tool === "arrow") {
      const ctx = imageEditorContext();
      if (ctx && isImageEditorLineGesture(drawing.start, point)) {
        drawEditorArrowOnContext(ctx, drawing.start, point);
        imageEditorState.hasInstructionMarks = true;
        pushImageEditorHistory();
      }
    } else if (imageEditorState.tool === "brush") {
      pushImageEditorHistory();
    } else if (imageEditorState.tool === "crop") {
      imageEditorState.crop = normalizedRect(drawing.start, point);
    }
    imageEditorState.drawing = null;
    renderImageEditor();
  }
  function handleImageEditorPointerCancel(event) {
    const drawing = imageEditorState.drawing;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    getEls().imageEditorCanvas?.releasePointerCapture?.(event.pointerId);
    if (imageEditorState.tool === "brush") {
      pushImageEditorHistory();
    } else if (imageEditorState.tool === "crop") {
      imageEditorState.crop = null;
    }
    imageEditorState.drawing = null;
    renderImageEditor();
  }
  function imageEditorCanvasForSave() {
    const sourceCanvas = imageEditorState.workCanvas;
    if (!sourceCanvas) return null;
    const crop = imageEditorState.crop;
    if (!crop) return sourceCanvas;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(crop.width));
    output.height = Math.max(1, Math.round(crop.height));
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      sourceCanvas,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      output.width,
      output.height
    );
    return output;
  }
  function imageEditorExportBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("\u56FE\u7247\u7F16\u8F91\u4FDD\u5B58\u5931\u8D25"));
        }
      }, "image/png");
    });
  }
  function ensureImageEditorPromptHint() {
    const current = legacyMethod3("getPromptText");
    if (current.includes(IMAGE_EDITOR_PROMPT_HINT)) return;
    const next = current ? `${current}
${IMAGE_EDITOR_PROMPT_HINT}` : IMAGE_EDITOR_PROMPT_HINT;
    legacyMethod3("setPromptText", next);
    legacyMethod3("updatePromptCount");
  }
  async function saveImageEdit() {
    const state33 = getState();
    const els43 = getEls();
    const sessionId = imageEditorState.sessionId;
    const source = imageEditorState.source;
    const saveCanvas = imageEditorCanvasForSave();
    if (!source || !isEditableImageSource(source) || !saveCanvas || !state33.images.includes(source)) {
      setImageEditorStatus("\u56FE\u7247\u7F16\u8F91\u4FDD\u5B58\u5931\u8D25", "error");
      return;
    }
    if (els43.imageEditorSave) els43.imageEditorSave.disabled = true;
    try {
      const blob = await imageEditorExportBlob(saveCanvas);
      const sourceIndex = state33.images.indexOf(source);
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source || sourceIndex < 0) {
        return;
      }
      const filename = editedUploadFilename(source.originalFile?.name || source.name || source.file?.name);
      const file = new File([blob], filename, {
        type: "image/png",
        lastModified: Date.now()
      });
      const nextSource = {
        kind: "upload",
        file,
        originalFile: source.originalFile || imageEditorState.originalFile || file,
        name: filename,
        previewUrl: URL.createObjectURL(file),
        edited: true
      };
      state33.images[sourceIndex] = nextSource;
      legacyMethod3("revokeUploadPreviewUrl", source);
      legacyMethod3("syncPromptGalleryMentionsFromInputs");
      if (imageEditorState.hasInstructionMarks) ensureImageEditorPromptHint();
      legacyMethod3("renderImageStrip");
      legacyMethod3("updateRequestPreview");
      closeImageEditor();
      legacyMethod3("setStatus", "\u5DF2\u4FDD\u5B58\u7F16\u8F91\u540E\u7684\u8F93\u5165\u56FE", "ok");
    } catch (error) {
      setImageEditorStatus(error.message || "\u56FE\u7247\u7F16\u8F91\u4FDD\u5B58\u5931\u8D25", "error");
    } finally {
      if (els43.imageEditorSave) els43.imageEditorSave.disabled = false;
    }
  }
  async function openImageEditor(index) {
    const state33 = getState();
    const els43 = getEls();
    const source = state33.images[index];
    if (!source || !isEditableImageSource(source)) {
      legacyMethod3("setStatus", "\u8FD9\u5F20\u56FE\u7247\u65E0\u6CD5\u7F16\u8F91", "error");
      return;
    }
    const sessionId = nextImageEditorSession();
    imageEditorState.sourceIndex = index;
    imageEditorState.source = source;
    imageEditorState.originalFile = null;
    imageEditorState.tool = "crop";
    imageEditorState.color = els43.imageEditorColor?.value || "#ff3b30";
    imageEditorState.strokeWidth = Number(els43.imageEditorStroke?.value || 8);
    imageEditorState.hasInstructionMarks = false;
    imageEditorState.drawing = null;
    setImageEditorStatus("");
    if (els43.imageEditorSubtitle) {
      els43.imageEditorSubtitle.textContent = legacyMethod3("sourceName", source) || "\u8F93\u5165\u56FE\u7247";
    }
    els43.imageEditorModal?.classList.remove("hidden");
    try {
      const file = await imageEditorSourceFile(source);
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source) return;
      imageEditorState.originalFile = file;
      const image = await loadImageEditorImage(file);
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source) return;
      imageEditorState.image = image;
      initializeImageEditorCanvases(image);
      renderImageEditor();
    } catch {
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source) return;
      closeImageEditor();
      legacyMethod3("setStatus", "\u65E0\u6CD5\u6253\u5F00\u8FD9\u5F20\u56FE\u7247\u8FDB\u884C\u7F16\u8F91", "error");
    }
  }
  function closeImageEditor() {
    const els43 = getEls();
    nextImageEditorSession();
    els43.imageEditorModal?.classList.add("hidden");
    imageEditorState.sourceIndex = null;
    imageEditorState.source = null;
    imageEditorState.originalFile = null;
    imageEditorState.image = null;
    imageEditorState.baseCanvas = null;
    imageEditorState.workCanvas = null;
    imageEditorState.brushBoundaryCanvas = null;
    imageEditorState.brushOverlayCanvas = null;
    imageEditorState.crop = null;
    imageEditorState.hasInstructionMarks = false;
    imageEditorState.history = [];
    imageEditorState.historyIndex = -1;
    imageEditorState.drawing = null;
    setImageEditorStatus("");
    updateImageEditorControls();
  }
  function setImageEditorTool(tool) {
    if (!["brush", "arrow", "crop", "fill"].includes(tool)) return;
    imageEditorState.tool = tool;
    imageEditorState.drawing = null;
    updateImageEditorControls();
  }
  async function resetImageEdit() {
    const sessionId = imageEditorState.sessionId;
    const source = imageEditorState.source;
    const file = imageEditorState.originalFile;
    if (!file) return;
    try {
      const image = await loadImageEditorImage(file);
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source || imageEditorState.originalFile !== file) return;
      imageEditorState.image = image;
      initializeImageEditorCanvases(image);
      renderImageEditor();
      setImageEditorStatus("\u5DF2\u91CD\u7F6E\u5230\u539F\u56FE");
    } catch {
      if (sessionId !== imageEditorState.sessionId || imageEditorState.source !== source || imageEditorState.originalFile !== file) return;
      setImageEditorStatus("\u65E0\u6CD5\u91CD\u7F6E\u539F\u56FE", "error");
    }
  }
  function isImageEditorModalOpen() {
    const els43 = getEls();
    return Boolean(els43.imageEditorModal && !els43.imageEditorModal.classList.contains("hidden"));
  }
  function handleImageEditorHistoryShortcut(event) {
    if (!isImageEditorModalOpen()) return false;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redoImageEdit();
      return true;
    }
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoImageEdit();
      return true;
    }
    if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoImageEdit();
      return true;
    }
    return false;
  }
  function bindImageEditorEvents() {
    const els43 = getEls();
    els43.imageEditorClose?.addEventListener("click", closeImageEditor);
    els43.imageEditorCancel?.addEventListener("click", closeImageEditor);
    els43.imageEditorModal?.addEventListener("click", (event) => {
      if (event.target === els43.imageEditorModal) closeImageEditor();
    });
    document.querySelectorAll("[data-image-editor-tool]").forEach((button) => {
      button.addEventListener("click", () => setImageEditorTool(button.dataset.imageEditorTool));
    });
    document.querySelectorAll("[data-image-editor-color]").forEach((button) => {
      button.addEventListener("click", () => {
        imageEditorState.color = button.dataset.imageEditorColor || imageEditorState.color;
        if (els43.imageEditorColor) els43.imageEditorColor.value = imageEditorState.color;
        updateImageEditorControls();
      });
    });
    els43.imageEditorColor?.addEventListener("input", () => {
      imageEditorState.color = els43.imageEditorColor.value || imageEditorState.color;
      updateImageEditorControls();
    });
    els43.imageEditorStroke?.addEventListener("input", () => {
      imageEditorState.strokeWidth = Number(els43.imageEditorStroke.value || 8);
      updateImageEditorControls();
    });
    els43.imageEditorUndo?.addEventListener("click", undoImageEdit);
    els43.imageEditorRedo?.addEventListener("click", redoImageEdit);
    els43.imageEditorReset?.addEventListener("click", resetImageEdit);
    els43.imageEditorSave?.addEventListener("click", saveImageEdit);
    els43.imageEditorCanvas?.addEventListener("pointerdown", handleImageEditorPointerDown);
    els43.imageEditorCanvas?.addEventListener("pointermove", handleImageEditorPointerMove);
    els43.imageEditorCanvas?.addEventListener("pointerup", handleImageEditorPointerUp);
    els43.imageEditorCanvas?.addEventListener("pointercancel", handleImageEditorPointerCancel);
  }
  function initImageEditorFeature() {
    if (imageEditorFeatureInitialized) return;
    imageEditorFeatureInitialized = true;
    bindImageEditorEvents();
    Object.assign(getLegacyBridge().methods, {
      openImageEditor,
      closeImageEditor,
      isEditableImageSource,
      handleImageEditorHistoryShortcut,
      isImageEditorModalOpen
    });
  }

  // codex_image/webui/frontend/src/image-strip.ts
  var imageStripFeatureInitialized = false;
  function legacyMethod4(name, ...args) {
    return getLegacyBridge().methods[name]?.(...args);
  }
  function addImages(event) {
    legacyMethod4("addImageFiles", event.target.files || []);
    event.target.value = "";
  }
  function clearImages() {
    const state33 = getState();
    legacyMethod4("revokeUploadPreviewUrls", state33.images);
    state33.images = [];
    legacyMethod4("syncPromptGalleryMentionsFromInputs");
    legacyMethod4("setMode", "generate");
    renderImageStrip();
    legacyMethod4("updateRequestPreview");
  }
  function createThumbAddIcon() {
    const icon = document.createElement("span");
    icon.className = "thumb-add-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-linecap="round"/></svg>';
    return icon;
  }
  function imageStripNeedsCompactGrid() {
    const state33 = getState();
    const els43 = getEls();
    if (!els43.imageUploaderGrid || !state33.images.length) return false;
    const availableWidth = Math.max(0, els43.imageUploaderGrid.clientWidth - 24);
    if (!availableWidth) return false;
    const thumbCount = state33.images.length;
    const fullSizeThumbsWidth = thumbCount * 116 + Math.max(0, thumbCount - 1) * 10;
    const fullSizeUploadWidth = 118;
    const fullSizeUploadGap = 10;
    return fullSizeThumbsWidth + fullSizeUploadGap + fullSizeUploadWidth > availableWidth;
  }
  function updateImageStripDensity() {
    const state33 = getState();
    const els43 = getEls();
    const hasImages = Boolean(state33.images.length);
    const compactGrid = imageStripNeedsCompactGrid();
    els43.imageUploaderGrid?.classList.toggle("has-images", hasImages);
    els43.imageUploaderGrid?.classList.toggle("compact-grid", compactGrid);
  }
  function wheelDeltaInPixels(event) {
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return dominantDelta * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const els43 = getEls();
      return dominantDelta * Math.max(1, els43.imageStrip?.clientWidth || 1);
    }
    return dominantDelta;
  }
  function handleImageStripWheel(event) {
    const els43 = getEls();
    const scrollTarget = els43.imageUploaderGrid?.classList.contains("compact-grid") ? els43.imageStrip : els43.imageThumbList;
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
    const state33 = getState();
    const els43 = getEls();
    const hasImages = Boolean(state33.images.length);
    const thumbList = els43.imageThumbList || els43.imageStrip;
    updateImageStripDensity();
    if (!thumbList) return;
    if (!hasImages) {
      thumbList.innerHTML = "";
      legacyMethod4("updateCustomRatioReferenceButtonState");
      return;
    }
    thumbList.innerHTML = "";
    state33.images.forEach((source, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = `thumb ${source.kind === "gallery" ? "gallery-thumb" : source.kind === "asset" ? "asset-thumb" : "upload-thumb"}${source.missing ? " missing-thumb" : ""}`;
      const image = document.createElement("img");
      const previewUrl = legacyMethod4("sourcePreviewUrl", source);
      if (previewUrl) {
        image.src = previewUrl;
      }
      image.alt = legacyMethod4("sourceName", source);
      wrapper.title = source.missing ? source.kind === "asset" ? "\u6700\u8FD1\u4E0A\u4F20\u5DF2\u5220\u9664" : "\u56FE\u5E93\u56FE\u7247\u5DF2\u5220\u9664" : legacyMethod4("sourceName", source);
      if (legacyMethod4("isEditableImageSource", source)) {
        wrapper.classList.add("editable-thumb");
        wrapper.tabIndex = 0;
        wrapper.setAttribute("role", "button");
        wrapper.setAttribute("aria-label", `\u7F16\u8F91${legacyMethod4("sourceName", source)}`);
        wrapper.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          legacyMethod4("openImageEditor", index);
        });
        wrapper.addEventListener("keydown", (event) => {
          if (event.target?.closest("button")) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            legacyMethod4("openImageEditor", index);
          }
        });
      }
      const badge = document.createElement("span");
      badge.className = "thumb-badge";
      badge.textContent = source.kind === "gallery" ? legacyMethod4("categoryLabel", source.category) : source.kind === "asset" ? "\u6700\u8FD1" : "\u4E0A\u4F20";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "thumb-remove";
      remove.textContent = "\xD7";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        const removedSource = state33.images[index];
        legacyMethod4("revokeUploadPreviewUrl", removedSource, { ignoredCurrentSources: /* @__PURE__ */ new Set([removedSource]) });
        state33.images.splice(index, 1);
        legacyMethod4("syncPromptGalleryMentionsFromInputs");
        if (!state33.images.length) {
          legacyMethod4("setMode", "generate");
        }
        renderImageStrip();
        legacyMethod4("updateRequestPreview");
      });
      wrapper.append(image, badge, remove);
      if (legacyMethod4("canAddSourceToGallery", source)) {
        const addToGallery = document.createElement("button");
        addToGallery.type = "button";
        addToGallery.className = "add-upload-to-gallery";
        addToGallery.setAttribute("aria-label", "\u52A0\u5165\u56FE\u5E93");
        addToGallery.title = "\u52A0\u5165\u56FE\u5E93";
        addToGallery.append(createThumbAddIcon(), document.createTextNode("\u56FE\u5E93"));
        addToGallery.addEventListener("click", (event) => {
          event.stopPropagation();
          legacyMethod4("openAddToGallery", index);
        });
        wrapper.append(addToGallery);
      }
      if (source.edited) {
        const editedBadge = document.createElement("span");
        editedBadge.className = "thumb-edited-badge";
        editedBadge.textContent = "\u5DF2\u7F16\u8F91";
        wrapper.append(editedBadge);
      }
      thumbList.append(wrapper);
    });
    legacyMethod4("updateCustomRatioReferenceButtonState");
  }
  function bindImageStripEvents() {
    const els43 = getEls();
    els43.imageInput?.addEventListener("change", addImages);
    els43.clearImagesButton?.addEventListener("click", clearImages);
    els43.imageStrip?.addEventListener("wheel", handleImageStripWheel, { passive: false });
    window.addEventListener("resize", updateImageStripDensity);
  }
  function initImageStripFeature() {
    if (imageStripFeatureInitialized) return;
    imageStripFeatureInitialized = true;
    bindImageStripEvents();
    Object.assign(getLegacyBridge().methods, {
      addImages,
      clearImages,
      updateImageStripDensity,
      handleImageStripWheel,
      renderImageStrip
    });
  }

  // codex_image/webui/frontend/src/gallery-drag-preview.ts
  function createGalleryDragPreview(options) {
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
  function createGalleryElementDragPreview(sourceElement) {
    const preview = sourceElement.cloneNode(true);
    const rect = sourceElement.getBoundingClientRect();
    preview.classList.add("gallery-drag-preview-clone");
    preview.setAttribute("aria-hidden", "true");
    preview.removeAttribute("id");
    preview.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    preview.querySelectorAll("[draggable]").forEach((node) => node.setAttribute("draggable", "false"));
    preview.querySelectorAll("button, input, select, textarea").forEach((node) => {
      node.setAttribute("tabindex", "-1");
    });
    preview.style.width = `${Math.ceil(rect.width)}px`;
    preview.style.height = `${Math.ceil(rect.height)}px`;
    document.body.append(preview);
    return preview;
  }
  function clampDragImageOffset(value, size) {
    if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
    return Math.max(0, Math.min(Math.round(value), Math.round(size)));
  }
  function setGalleryDragPreview(event, options) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || typeof dataTransfer.setDragImage !== "function") return;
    const sourceElement = options.sourceElement || null;
    const preview = sourceElement ? createGalleryElementDragPreview(sourceElement) : createGalleryDragPreview(options);
    const rect = preview.getBoundingClientRect();
    const sourceRect = sourceElement?.getBoundingClientRect();
    const offsetX = sourceRect ? clampDragImageOffset(event.clientX - sourceRect.left, sourceRect.width) : 22;
    const offsetY = sourceRect ? clampDragImageOffset(event.clientY - sourceRect.top, sourceRect.height) : Math.max(18, Math.round(rect.height / 2));
    dataTransfer.setDragImage(preview, offsetX, offsetY);
    window.setTimeout(() => preview.remove(), 0);
  }

  // codex_image/webui/frontend/src/gallery-categories.ts
  var DEFAULT_GALLERY_CATEGORY_LABELS = {
    portrait: "\u4EBA\u50CF",
    character: "\u89D2\u8272",
    product: "\u4EA7\u54C1"
  };
  var DEFAULT_GALLERY_CATEGORIES2 = [
    { id: "portrait", name: "\u4EBA\u50CF", prompt_role: "\u4EBA\u50CF\u53C2\u8003", order: 10, locked: false },
    { id: "character", name: "\u89D2\u8272", prompt_role: "\u89D2\u8272\u53C2\u8003", order: 20, locked: false },
    { id: "product", name: "\u4EA7\u54C1", prompt_role: "\u4EA7\u54C1\u53C2\u8003", order: 30, locked: false }
  ];
  var bridge = getLegacyBridge();
  var state2 = bridge.state;
  var els2 = bridge.els;
  var galleryCategoriesFeatureInitialized = false;
  var galleryCategoriesEventsBound = false;
  var galleryCategoryManagerExpanded = false;
  var draggedGalleryCategoryId = null;
  var galleryCategoryDropTargetId = null;
  var galleryCategoryDropPlacement = "after";
  var galleryCategoryOriginalOrder = [];
  function legacyMethod5(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml3(value) {
    return legacyMethod5("escapeHtml", value);
  }
  function setStatus3(message, type) {
    legacyMethod5("setStatus", message, type);
  }
  function openConfirmPopover(anchor, options) {
    legacyMethod5("openConfirmPopover", anchor, options);
  }
  function closeConfirmPopover() {
    legacyMethod5("closeConfirmPopover");
  }
  function closeGalleryEditPopover() {
    legacyMethod5("closeGalleryEditPopover");
  }
  function renderQuickGalleryDock() {
    legacyMethod5("renderQuickGalleryDock");
  }
  function renderGalleryGrid(options) {
    legacyMethod5("renderGalleryGrid", options);
  }
  function renderImageStrip2() {
    legacyMethod5("renderImageStrip");
  }
  function updateRequestPreview() {
    legacyMethod5("updateRequestPreview");
  }
  function refreshGallery() {
    return legacyMethod5("refreshGallery");
  }
  function cssEscape2(value) {
    const text = String(value || "");
    if (window.CSS?.escape) return window.CSS.escape(text);
    return text.replace(/["\\]/g, "\\$&");
  }
  function defaultGalleryCategories2() {
    return DEFAULT_GALLERY_CATEGORIES2.map((category) => ({ ...category }));
  }
  function normalizeGalleryCategory(category) {
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
      locked: Boolean(category?.locked)
    };
  }
  function normalizeGalleryCategories(categories) {
    const source = Array.isArray(categories) && categories.length ? categories : defaultGalleryCategories2();
    const seen = /* @__PURE__ */ new Set();
    return source.map(normalizeGalleryCategory).filter((category) => {
      if (!category || seen.has(category.id)) return false;
      seen.add(category.id);
      return true;
    }).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }));
  }
  function handleQuickGalleryCategoryEvent(event) {
    const button = event.target.closest?.("[data-quick-gallery-category]");
    if (!button || !els2.quickGalleryRail?.contains(button)) return;
    setQuickGalleryCategory(button.dataset.quickGalleryCategory);
  }
  function ensureActiveGalleryCategory() {
    if (findGalleryCategory(state2.activeGalleryCategory)) return;
    state2.activeGalleryCategory = state2.galleryCategories[0]?.id || "portrait";
  }
  function renderGalleryCategoryControls() {
    ensureActiveGalleryCategory();
    const categories = normalizeGalleryCategories(state2.galleryCategories);
    if (els2.quickGalleryRail) {
      els2.quickGalleryRail.innerHTML = categories.map((category) => `
      <button class="quick-gallery-category${category.id === state2.activeGalleryCategory ? " active" : ""}" data-quick-gallery-category="${escapeHtml3(category.id)}" type="button">${escapeHtml3(category.name)}</button>
    `).join("");
    }
    if (els2.galleryCategoryInput) {
      const currentValue = els2.galleryCategoryInput.value || state2.activeGalleryCategory;
      els2.galleryCategoryInput.innerHTML = categories.map((category) => `
      <option value="${escapeHtml3(category.id)}">${escapeHtml3(category.name)}</option>
    `).join("");
      els2.galleryCategoryInput.value = findGalleryCategory(currentValue) ? currentValue : state2.activeGalleryCategory;
    }
    renderGalleryDrawerCategoryTabs();
    renderGalleryCategoryManager();
    syncGalleryCategoryManagerVisibility();
  }
  function renderGalleryDrawerCategoryTabs() {
    if (!els2.galleryDrawerCategoryTabs) return;
    const categories = normalizeGalleryCategories(state2.galleryCategories);
    els2.galleryDrawerCategoryTabs.innerHTML = categories.map((category) => `
    <button
      class="quick-gallery-category${category.id === state2.activeGalleryCategory ? " active" : ""}"
      data-gallery-drawer-category="${escapeHtml3(category.id)}"
      type="button"
    >
      ${escapeHtml3(category.name)}
    </button>
  `).join("");
  }
  function renderGalleryCategoryManager() {
    if (!els2.galleryCategoryList) return;
    const categories = normalizeGalleryCategories(state2.galleryCategories);
    els2.galleryCategoryList.innerHTML = categories.map((category) => `
    <div
      class="gallery-category-row${category.id === state2.activeGalleryCategory ? " is-current" : ""}"
      data-gallery-category-row="${escapeHtml3(category.id)}"
      ${category.id === state2.activeGalleryCategory ? 'aria-current="true"' : ""}
    >
      <div class="gallery-category-row-toolbar">
        <button
          class="ghost-button gallery-drag-handle gallery-category-drag-handle"
          type="button"
          draggable="true"
          data-gallery-category-id="${escapeHtml3(category.id)}"
          data-gallery-category-drag-handle
          aria-label="\u62D6\u62FD\u6392\u5E8F\u5206\u7C7B ${escapeHtml3(category.name)}"
          title="\u62D6\u62FD\u6392\u5E8F"
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
      <input class="control" type="text" maxlength="32" value="${escapeHtml3(category.name)}" data-gallery-category-name="${escapeHtml3(category.id)}" aria-label="\u5206\u7C7B\u540D\u79F0">
      <input class="control" type="text" maxlength="48" value="${escapeHtml3(category.prompt_role)}" data-gallery-category-prompt-role="${escapeHtml3(category.id)}" aria-label="\u63D0\u793A\u8BCD\u7528\u9014">
      <div class="gallery-category-row-actions">
        <button class="ghost-button text-sm" type="button" data-gallery-category-save="${escapeHtml3(category.id)}">\u4FDD\u5B58</button>
        <button class="ghost-button text-sm danger-button" type="button" data-gallery-category-delete="${escapeHtml3(category.id)}" ${categories.length <= 1 ? "disabled" : ""}>\u5220\u9664</button>
      </div>
    </div>
  `).join("");
  }
  function handleGalleryDrawerCategoryTabClick(event) {
    const button = event.target.closest?.("[data-gallery-drawer-category]");
    if (!button || !els2.galleryDrawerCategoryTabs?.contains(button)) return;
    setGalleryDrawerCategory(button.dataset.galleryDrawerCategory);
  }
  function handleGalleryCategoryListClick(event) {
    const button = event.target.closest?.("[data-gallery-category-save],[data-gallery-category-delete]");
    if (!button || !els2.galleryCategoryList?.contains(button) || button.disabled) return;
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
    els2.galleryCategoryManagePanel?.classList.toggle("hidden", !galleryCategoryManagerExpanded);
    els2.galleryCategoryManageToggle?.setAttribute("aria-expanded", galleryCategoryManagerExpanded ? "true" : "false");
    els2.galleryCategoryManageToggle?.classList.toggle("active", galleryCategoryManagerExpanded);
  }
  async function refreshGalleryCategories() {
    try {
      const response = await fetch("/api/gallery/categories");
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u5206\u7C7B\u8BFB\u53D6\u5931\u8D25");
      state2.galleryCategories = normalizeGalleryCategories(data.categories);
      ensureActiveGalleryCategory();
      renderGalleryCategoryControls();
      renderQuickGalleryDock();
      renderGalleryGrid();
      renderImageStrip2();
      updateRequestPreview();
    } catch (error) {
      setStatus3(error.message || "\u5206\u7C7B\u8BFB\u53D6\u5931\u8D25", "error");
    }
  }
  async function createGalleryCategory() {
    const name = els2.newGalleryCategoryName?.value.trim() || "";
    const promptRole = els2.newGalleryCategoryPromptRole?.value.trim() || name;
    if (!name) {
      setStatus3("\u8BF7\u8F93\u5165\u5206\u7C7B\u540D\u79F0", "error");
      return;
    }
    try {
      const response = await fetch("/api/gallery/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt_role: promptRole })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u65B0\u589E\u5206\u7C7B\u5931\u8D25");
      if (els2.newGalleryCategoryName) els2.newGalleryCategoryName.value = "";
      if (els2.newGalleryCategoryPromptRole) els2.newGalleryCategoryPromptRole.value = "";
      state2.activeGalleryCategory = data.category?.id || state2.activeGalleryCategory;
      await refreshGalleryCategories();
      setStatus3("\u5206\u7C7B\u5DF2\u65B0\u589E", "ok");
    } catch (error) {
      setStatus3(error.message || "\u65B0\u589E\u5206\u7C7B\u5931\u8D25", "error");
    }
  }
  async function updateGalleryCategory(categoryId) {
    const row = els2.galleryCategoryList?.querySelector(`[data-gallery-category-row="${cssEscape2(categoryId)}"]`);
    if (!row) return;
    const name = row.querySelector("[data-gallery-category-name]")?.value.trim();
    const promptRole = row.querySelector("[data-gallery-category-prompt-role]")?.value.trim() || name;
    const category = findGalleryCategory(categoryId);
    if (!name) {
      setStatus3("\u8BF7\u8F93\u5165\u5206\u7C7B\u540D\u79F0", "error");
      return;
    }
    try {
      const response = await fetch(`/api/gallery/categories/${encodeURIComponent(categoryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt_role: promptRole, order: category?.order })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u4FDD\u5B58\u5206\u7C7B\u5931\u8D25");
      await refreshGalleryCategories();
      setStatus3("\u5206\u7C7B\u5DF2\u4FDD\u5B58", "ok");
    } catch (error) {
      setStatus3(error.message || "\u4FDD\u5B58\u5206\u7C7B\u5931\u8D25", "error");
    }
  }
  function deleteGalleryCategory(button, categoryId) {
    const category = findGalleryCategory(categoryId);
    if (!category || state2.galleryCategories.length <= 1) return;
    const moveTo = state2.galleryCategories.find((candidate) => candidate.id !== categoryId)?.id;
    const target = findGalleryCategory(moveTo);
    openConfirmPopover(button, {
      title: "\u5220\u9664\u56FE\u5E93\u5206\u7C7B\uFF1F",
      message: "\u5206\u7C7B\u4E0B\u7684\u56FE\u7247\u4F1A\u79FB\u52A8\u5230\u5176\u4ED6\u5206\u7C7B\uFF0C\u56FE\u5E93\u56FE\u7247\u4E0D\u4F1A\u88AB\u5220\u9664\u3002",
      detail: target ? `${category.name} -> ${target.name}` : category.name,
      confirmText: "\u5220\u9664\u5206\u7C7B",
      onConfirm: async () => {
        await performDeleteGalleryCategory(categoryId, moveTo, category.name);
      }
    });
  }
  async function performDeleteGalleryCategory(categoryId, moveTo, categoryName) {
    try {
      const response = await fetch(`/api/gallery/categories/${encodeURIComponent(categoryId)}?move_to=${encodeURIComponent(moveTo)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u5220\u9664\u5206\u7C7B\u5931\u8D25");
      if (state2.activeGalleryCategory === categoryId) state2.activeGalleryCategory = moveTo;
      await refreshGallery();
      setStatus3(`\u5206\u7C7B\u300C${categoryName}\u300D\u5DF2\u5220\u9664\uFF0C\u56FE\u7247\u5DF2\u8FC1\u79FB`, "ok");
    } catch (error) {
      setStatus3(error.message || "\u5220\u9664\u5206\u7C7B\u5931\u8D25", "error");
    }
  }
  function setQuickGalleryCategory(category) {
    if (!findGalleryCategory(category)) return;
    state2.activeGalleryCategory = category;
    state2.hoveredGalleryItemId = null;
    state2.quickGalleryFocusItemId = null;
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    if (els2.galleryDrawer?.classList.contains("open")) renderGalleryGrid({ animateHeight: true });
  }
  function setGalleryDrawerCategory(category) {
    if (!findGalleryCategory(category)) return;
    state2.activeGalleryCategory = category;
    state2.hoveredGalleryItemId = null;
    state2.quickGalleryFocusItemId = null;
    closeGalleryEditPopover();
    closeConfirmPopover();
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    renderGalleryGrid({ animateHeight: true });
  }
  function findGalleryCategory(categoryId) {
    return state2.galleryCategories.find((category) => category.id === categoryId);
  }
  function categoryRow(categoryId) {
    return els2.galleryCategoryList?.querySelector?.(`[data-gallery-category-row="${cssEscape2(categoryId)}"]`) || null;
  }
  function clearGalleryCategoryDragState() {
    const originalOrder = galleryCategoryOriginalOrder.slice();
    const shouldRestoreOriginalOrder = Boolean(draggedGalleryCategoryId && originalOrder.length);
    if (shouldRestoreOriginalOrder) restoreGalleryCategoryDomOrder(originalOrder);
    draggedGalleryCategoryId = null;
    galleryCategoryDropTargetId = null;
    galleryCategoryDropPlacement = "after";
    galleryCategoryOriginalOrder = [];
    els2.galleryCategoryList?.classList.remove("is-drag-sorting");
    els2.galleryCategoryList?.querySelectorAll?.(".gallery-category-row").forEach((row) => {
      row.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
    });
  }
  function finishGalleryCategoryDrag() {
    draggedGalleryCategoryId = null;
    galleryCategoryDropTargetId = null;
    galleryCategoryDropPlacement = "after";
    galleryCategoryOriginalOrder = [];
    els2.galleryCategoryList?.classList.remove("is-drag-sorting");
    els2.galleryCategoryList?.querySelectorAll?.(".gallery-category-row").forEach((row) => {
      row.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
    });
  }
  function applyGalleryCategoryOrder(categoryIds) {
    const orderMap = new Map(categoryIds.map((categoryId, index) => [categoryId, (index + 1) * 10]));
    state2.galleryCategories = normalizeGalleryCategories(
      state2.galleryCategories.map((category) => orderMap.has(category.id) ? { ...category, order: orderMap.get(category.id) } : category)
    );
    renderGalleryCategoryControls();
    renderQuickGalleryDock();
    renderGalleryGrid();
  }
  function categoryDomOrder() {
    return Array.from(els2.galleryCategoryList?.querySelectorAll("[data-gallery-category-row]") || []).map((row) => String(row.dataset.galleryCategoryRow || "")).filter(Boolean);
  }
  function sameGalleryCategoryOrder(left, right) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
  }
  function restoreGalleryCategoryDomOrder(categoryIds) {
    if (!els2.galleryCategoryList) return;
    const rows = new Map(
      Array.from(els2.galleryCategoryList.querySelectorAll("[data-gallery-category-row]")).map((row) => [String(row.dataset.galleryCategoryRow || ""), row])
    );
    categoryIds.forEach((categoryId) => {
      const row = rows.get(categoryId);
      if (row) els2.galleryCategoryList?.append(row);
    });
  }
  function moveGalleryCategoryDragPlaceholder(targetRow, placement) {
    if (!draggedGalleryCategoryId || !els2.galleryCategoryList) return;
    const draggedRow = categoryRow(draggedGalleryCategoryId);
    if (!draggedRow || draggedRow === targetRow) return;
    if (placement === "before") {
      els2.galleryCategoryList.insertBefore(draggedRow, targetRow);
      return;
    }
    els2.galleryCategoryList.insertBefore(draggedRow, targetRow.nextSibling);
  }
  async function persistGalleryCategoryOrder(categoryIds) {
    try {
      const response = await fetch("/api/gallery/categories/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: categoryIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u66F4\u65B0\u5206\u7C7B\u987A\u5E8F\u5931\u8D25");
      state2.galleryCategories = normalizeGalleryCategories(data.categories);
      renderGalleryCategoryControls();
      renderQuickGalleryDock();
      renderGalleryGrid();
      setStatus3("\u5206\u7C7B\u987A\u5E8F\u5DF2\u66F4\u65B0", "ok");
    } catch (error) {
      await refreshGalleryCategories();
      setStatus3(error.message || "\u66F4\u65B0\u5206\u7C7B\u987A\u5E8F\u5931\u8D25", "error");
    }
  }
  function handleGalleryCategoryDragStart(event) {
    const handle = event.target?.closest?.("[data-gallery-category-drag-handle]");
    const categoryId = String(handle?.dataset.galleryCategoryId || "");
    if (!handle || !categoryId || !els2.galleryCategoryList?.contains(handle)) return;
    const category = findGalleryCategory(categoryId);
    draggedGalleryCategoryId = categoryId;
    galleryCategoryDropTargetId = null;
    galleryCategoryDropPlacement = "after";
    galleryCategoryOriginalOrder = normalizeGalleryCategories(state2.galleryCategories).map((galleryCategory) => galleryCategory.id);
    event.dataTransfer?.setData("text/plain", categoryId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setGalleryDragPreview(event, {
      type: "category",
      title: category?.name || categoryId,
      subtitle: category?.prompt_role || "\u56FE\u5E93\u5206\u7C7B",
      sourceElement: categoryRow(categoryId)
    });
    window.requestAnimationFrame(() => {
      categoryRow(categoryId)?.classList.add("is-dragging");
      els2.galleryCategoryList?.classList.add("is-drag-sorting");
    });
  }
  function handleGalleryCategoryDragOver(event) {
    if (!draggedGalleryCategoryId || !els2.galleryCategoryList) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const targetRow = event.target?.closest?.("[data-gallery-category-row]");
    if (!targetRow || !els2.galleryCategoryList.contains(targetRow)) return;
    const targetId = String(targetRow.dataset.galleryCategoryRow || "");
    if (!targetId || targetId === draggedGalleryCategoryId) return;
    const rect = targetRow.getBoundingClientRect();
    const placement = event.clientY - rect.top < rect.height / 2 ? "before" : "after";
    if (galleryCategoryDropTargetId === targetId && galleryCategoryDropPlacement === placement) return;
    galleryCategoryDropTargetId = targetId;
    galleryCategoryDropPlacement = placement;
    moveGalleryCategoryDragPlaceholder(targetRow, placement);
    els2.galleryCategoryList.querySelectorAll(".gallery-category-row").forEach((row) => {
      row.classList.toggle("drop-target", row === targetRow);
      row.classList.toggle("drop-before", row === targetRow && placement === "before");
      row.classList.toggle("drop-after", row === targetRow && placement === "after");
    });
  }
  function handleGalleryCategoryDrop(event) {
    if (!draggedGalleryCategoryId) {
      finishGalleryCategoryDrag();
      return;
    }
    const draggedId = draggedGalleryCategoryId;
    event.preventDefault();
    const originalOrder = galleryCategoryOriginalOrder.length ? galleryCategoryOriginalOrder.slice() : normalizeGalleryCategories(state2.galleryCategories).map((category) => category.id);
    const reorderedIds = categoryDomOrder();
    finishGalleryCategoryDrag();
    if (!reorderedIds.includes(draggedId) || sameGalleryCategoryOrder(originalOrder, reorderedIds)) return;
    applyGalleryCategoryOrder(reorderedIds);
    void persistGalleryCategoryOrder(reorderedIds);
  }
  function handleGalleryCategoryDragEnd() {
    clearGalleryCategoryDragState();
  }
  function categoryLabel(category) {
    return findGalleryCategory(category)?.name || DEFAULT_GALLERY_CATEGORY_LABELS[category] || category || "\u672A\u5206\u7C7B";
  }
  function categoryPromptRole(category) {
    const galleryCategory = findGalleryCategory(category);
    return galleryCategory?.prompt_role || galleryCategory?.name || DEFAULT_GALLERY_CATEGORY_LABELS[category] || "\u53C2\u8003\u56FE";
  }
  function bindGalleryCategoryEvents() {
    if (galleryCategoriesEventsBound) return;
    galleryCategoriesEventsBound = true;
    els2.galleryDrawerCategoryTabs?.addEventListener("click", handleGalleryDrawerCategoryTabClick);
    els2.galleryCategoryManageToggle?.addEventListener("click", toggleGalleryCategoryManager);
    els2.galleryCategoryList?.addEventListener("click", handleGalleryCategoryListClick);
    els2.galleryCategoryList?.addEventListener("dragstart", handleGalleryCategoryDragStart);
    els2.galleryCategoryList?.addEventListener("dragover", handleGalleryCategoryDragOver);
    els2.galleryCategoryList?.addEventListener("drop", handleGalleryCategoryDrop);
    els2.galleryCategoryList?.addEventListener("dragend", handleGalleryCategoryDragEnd);
    els2.galleryCategoryList?.addEventListener("dragleave", (event) => {
      if (!draggedGalleryCategoryId) return;
      const related = event.relatedTarget;
      if (related && els2.galleryCategoryList?.contains(related)) return;
      els2.galleryCategoryList?.querySelectorAll(".gallery-category-row").forEach((row) => {
        row.classList.remove("drop-target", "drop-before", "drop-after");
      });
      galleryCategoryDropTargetId = null;
    });
  }
  function initGalleryCategoriesFeature() {
    if (galleryCategoriesFeatureInitialized) return;
    galleryCategoriesFeatureInitialized = true;
    bindGalleryCategoryEvents();
    Object.assign(getLegacyBridge().methods, {
      defaultGalleryCategories: defaultGalleryCategories2,
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
      handleGalleryCategoryDragEnd
    });
  }

  // codex_image/webui/frontend/src/recent-assets.ts
  var bridge2 = getLegacyBridge();
  var state3 = bridge2.state;
  var els3 = bridge2.els;
  var recentAssetsFeatureInitialized = false;
  function legacyMethod6(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml4(value) {
    return legacyMethod6("escapeHtml", value);
  }
  function setStatus4(message, type) {
    legacyMethod6("setStatus", message, type);
  }
  function openConfirmPopover2(anchor, options) {
    legacyMethod6("openConfirmPopover", anchor, options);
  }
  function setMode(mode) {
    legacyMethod6("setMode", mode);
  }
  function addReferenceAssetInput2(item) {
    legacyMethod6("addReferenceAssetInput", item);
  }
  function renderImageStrip3() {
    legacyMethod6("renderImageStrip");
  }
  function updateRequestPreview2() {
    legacyMethod6("updateRequestPreview");
  }
  async function refreshRecentAssets() {
    if (!els3.recentAssetList) return;
    try {
      const response = await fetch("/api/reference-assets/recent?limit=50");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "\u6700\u8FD1\u4E0A\u4F20\u8BFB\u53D6\u5931\u8D25");
      }
      state3.recentAssets = Array.isArray(data.items) ? data.items : [];
      renderRecentAssets();
    } catch {
      state3.recentAssets = [];
      renderRecentAssets();
    }
  }
  function renderRecentAssets() {
    if (!els3.recentAssetDock || !els3.recentAssetList) return;
    const items = state3.recentAssets.filter((item) => item?.id && item?.image_url);
    els3.recentAssetDock.classList.toggle("hidden", !items.length);
    els3.recentAssetList.innerHTML = items.map((item) => `
    <div class="recent-asset-button" title="${escapeHtml4(item.filename || "\u6700\u8FD1\u4E0A\u4F20")}">
      <button class="recent-asset-use" type="button" data-reference-asset-id="${escapeHtml4(item.id)}" aria-label="\u4F7F\u7528${escapeHtml4(item.filename || "\u6700\u8FD1\u4E0A\u4F20")}">
        <img src="${escapeHtml4(item.image_url)}" alt="${escapeHtml4(item.filename || "\u6700\u8FD1\u4E0A\u4F20")}">
        <span>${escapeHtml4(item.filename || "\u6700\u8FD1\u4E0A\u4F20")}</span>
      </button>
      <button class="recent-asset-delete" type="button" data-reference-asset-delete="${escapeHtml4(item.id)}" aria-label="\u5220\u9664${escapeHtml4(item.filename || "\u6700\u8FD1\u4E0A\u4F20")}">\xD7</button>
    </div>
  `).join("");
    els3.recentAssetList.querySelectorAll("[data-reference-asset-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state3.recentAssets.find((candidate) => candidate.id === button.dataset.referenceAssetId);
        addReferenceAssetInput2(item);
      });
    });
    els3.recentAssetList.querySelectorAll("[data-reference-asset-delete]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = state3.recentAssets.find((candidate) => candidate.id === button.dataset.referenceAssetDelete);
        if (!item) return;
        openConfirmPopover2(button, {
          title: "\u5220\u9664\u6700\u8FD1\u4E0A\u4F20\uFF1F",
          message: "\u4F1A\u4ECE\u300C\u6700\u8FD1\u4E0A\u4F20\u300D\u4E2D\u5220\u9664\u8FD9\u5F20\u56FE\u7247\u3002\u5982\u679C\u5B83\u5DF2\u88AB\u6DFB\u52A0\u5230\u5F53\u524D\u56FE\u50CF\u8F93\u5165\uFF0C\u4F1A\u4ECE\u5F53\u524D\u8F93\u5165\u4E2D\u79FB\u9664\uFF1B\u5386\u53F2\u4EFB\u52A1\u91CC\u5F15\u7528\u8FD9\u5F20\u6700\u8FD1\u4E0A\u4F20\u56FE\u7684\u8F93\u5165\u9884\u89C8\u4E5F\u4F1A\u5931\u6548\u3002\u4E0D\u4F1A\u5F71\u54CD\u516C\u7528\u56FE\u5E93\u3002",
          detail: item.filename || "\u6700\u8FD1\u4E0A\u4F20",
          confirmText: "\u5220\u9664",
          onConfirm: () => deleteRecentAsset(item.id)
        });
      });
    });
  }
  function wheelDeltaInPixels2(event) {
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return dominantDelta * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return dominantDelta * Math.max(1, els3.recentAssetList?.clientWidth || 1);
    }
    return dominantDelta;
  }
  function handleRecentAssetWheel(event) {
    const list = els3.recentAssetList;
    if (!list) return;
    const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
    if (!maxScrollLeft) return;
    const wheelDelta = wheelDeltaInPixels2(event);
    if (!wheelDelta) return;
    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, list.scrollLeft + wheelDelta));
    if (nextScrollLeft === list.scrollLeft) return;
    event.preventDefault();
    list.scrollLeft = nextScrollLeft;
  }
  async function deleteRecentAsset(assetId) {
    if (!assetId) return;
    try {
      const response = await fetch(`/api/reference-assets/${encodeURIComponent(assetId)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "\u6700\u8FD1\u4E0A\u4F20\u5220\u9664\u5931\u8D25");
      }
      state3.recentAssets = state3.recentAssets.filter((item) => item.id !== assetId);
      state3.images = state3.images.filter((source) => !(source.kind === "asset" && source.id === assetId));
      if (!state3.images.length) {
        setMode("generate");
      }
      renderRecentAssets();
      renderImageStrip3();
      updateRequestPreview2();
      setStatus4("\u6700\u8FD1\u4E0A\u4F20\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      setStatus4(error.message || "\u6700\u8FD1\u4E0A\u4F20\u5220\u9664\u5931\u8D25", "error");
    }
  }
  function initRecentAssetsFeature() {
    if (recentAssetsFeatureInitialized) return;
    recentAssetsFeatureInitialized = true;
    els3.recentAssetList?.addEventListener("wheel", handleRecentAssetWheel, { passive: false });
    Object.assign(getLegacyBridge().methods, {
      refreshRecentAssets,
      renderRecentAssets,
      handleRecentAssetWheel,
      deleteRecentAsset
    });
  }

  // codex_image/webui/frontend/src/quick-gallery.ts
  var QUICK_GALLERY_WHEEL_COOLDOWN_MS = 220;
  var bridge3 = getLegacyBridge();
  var state4 = bridge3.state;
  var els4 = bridge3.els;
  var quickGalleryFeatureInitialized = false;
  var quickGalleryFocusFrameId = null;
  var quickGalleryWheelLockTimerId = null;
  function legacyMethod7(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml5(value) {
    return legacyMethod7("escapeHtml", value);
  }
  function addGalleryInput2(item, options) {
    legacyMethod7("addGalleryInput", item, options);
  }
  function filterGalleryItems(category) {
    return legacyMethod7("filterGalleryItems", category);
  }
  function findGalleryItem(itemId) {
    return legacyMethod7("findGalleryItem", itemId);
  }
  function categoryLabel2(category) {
    return legacyMethod7("categoryLabel", category);
  }
  function renderGalleryCategoryControls2() {
    legacyMethod7("renderGalleryCategoryControls");
  }
  function renderQuickGalleryDock2() {
    renderGalleryCategoryControls2();
    renderQuickGalleryList();
    hideQuickGalleryPreview();
  }
  function renderQuickGalleryList() {
    if (!els4.quickGalleryList) return;
    const items = filterGalleryItems();
    if (!items.length) {
      state4.quickGalleryFocusItemId = null;
      els4.quickGalleryList.innerHTML = `<div class="quick-gallery-empty">\u6682\u65E0${escapeHtml5(categoryLabel2(state4.activeGalleryCategory))}\u56FE\u7247</div>`;
      scheduleQuickGalleryFocusUpdate();
      return;
    }
    ensureQuickGalleryFocusItem(items);
    els4.quickGalleryList.innerHTML = items.map((item) => `
    <button class="quick-gallery-item" type="button" data-quick-gallery-use="${escapeHtml5(item.id)}">
      <span>${escapeHtml5(item.name)}</span>
    </button>
  `).join("");
    els4.quickGalleryList.querySelectorAll("[data-quick-gallery-use]").forEach((button) => {
      button.addEventListener("mouseenter", () => previewQuickGalleryItem(button.dataset.quickGalleryUse));
      button.addEventListener("focus", () => {
        previewQuickGalleryItem(button.dataset.quickGalleryUse);
        focusQuickGalleryItem(button.dataset.quickGalleryUse);
      });
      button.addEventListener("mouseleave", hideQuickGalleryPreview);
      button.addEventListener("blur", hideQuickGalleryPreview);
      button.addEventListener("click", () => {
        const item = findGalleryItem(button.dataset.quickGalleryUse);
        if (!item) return;
        const alreadySelected = state4.images.some((source) => source.kind === "gallery" && source.id === item.id);
        addGalleryInput2(item);
        if (!alreadySelected) {
          animateGalleryItemToInput(item, button);
        }
        hideQuickGalleryPreview();
      });
    });
    els4.quickGalleryList.scrollTop = 0;
    scheduleQuickGalleryFocusUpdate();
  }
  function ensureQuickGalleryFocusItem(items) {
    if (!items.length) {
      state4.quickGalleryFocusItemId = null;
      return;
    }
    if (!items.some((item) => item.id === state4.quickGalleryFocusItemId)) {
      state4.quickGalleryFocusItemId = items[0].id;
    }
  }
  function previewQuickGalleryItem(itemId) {
    state4.hoveredGalleryItemId = itemId || null;
    if (!els4.quickGalleryPreview) return;
    const item = findGalleryItem(itemId);
    els4.quickGalleryList?.querySelectorAll("[data-quick-gallery-use]").forEach((button) => {
      button.classList.toggle("active", button.dataset.quickGalleryUse === itemId);
    });
    if (!item) {
      hideQuickGalleryPreview();
      return;
    }
    els4.quickGalleryPreview.innerHTML = `
    <img src="${escapeHtml5(item.image_url)}" alt="${escapeHtml5(item.name)}">
    <span>${escapeHtml5(item.name)}</span>
  `;
    els4.quickGalleryPreview.classList.add("visible");
    scheduleQuickGalleryFocusUpdate();
  }
  function hideQuickGalleryPreview() {
    state4.hoveredGalleryItemId = null;
    els4.quickGalleryPreview?.classList.remove("visible");
    els4.quickGalleryList?.querySelectorAll("[data-quick-gallery-use]").forEach((button) => {
      button.classList.remove("active");
    });
    scheduleQuickGalleryFocusUpdate();
  }
  function scheduleQuickGalleryFocusUpdate() {
    if (quickGalleryFocusFrameId !== null) {
      window.cancelAnimationFrame(quickGalleryFocusFrameId);
    }
    quickGalleryFocusFrameId = window.requestAnimationFrame(() => {
      quickGalleryFocusFrameId = null;
      updateQuickGalleryFocus();
    });
  }
  function updateQuickGalleryFocus() {
    if (!els4.quickGalleryList) return;
    const buttons = Array.from(els4.quickGalleryList.querySelectorAll(".quick-gallery-item"));
    if (!buttons.length) return;
    const hoveredButton = state4.hoveredGalleryItemId ? buttons.find((button) => button.dataset.quickGalleryUse === state4.hoveredGalleryItemId) : null;
    const focusedButton = state4.quickGalleryFocusItemId ? buttons.find((button) => button.dataset.quickGalleryUse === state4.quickGalleryFocusItemId) : null;
    const focusButton = hoveredButton || focusedButton || buttons[0];
    if (!focusButton) return;
    const focusIndex = buttons.indexOf(focusButton);
    buttons.forEach((button) => {
      button.classList.remove("center", "near");
    });
    focusButton.classList.add("center");
    buttons.map((button) => ({ button, distance: Math.abs(buttons.indexOf(button) - focusIndex) })).filter(({ button }) => button !== focusButton).sort((left, right) => left.distance - right.distance).slice(0, 2).forEach(({ button }) => button.classList.add("near"));
  }
  function handleQuickGalleryBoundaryWheel(event) {
    if (!els4.quickGalleryList) return;
    const list = els4.quickGalleryList;
    const buttons = Array.from(list.querySelectorAll(".quick-gallery-item"));
    if (!buttons.length || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (quickGalleryWheelLockTimerId !== null) return;
    quickGalleryWheelLockTimerId = window.setTimeout(() => {
      quickGalleryWheelLockTimerId = null;
    }, QUICK_GALLERY_WHEEL_COOLDOWN_MS);
    const direction = event.deltaY > 0 ? 1 : -1;
    const currentIndex = currentQuickGalleryFocusIndex(buttons);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      triggerQuickGalleryBounce("top");
      return;
    }
    if (nextIndex >= buttons.length) {
      triggerQuickGalleryBounce("bottom");
      return;
    }
    scrollQuickGalleryItemToFocus(buttons[nextIndex]);
  }
  function triggerQuickGalleryBounce(direction) {
    if (!els4.quickGalleryList) return;
    const className = direction === "bottom" ? "bounce-bottom" : "bounce-top";
    els4.quickGalleryList.classList.remove("bounce-top", "bounce-bottom");
    void els4.quickGalleryList.offsetHeight;
    els4.quickGalleryList.classList.add(className);
    window.setTimeout(() => {
      els4.quickGalleryList?.classList.remove(className);
    }, 180);
  }
  function currentQuickGalleryFocusIndex(buttons) {
    const focusIndex = buttons.findIndex((button) => button.dataset.quickGalleryUse === state4.quickGalleryFocusItemId);
    if (focusIndex >= 0) return focusIndex;
    const classIndex = buttons.findIndex((button) => button.classList.contains("center"));
    if (classIndex >= 0) return classIndex;
    return 0;
  }
  function focusQuickGalleryItem(itemId) {
    if (!els4.quickGalleryList || !itemId) return;
    const button = Array.from(els4.quickGalleryList.querySelectorAll(".quick-gallery-item")).find((itemButton) => itemButton.dataset.quickGalleryUse === itemId);
    scrollQuickGalleryItemToFocus(button);
  }
  function scrollQuickGalleryItemToFocus(button, behavior = "smooth") {
    if (!els4.quickGalleryList || !button) return;
    const list = els4.quickGalleryList;
    state4.quickGalleryFocusItemId = button.dataset.quickGalleryUse || state4.quickGalleryFocusItemId;
    const targetTop = button.offsetTop;
    const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTo({
      top: Math.max(0, Math.min(maxScrollTop, targetTop)),
      behavior
    });
    scheduleQuickGalleryFocusUpdate();
  }
  function animateGalleryItemToInput(item, fromEl) {
    if (!item?.image_url || !fromEl || !els4.imageStrip) return;
    const sourceRect = (els4.quickGalleryPreview?.classList.contains("visible") ? els4.quickGalleryPreview : fromEl).getBoundingClientRect();
    const targetRect = (els4.imageStrip.querySelector(".thumb:last-child") || els4.imageUploadSource || els4.imageStrip).getBoundingClientRect();
    if (!sourceRect || !targetRect) return;
    const clone = document.createElement("img");
    clone.className = "gallery-fly-clone";
    clone.src = item.image_url;
    clone.alt = "";
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    document.body.appendChild(clone);
    const deltaX = targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2;
    const deltaY = targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2;
    clone.animate([
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 0.96 },
      { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.28)`, opacity: 0.18 }
    ], { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }).addEventListener("finish", () => clone.remove());
  }
  function initQuickGalleryFeature() {
    if (quickGalleryFeatureInitialized) return;
    quickGalleryFeatureInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      renderQuickGalleryDock: renderQuickGalleryDock2,
      renderQuickGalleryList,
      ensureQuickGalleryFocusItem,
      previewQuickGalleryItem,
      hideQuickGalleryPreview,
      scheduleQuickGalleryFocusUpdate,
      updateQuickGalleryFocus,
      handleQuickGalleryBoundaryWheel,
      triggerQuickGalleryBounce,
      currentQuickGalleryFocusIndex,
      focusQuickGalleryItem,
      scrollQuickGalleryItemToFocus,
      animateGalleryItemToInput
    });
  }

  // codex_image/webui/frontend/src/gallery-grid.ts
  var GALLERY_GRID_TRANSITION_MS = 220;
  var bridge4 = getLegacyBridge();
  var state5 = bridge4.state;
  var els5 = bridge4.els;
  var galleryGridFeatureInitialized = false;
  var galleryGridEventsBound = false;
  var draggedGalleryItemId = null;
  var galleryGridDropTargetId = null;
  var galleryGridDropPlacement = "after";
  var galleryGridOriginalOrder = [];
  function legacyMethod8(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml6(value) {
    return legacyMethod8("escapeHtml", value);
  }
  function ensureActiveGalleryCategory2() {
    legacyMethod8("ensureActiveGalleryCategory");
  }
  function categoryLabel3(category) {
    return legacyMethod8("categoryLabel", category);
  }
  function findGalleryItem2(itemId) {
    return legacyMethod8("findGalleryItem", itemId);
  }
  function filterGalleryItems2(category) {
    return legacyMethod8("filterGalleryItems", category);
  }
  function addGalleryInput3(item, options) {
    legacyMethod8("addGalleryInput", item, options);
  }
  function closeGallery() {
    legacyMethod8("closeGallery");
  }
  function renameGalleryItem(button, itemId) {
    legacyMethod8("renameGalleryItem", button, itemId);
  }
  function replaceGalleryItemImage(itemId) {
    return legacyMethod8("replaceGalleryItemImage", itemId);
  }
  function moveGalleryItem(button, itemId) {
    legacyMethod8("moveGalleryItem", button, itemId);
  }
  function editGalleryPromptNote(button, itemId) {
    legacyMethod8("editGalleryPromptNote", button, itemId);
  }
  function deleteGalleryItem(button, itemId) {
    legacyMethod8("deleteGalleryItem", button, itemId);
  }
  function applyGalleryItemOrder(category, itemIds) {
    legacyMethod8("applyGalleryItemOrder", category, itemIds);
  }
  function persistGalleryItemOrder(category, itemIds) {
    return legacyMethod8("persistGalleryItemOrder", category, itemIds);
  }
  function cssEscape3(value) {
    const text = String(value || "");
    if (window.CSS?.escape) return window.CSS.escape(text);
    return text.replace(/["\\]/g, "\\$&");
  }
  function measuredElementHeight(element2) {
    if (!element2) return 0;
    return Math.ceil(element2.getBoundingClientRect().height);
  }
  function renderGalleryGrid2(options = {}) {
    if (options.animateHeight) {
      renderGalleryGridWithHeightTransition();
      return;
    }
    resetGalleryGridTransition(false);
    renderGalleryGridContent();
  }
  function renderGalleryGridWithHeightTransition() {
    if (!els5.galleryGrid) return;
    if (!shouldAnimateGalleryGridHeight()) {
      renderGalleryGridContent();
      return;
    }
    const currentLayer = activeGalleryGridLayer();
    if (!currentLayer) {
      renderGalleryGridContent();
      return;
    }
    const transitionSeq = state5.galleryGridTransitionSeq + 1;
    state5.galleryGridTransitionSeq = transitionSeq;
    window.clearTimeout(state5.galleryGridTransitionTimerId);
    els5.galleryGrid.querySelectorAll(".gallery-grid-layer").forEach((layer) => {
      if (layer !== currentLayer) layer.remove();
    });
    const startHeight = els5.galleryGrid.getBoundingClientRect().height;
    els5.galleryGrid.style.height = `${startHeight}px`;
    els5.galleryGrid.classList.add("is-transitioning");
    const items = activeGalleryGridItems();
    const nextLayer = document.createElement("div");
    nextLayer.className = "gallery-grid-layer mode-transition mode-collapsed";
    nextLayer.innerHTML = galleryGridContentHtml(items);
    els5.galleryGrid.append(nextLayer);
    const targetHeight = measuredElementHeight(nextLayer);
    void els5.galleryGrid.offsetHeight;
    window.requestAnimationFrame(() => {
      if (state5.galleryGridTransitionSeq !== transitionSeq) return;
      currentLayer.classList.add("mode-collapsed");
      nextLayer.classList.remove("mode-collapsed");
      els5.galleryGrid.style.height = `${targetHeight}px`;
      bindGalleryGridActions(nextLayer);
      state5.galleryGridTransitionTimerId = window.setTimeout(() => {
        if (state5.galleryGridTransitionSeq !== transitionSeq) return;
        currentLayer.remove();
        resetGalleryGridTransition(false);
      }, GALLERY_GRID_TRANSITION_MS);
    });
  }
  function shouldAnimateGalleryGridHeight() {
    if (!els5.galleryDrawer || !els5.galleryDrawer.classList.contains("open")) return false;
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }
  function resetGalleryGridTransition(invalidate = true) {
    if (invalidate) state5.galleryGridTransitionSeq += 1;
    window.clearTimeout(state5.galleryGridTransitionTimerId);
    state5.galleryGridTransitionTimerId = null;
    els5.galleryGrid?.classList.remove("is-transitioning");
    if (els5.galleryGrid) els5.galleryGrid.style.height = "";
  }
  function renderGalleryGridContent() {
    if (!els5.galleryGrid) return;
    const items = activeGalleryGridItems();
    els5.galleryGrid.innerHTML = galleryGridLayerHtml(items);
    bindGalleryGridActions(els5.galleryGrid);
  }
  function activeGalleryGridItems() {
    ensureActiveGalleryCategory2();
    const items = filterGalleryItems2(state5.activeGalleryCategory);
    if (els5.galleryDrawerSubtitle) {
      els5.galleryDrawerSubtitle.textContent = `\u5F53\u524D\u5206\u7C7B\uFF1A${categoryLabel3(state5.activeGalleryCategory)}\uFF0C\u70B9\u51FB\u201C\u4F7F\u7528\u201D\u52A0\u5165\u56FE\u50CF\u8F93\u5165`;
    }
    return items;
  }
  function activeGalleryGridLayer() {
    if (!els5.galleryGrid) return null;
    const layers = Array.from(els5.galleryGrid.querySelectorAll(".gallery-grid-layer"));
    return layers.find((layer) => !layer.classList.contains("mode-collapsed")) || layers[layers.length - 1] || null;
  }
  function galleryGridLayerHtml(items) {
    return `<div class="gallery-grid-layer mode-transition">${galleryGridContentHtml(items)}</div>`;
  }
  function galleryGridContentHtml(items) {
    if (!items.length) {
      return `<div class="gallery-empty">\u8FD9\u4E2A\u5206\u7C7B\u8FD8\u6CA1\u6709\u56FE\u7247</div>`;
    }
    return items.map((item) => `
    <article class="gallery-card" data-gallery-id="${escapeHtml6(item.id)}">
      <button
        class="gallery-card-drag-strip"
        type="button"
        draggable="true"
        data-gallery-id="${escapeHtml6(item.id)}"
        data-gallery-order-handle
        aria-label="\u62D6\u62FD\u6392\u5E8F\u56FE\u7247 ${escapeHtml6(item.name)}"
        title="\u62D6\u62FD\u6392\u5E8F"
      >
        <span class="gallery-card-drag-strip-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false">
            <circle cx="5" cy="4" r="1.1" />
            <circle cx="11" cy="4" r="1.1" />
            <circle cx="5" cy="8" r="1.1" />
            <circle cx="11" cy="8" r="1.1" />
            <circle cx="5" cy="12" r="1.1" />
            <circle cx="11" cy="12" r="1.1" />
          </svg>
        </span>
        <span>\u62D6\u62FD\u6392\u5E8F</span>
      </button>
      <div class="gallery-card-media">
        <img src="${escapeHtml6(item.image_url)}" alt="${escapeHtml6(item.name)}" draggable="false">
      </div>
      <div class="gallery-card-body">
        <div class="gallery-card-heading">
          <strong>${escapeHtml6(item.name)}</strong>
        </div>
        <span>${escapeHtml6(categoryLabel3(item.category))}</span>
      </div>
      <div class="gallery-card-actions">
        <button class="ghost-button text-sm" type="button" data-gallery-use="${escapeHtml6(item.id)}">\u4F7F\u7528</button>
        <button class="ghost-button text-sm" type="button" data-gallery-replace="${escapeHtml6(item.id)}">\u66FF\u6362</button>
        <button class="ghost-button text-sm" type="button" data-gallery-rename="${escapeHtml6(item.id)}">\u91CD\u547D\u540D</button>
        <button class="ghost-button text-sm" type="button" data-gallery-move="${escapeHtml6(item.id)}">\u5206\u7C7B</button>
        <button class="ghost-button text-sm" type="button" data-gallery-note="${escapeHtml6(item.id)}">\u5907\u6CE8</button>
        <button class="ghost-button text-sm danger-button" type="button" data-gallery-delete="${escapeHtml6(item.id)}">\u5220\u9664</button>
      </div>
    </article>
  `).join("");
  }
  function bindGalleryGridActions(root = els5.galleryGrid) {
    return root;
  }
  function handleGalleryGridClick(event) {
    const button = event.target.closest?.("[data-gallery-use],[data-gallery-rename],[data-gallery-replace],[data-gallery-move],[data-gallery-note],[data-gallery-delete]");
    if (!button || !els5.galleryGrid?.contains(button)) return;
    if (button.dataset.galleryUse) {
      const item = findGalleryItem2(button.dataset.galleryUse);
      if (item) addGalleryInput3(item);
      closeGallery();
      return;
    }
    if (button.dataset.galleryRename) {
      renameGalleryItem(button, button.dataset.galleryRename);
      return;
    }
    if (button.dataset.galleryReplace) {
      replaceGalleryItemImage(button.dataset.galleryReplace);
      return;
    }
    if (button.dataset.galleryMove) {
      moveGalleryItem(button, button.dataset.galleryMove);
      return;
    }
    if (button.dataset.galleryNote) {
      editGalleryPromptNote(button, button.dataset.galleryNote);
      return;
    }
    if (button.dataset.galleryDelete) {
      deleteGalleryItem(button, button.dataset.galleryDelete);
    }
  }
  function clearGalleryGridDragState() {
    const originalOrder = galleryGridOriginalOrder.slice();
    const shouldRestoreOriginalOrder = Boolean(draggedGalleryItemId && originalOrder.length);
    if (shouldRestoreOriginalOrder) restoreGalleryGridDomOrder(originalOrder);
    draggedGalleryItemId = null;
    galleryGridDropTargetId = null;
    galleryGridDropPlacement = "after";
    galleryGridOriginalOrder = [];
    els5.galleryGrid?.classList.remove("is-drag-sorting");
    els5.galleryGrid?.querySelectorAll?.(".gallery-card").forEach((card) => {
      card.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
    });
  }
  function finishGalleryGridDrag() {
    draggedGalleryItemId = null;
    galleryGridDropTargetId = null;
    galleryGridDropPlacement = "after";
    galleryGridOriginalOrder = [];
    els5.galleryGrid?.classList.remove("is-drag-sorting");
    els5.galleryGrid?.querySelectorAll?.(".gallery-card").forEach((card) => {
      card.classList.remove("is-dragging", "drop-target", "drop-before", "drop-after");
    });
  }
  function galleryCardElement(itemId) {
    return els5.galleryGrid?.querySelector?.(`.gallery-card[data-gallery-id="${cssEscape3(itemId)}"]`) || null;
  }
  function activeGalleryGridLayerElement() {
    const layer = activeGalleryGridLayer();
    return layer instanceof HTMLElement ? layer : null;
  }
  function galleryGridDomOrder() {
    const layer = activeGalleryGridLayerElement();
    return Array.from(layer?.querySelectorAll(".gallery-card[data-gallery-id]") || []).map((card) => String(card.dataset.galleryId || "")).filter(Boolean);
  }
  function sameGalleryGridOrder(left, right) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
  }
  function restoreGalleryGridDomOrder(itemIds) {
    const layer = activeGalleryGridLayerElement();
    if (!layer) return;
    const cards = new Map(
      Array.from(layer.querySelectorAll(".gallery-card[data-gallery-id]")).map((card) => [String(card.dataset.galleryId || ""), card])
    );
    itemIds.forEach((itemId) => {
      const card = cards.get(itemId);
      if (card) layer.append(card);
    });
  }
  function moveGalleryGridDragPlaceholder(targetCard, placement) {
    if (!draggedGalleryItemId) return;
    const draggedCard = galleryCardElement(draggedGalleryItemId);
    const parent = targetCard.parentElement;
    if (!draggedCard || !parent || draggedCard === targetCard || draggedCard.parentElement !== parent) return;
    if (placement === "before") {
      parent.insertBefore(draggedCard, targetCard);
      return;
    }
    parent.insertBefore(draggedCard, targetCard.nextSibling);
  }
  function galleryCardDropPlacement(event, card) {
    const rect = card.getBoundingClientRect();
    const xDelta = event.clientX - (rect.left + rect.width / 2);
    const yDelta = event.clientY - (rect.top + rect.height / 2);
    if (Math.abs(yDelta) > Math.abs(xDelta)) {
      return yDelta < 0 ? "before" : "after";
    }
    return xDelta < 0 ? "before" : "after";
  }
  function handleGalleryGridDragStart(event) {
    const handle = event.target?.closest?.("[data-gallery-order-handle]");
    const itemId = String(handle?.dataset.galleryId || "");
    if (!handle || !itemId || !els5.galleryGrid?.contains(handle)) return;
    const item = findGalleryItem2(itemId);
    const card = galleryCardElement(itemId);
    draggedGalleryItemId = itemId;
    galleryGridDropTargetId = null;
    galleryGridDropPlacement = "after";
    galleryGridOriginalOrder = activeGalleryGridItems().map((galleryItem) => String(galleryItem.id));
    event.dataTransfer?.setData("text/plain", itemId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setGalleryDragPreview(event, {
      type: "item",
      title: item?.name || "\u56FE\u5E93\u56FE\u7247",
      subtitle: categoryLabel3(item?.category || state5.activeGalleryCategory),
      imageUrl: item?.image_url,
      sourceElement: card
    });
    window.requestAnimationFrame(() => {
      galleryCardElement(itemId)?.classList.add("is-dragging");
      els5.galleryGrid?.classList.add("is-drag-sorting");
    });
  }
  function handleGalleryGridDragOver(event) {
    if (!draggedGalleryItemId || !els5.galleryGrid) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const targetCard = event.target?.closest?.(".gallery-card[data-gallery-id]");
    if (!targetCard || !els5.galleryGrid.contains(targetCard)) return;
    const targetId = String(targetCard.dataset.galleryId || "");
    if (!targetId || targetId === draggedGalleryItemId) return;
    const placement = galleryCardDropPlacement(event, targetCard);
    if (galleryGridDropTargetId === targetId && galleryGridDropPlacement === placement) return;
    galleryGridDropTargetId = targetId;
    galleryGridDropPlacement = placement;
    moveGalleryGridDragPlaceholder(targetCard, placement);
    els5.galleryGrid.querySelectorAll(".gallery-card").forEach((card) => {
      card.classList.toggle("drop-target", card === targetCard);
      card.classList.toggle("drop-before", card === targetCard && placement === "before");
      card.classList.toggle("drop-after", card === targetCard && placement === "after");
    });
  }
  function handleGalleryGridDrop(event) {
    if (!draggedGalleryItemId) {
      finishGalleryGridDrag();
      return;
    }
    const draggedId = draggedGalleryItemId;
    event.preventDefault();
    const originalOrder = galleryGridOriginalOrder.length ? galleryGridOriginalOrder.slice() : activeGalleryGridItems().map((item) => String(item.id));
    const reorderedIds = galleryGridDomOrder();
    finishGalleryGridDrag();
    if (!reorderedIds.includes(draggedId) || sameGalleryGridOrder(originalOrder, reorderedIds)) return;
    applyGalleryItemOrder(state5.activeGalleryCategory, reorderedIds);
    void persistGalleryItemOrder(state5.activeGalleryCategory, reorderedIds);
  }
  function handleGalleryGridDragEnd() {
    clearGalleryGridDragState();
  }
  function bindGalleryGridEvents() {
    if (galleryGridEventsBound) return;
    galleryGridEventsBound = true;
    els5.galleryGrid?.addEventListener("click", handleGalleryGridClick);
    els5.galleryGrid?.addEventListener("dragstart", handleGalleryGridDragStart);
    els5.galleryGrid?.addEventListener("dragover", handleGalleryGridDragOver);
    els5.galleryGrid?.addEventListener("drop", handleGalleryGridDrop);
    els5.galleryGrid?.addEventListener("dragend", handleGalleryGridDragEnd);
    els5.galleryGrid?.addEventListener("dragleave", (event) => {
      if (!draggedGalleryItemId) return;
      const related = event.relatedTarget;
      if (related && els5.galleryGrid?.contains(related)) return;
      els5.galleryGrid?.querySelectorAll(".gallery-card").forEach((card) => {
        card.classList.remove("drop-target", "drop-before", "drop-after");
      });
      galleryGridDropTargetId = null;
    });
  }
  function initGalleryGridFeature() {
    if (galleryGridFeatureInitialized) return;
    galleryGridFeatureInitialized = true;
    bindGalleryGridEvents();
    Object.assign(getLegacyBridge().methods, {
      renderGalleryGrid: renderGalleryGrid2,
      renderGalleryGridWithHeightTransition,
      shouldAnimateGalleryGridHeight,
      resetGalleryGridTransition,
      renderGalleryGridContent,
      activeGalleryGridItems,
      activeGalleryGridLayer,
      galleryGridLayerHtml,
      galleryGridContentHtml,
      bindGalleryGridActions,
      handleGalleryGridClick,
      handleGalleryGridDragStart,
      handleGalleryGridDragOver,
      handleGalleryGridDrop,
      handleGalleryGridDragEnd
    });
  }

  // codex_image/webui/frontend/src/gallery-item-actions.ts
  var bridge5 = getLegacyBridge();
  var state6 = bridge5.state;
  var els6 = bridge5.els;
  var galleryItemActionsFeatureInitialized = false;
  var galleryEditPopoverEl = null;
  var galleryEditPopoverState = {
    anchor: null,
    onSave: null
  };
  function legacyMethod9(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml7(value) {
    return legacyMethod9("escapeHtml", value);
  }
  function setStatus5(message, type) {
    legacyMethod9("setStatus", message, type);
  }
  function openConfirmPopover3(anchor, options) {
    legacyMethod9("openConfirmPopover", anchor, options);
  }
  function closeConfirmPopover2() {
    legacyMethod9("closeConfirmPopover");
  }
  function closePromptPopover() {
    legacyMethod9("closePromptPopover");
  }
  function setMode2(mode) {
    legacyMethod9("setMode", mode);
  }
  function sourcePreviewUrl2(source) {
    return legacyMethod9("sourcePreviewUrl", source);
  }
  function sourceName2(source) {
    return legacyMethod9("sourceName", source);
  }
  function gallerySource2(item) {
    return legacyMethod9("gallerySource", item);
  }
  function revokeUploadPreviewUrl2(source, options) {
    legacyMethod9("revokeUploadPreviewUrl", source, options);
  }
  function renderImageStrip4() {
    legacyMethod9("renderImageStrip");
  }
  function updateRequestPreview3() {
    legacyMethod9("updateRequestPreview");
  }
  function refreshGallery2() {
    return legacyMethod9("refreshGallery");
  }
  function renderQuickGalleryDock3() {
    legacyMethod9("renderQuickGalleryDock");
  }
  function renderGalleryGrid3(options) {
    legacyMethod9("renderGalleryGrid", options);
  }
  function renderGalleryCategoryControls3() {
    legacyMethod9("renderGalleryCategoryControls");
  }
  function findGalleryItem3(itemId) {
    return legacyMethod9("findGalleryItem", itemId);
  }
  function findGalleryCategory2(categoryId) {
    return legacyMethod9("findGalleryCategory", categoryId);
  }
  function normalizeGalleryCategories2(categories) {
    return legacyMethod9("normalizeGalleryCategories", categories);
  }
  function clampPopoverPosition(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }
  async function remoteImageSourceFile2(source) {
    const imageUrl = sourcePreviewUrl2(source);
    if (!imageUrl) throw new Error("\u65E0\u6CD5\u8F7D\u5165\u8FD9\u5F20\u56FE\u7247");
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("\u65E0\u6CD5\u8F7D\u5165\u8FD9\u5F20\u56FE\u7247");
    const blob = await response.blob();
    return new File([blob], sourceName2(source), {
      type: blob.type || source.mime_type || "image/png",
      lastModified: Date.now()
    });
  }
  function openAddToGallery(index) {
    const source = state6.images[index];
    if (!canAddSourceToGallery(source)) return;
    state6.addToGalleryIndex = index;
    if (els6.addToGalleryPreview) {
      els6.addToGalleryPreview.src = sourcePreviewUrl2(source);
    }
    if (els6.galleryNameInput) {
      els6.galleryNameInput.value = sourceName2(source).replace(/\.[^.]+$/, "");
    }
    if (els6.galleryCategoryInput) {
      renderGalleryCategoryControls3();
      els6.galleryCategoryInput.value = findGalleryCategory2(state6.activeGalleryCategory) ? state6.activeGalleryCategory : state6.galleryCategories[0]?.id || "portrait";
    }
    if (els6.galleryPromptNoteInput) {
      els6.galleryPromptNoteInput.value = "";
    }
    els6.addToGalleryModal?.classList.remove("hidden");
    els6.galleryNameInput?.focus();
  }
  function closeAddToGallery() {
    state6.addToGalleryIndex = null;
    els6.addToGalleryModal?.classList.add("hidden");
  }
  function canAddSourceToGallery(source) {
    if (!source || source.missing) return false;
    if (source.kind === "upload") return Boolean(source.file);
    return source.kind === "asset" && Boolean(sourcePreviewUrl2(source));
  }
  async function galleryImageFileForSource(source) {
    if (source.kind === "upload") return source.file;
    if (source.kind === "asset") return remoteImageSourceFile2(source);
    throw new Error("\u8FD9\u5F20\u56FE\u7247\u65E0\u6CD5\u52A0\u5165\u56FE\u5E93");
  }
  async function saveUploadToGallery() {
    const source = state6.images[state6.addToGalleryIndex];
    if (!canAddSourceToGallery(source)) return;
    const name = els6.galleryNameInput.value.trim();
    const category = els6.galleryCategoryInput.value;
    const promptNote = els6.galleryPromptNoteInput?.value.trim() || "";
    if (!name) {
      setStatus5("\u8BF7\u8F93\u5165\u56FE\u5E93\u540D\u79F0", "error");
      return;
    }
    try {
      const form = new FormData();
      const imageFile = await galleryImageFileForSource(source);
      form.append("name", name);
      form.append("category", category);
      form.append("prompt_note", promptNote);
      form.append("image", imageFile);
      const response = await fetch("/api/gallery", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "\u4FDD\u5B58\u56FE\u5E93\u5931\u8D25");
      }
      state6.images[state6.addToGalleryIndex] = gallerySource2(data.item);
      if (source.kind === "upload") revokeUploadPreviewUrl2(source);
      await refreshGallery2();
      closeAddToGallery();
      setMode2("edit");
      renderImageStrip4();
      updateRequestPreview3();
      setStatus5("\u5DF2\u6DFB\u52A0\u5230\u56FE\u5E93\uFF0C\u5E76\u5207\u6362\u4E3A\u56FE\u5E93\u5F15\u7528", "ok");
    } catch (error) {
      setStatus5(error.message || "\u4FDD\u5B58\u56FE\u5E93\u5931\u8D25", "error");
    }
  }
  function renameGalleryItem2(button, itemId) {
    const item = findGalleryItem3(itemId);
    if (!item) return;
    openGalleryEditPopover(button, {
      title: "\u91CD\u547D\u540D\u56FE\u5E93\u56FE\u7247",
      mode: "name",
      item,
      onSave: async (popover) => {
        const name = popover.querySelector("[data-gallery-edit-name]")?.value.trim();
        if (!name) {
          setStatus5("\u8BF7\u8F93\u5165\u56FE\u5E93\u540D\u79F0", "error");
          return false;
        }
        if (name === item.name) return true;
        await patchGalleryItem(itemId, { name });
        return true;
      }
    });
  }
  function moveGalleryItem2(button, itemId) {
    const item = findGalleryItem3(itemId);
    if (!item) return;
    openGalleryEditPopover(button, {
      title: "\u79FB\u52A8\u5230\u5206\u7C7B",
      mode: "category",
      item,
      onSave: async (popover) => {
        const category = popover.querySelector("[data-gallery-edit-category]")?.value;
        if (!findGalleryCategory2(category)) {
          setStatus5("\u8BF7\u9009\u62E9\u56FE\u5E93\u5206\u7C7B", "error");
          return false;
        }
        if (category === item.category) return true;
        await patchGalleryItem(itemId, { category });
        return true;
      }
    });
  }
  function editGalleryPromptNote2(button, itemId) {
    const item = findGalleryItem3(itemId);
    if (!item) return;
    openGalleryEditPopover(button, {
      title: "\u56FE\u5E93\u5F15\u7528\u5907\u6CE8",
      mode: "prompt_note",
      item,
      onSave: async (popover) => {
        const promptNote = popover.querySelector("[data-gallery-edit-prompt-note]")?.value.trim() || "";
        if (promptNote === (item.prompt_note || "")) return true;
        await patchGalleryItem(itemId, { prompt_note: promptNote });
        return true;
      }
    });
  }
  async function patchGalleryItem(itemId, payload) {
    try {
      const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u66F4\u65B0\u56FE\u5E93\u5931\u8D25");
      await refreshGallery2();
      state6.images = state6.images.map((source) => source.kind === "gallery" && source.id === itemId ? gallerySource2(data.item) : source);
      renderImageStrip4();
      updateRequestPreview3();
    } catch (error) {
      setStatus5(error.message || "\u66F4\u65B0\u56FE\u5E93\u5931\u8D25", "error");
    }
  }
  function selectGalleryReplacementFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.addEventListener("change", () => {
        const file = input.files?.[0] || null;
        input.remove();
        resolve(file);
      }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  async function replaceGalleryItemImage2(itemId) {
    const item = findGalleryItem3(itemId);
    if (!item) return;
    const file = await selectGalleryReplacementFile();
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setStatus5("\u8BF7\u9009\u62E9\u56FE\u7247\u6587\u4EF6", "error");
      return;
    }
    const form = new FormData();
    form.append("image", file);
    try {
      const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}/image`, {
        method: "PUT",
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u66FF\u6362\u56FE\u5E93\u56FE\u7247\u5931\u8D25");
      const updated = data.item;
      state6.galleryItems = state6.galleryItems.map((candidate) => candidate.id === itemId ? updated : candidate);
      state6.images = state6.images.map((source) => source.kind === "gallery" && source.id === itemId ? gallerySource2(updated) : source);
      renderQuickGalleryDock3();
      renderGalleryGrid3();
      renderImageStrip4();
      updateRequestPreview3();
      setStatus5(`\u5DF2\u66FF\u6362\u300C${updated.name || item.name}\u300D\u7684\u539F\u56FE`, "ok");
    } catch (error) {
      setStatus5(error.message || "\u66FF\u6362\u56FE\u5E93\u56FE\u7247\u5931\u8D25", "error");
    }
  }
  function deleteGalleryItem2(button, itemId) {
    const item = findGalleryItem3(itemId);
    if (!item) return;
    openConfirmPopover3(button, {
      title: "\u5220\u9664\u56FE\u5E93\u56FE\u7247\uFF1F",
      message: "\u5386\u53F2\u4EFB\u52A1\u91CC\u7684\u5F15\u7528\u4F1A\u663E\u793A\u4E3A\u5DF2\u5220\u9664\u3002",
      detail: item.name,
      confirmText: "\u5220\u9664",
      onConfirm: async () => {
        await performDeleteGalleryItem(itemId);
      }
    });
  }
  async function performDeleteGalleryItem(itemId) {
    try {
      const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u5220\u9664\u56FE\u5E93\u5931\u8D25");
      await refreshGallery2();
      state6.images = state6.images.map((source) => {
        if (source.kind !== "gallery" || source.id !== itemId) return source;
        return { ...source, missing: true, image_url: "", previewUrl: "", name: `${source.name}\uFF08\u5DF2\u5220\u9664\uFF09` };
      });
      renderImageStrip4();
      updateRequestPreview3();
    } catch (error) {
      setStatus5(error.message || "\u5220\u9664\u56FE\u5E93\u5931\u8D25", "error");
    }
  }
  function ensureGalleryEditPopover() {
    if (galleryEditPopoverEl) return galleryEditPopoverEl;
    galleryEditPopoverEl = document.createElement("div");
    galleryEditPopoverEl.className = "gallery-edit-popover hidden";
    galleryEditPopoverEl.setAttribute("role", "dialog");
    galleryEditPopoverEl.setAttribute("aria-label", "\u7F16\u8F91\u56FE\u5E93\u56FE\u7247");
    document.body.appendChild(galleryEditPopoverEl);
    return galleryEditPopoverEl;
  }
  function openGalleryEditPopover(anchor, options = {}) {
    if (!anchor || !options.item) return;
    const popover = ensureGalleryEditPopover();
    if (!popover.classList.contains("hidden") && galleryEditPopoverState.anchor === anchor) {
      closeGalleryEditPopover2();
      return;
    }
    closePromptPopover();
    closeConfirmPopover2();
    galleryEditPopoverState.anchor = anchor;
    galleryEditPopoverState.onSave = typeof options.onSave === "function" ? options.onSave : null;
    popover.innerHTML = `
    <form class="gallery-edit-form">
      <div class="gallery-edit-title">${escapeHtml7(options.title || "\u7F16\u8F91\u56FE\u5E93\u56FE\u7247")}</div>
      ${galleryEditFieldHtml(options.mode, options.item)}
      <div class="gallery-edit-actions">
        <button class="ghost-button text-sm" type="button" data-gallery-edit-cancel>\u53D6\u6D88</button>
        <button class="ghost-button text-sm" type="submit" data-gallery-edit-save>\u4FDD\u5B58</button>
      </div>
    </form>
  `;
    popover.querySelector("[data-gallery-edit-cancel]")?.addEventListener("click", closeGalleryEditPopover2);
    popover.querySelector(".gallery-edit-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const onSave = galleryEditPopoverState.onSave;
      if (!onSave) {
        closeGalleryEditPopover2();
        return;
      }
      const shouldClose = await onSave(popover);
      if (shouldClose !== false) closeGalleryEditPopover2();
    });
    popover.classList.remove("hidden");
    positionGalleryEditPopover(anchor, popover);
    const focusTarget = popover.querySelector("[data-gallery-edit-name], [data-gallery-edit-category], [data-gallery-edit-prompt-note]");
    focusTarget?.focus({ preventScroll: true });
    focusTarget?.select?.();
  }
  function galleryEditFieldHtml(mode, item) {
    if (mode === "category") {
      const options = normalizeGalleryCategories2(state6.galleryCategories).map((category) => `
      <option value="${escapeHtml7(category.id)}" ${category.id === item.category ? "selected" : ""}>${escapeHtml7(category.name)}</option>
    `).join("");
      return `
      <label class="gallery-edit-field">
        <span>\u5206\u7C7B</span>
        <select class="gallery-edit-select" data-gallery-edit-category>${options}</select>
      </label>
    `;
    }
    if (mode === "prompt_note") {
      return `
      <label class="gallery-edit-field">
        <span>\u5F15\u7528\u5907\u6CE8</span>
        <textarea class="gallery-edit-input gallery-edit-textarea" maxlength="160" data-gallery-edit-prompt-note>${escapeHtml7(item.prompt_note || "")}</textarea>
      </label>
    `;
    }
    return `
    <label class="gallery-edit-field">
      <span>\u540D\u79F0</span>
      <input class="gallery-edit-input" type="text" value="${escapeHtml7(item.name)}" data-gallery-edit-name>
    </label>
  `;
  }
  function closeGalleryEditPopover2() {
    if (!galleryEditPopoverEl) return;
    galleryEditPopoverEl.classList.add("hidden");
    galleryEditPopoverState.anchor = null;
    galleryEditPopoverState.onSave = null;
  }
  function positionGalleryEditPopover(anchor, popover) {
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(300, Math.max(230, window.innerWidth - margin * 2));
    popover.style.width = `${width}px`;
    popover.style.left = "0px";
    popover.style.top = "0px";
    const height = popover.offsetHeight;
    const left = clampPopoverPosition(anchorRect.right - width, margin, window.innerWidth - width - margin);
    const belowTop = anchorRect.bottom + 8;
    const top = belowTop + height <= window.innerHeight - margin ? belowTop : clampPopoverPosition(anchorRect.top - height - 8, margin, window.innerHeight - height - margin);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  function handleGalleryDocumentClick(event) {
    const target = event.target;
    if (galleryEditPopoverEl && !galleryEditPopoverEl.classList.contains("hidden")) {
      const clickedPopover = galleryEditPopoverEl.contains(target);
      const clickedAnchor = galleryEditPopoverState.anchor?.contains?.(target);
      if (!clickedPopover && !clickedAnchor) {
        closeGalleryEditPopover2();
      }
    }
  }
  function initGalleryItemActionsFeature() {
    if (galleryItemActionsFeatureInitialized) return;
    galleryItemActionsFeatureInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      openAddToGallery,
      closeAddToGallery,
      canAddSourceToGallery,
      galleryImageFileForSource,
      saveUploadToGallery,
      renameGalleryItem: renameGalleryItem2,
      moveGalleryItem: moveGalleryItem2,
      editGalleryPromptNote: editGalleryPromptNote2,
      patchGalleryItem,
      selectGalleryReplacementFile,
      replaceGalleryItemImage: replaceGalleryItemImage2,
      deleteGalleryItem: deleteGalleryItem2,
      performDeleteGalleryItem,
      ensureGalleryEditPopover,
      openGalleryEditPopover,
      galleryEditFieldHtml,
      closeGalleryEditPopover: closeGalleryEditPopover2,
      positionGalleryEditPopover,
      handleGalleryDocumentClick
    });
  }

  // codex_image/webui/frontend/src/gallery.ts
  var bridge6 = getLegacyBridge();
  var state7 = bridge6.state;
  var els7 = bridge6.els;
  var galleryFeatureInitialized = false;
  var galleryFeatureEventsBound = false;
  var lastGalleryTrigger = null;
  function legacyMethod10(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus6(message, type) {
    legacyMethod10("setStatus", message, type);
  }
  function closeConfirmPopover3() {
    legacyMethod10("closeConfirmPopover");
  }
  var defaultGalleryCategories3 = () => legacyMethod10("defaultGalleryCategories");
  var normalizeGalleryCategories3 = (categories) => legacyMethod10("normalizeGalleryCategories", categories);
  var ensureActiveGalleryCategory3 = () => {
    legacyMethod10("ensureActiveGalleryCategory");
  };
  var renderGalleryCategoryControls4 = () => {
    legacyMethod10("renderGalleryCategoryControls");
  };
  var findGalleryCategory3 = (categoryId) => legacyMethod10("findGalleryCategory", categoryId);
  var renderQuickGalleryDock4 = () => {
    legacyMethod10("renderQuickGalleryDock");
  };
  var renderGalleryGrid4 = (options) => {
    legacyMethod10("renderGalleryGrid", options);
  };
  var resetGalleryGridTransition2 = (invalidate) => {
    legacyMethod10("resetGalleryGridTransition", invalidate);
  };
  var closeGalleryEditPopover3 = () => {
    legacyMethod10("closeGalleryEditPopover");
  };
  function sortGalleryItems(items) {
    const categories = normalizeGalleryCategories3(state7.galleryCategories);
    const categoryOrder = new Map(categories.map((category) => [String(category.id), Number(category.order) || 0]));
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
  function filterGalleryItems3(category = state7.activeGalleryCategory) {
    return sortGalleryItems(state7.galleryItems.filter((item) => item.category === category));
  }
  async function refreshGallery3() {
    try {
      const response = await fetch("/api/gallery");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "\u56FE\u5E93\u8BFB\u53D6\u5931\u8D25");
      }
      state7.galleryItems = sortGalleryItems(data.items || []);
      state7.galleryCategories = normalizeGalleryCategories3(data.categories);
      ensureActiveGalleryCategory3();
      renderGalleryCategoryControls4();
      renderQuickGalleryDock4();
      renderGalleryGrid4();
    } catch (error) {
      state7.galleryItems = [];
      state7.galleryCategories = defaultGalleryCategories3();
      renderGalleryCategoryControls4();
      renderQuickGalleryDock4();
      setStatus6(error.message || "\u56FE\u5E93\u8BFB\u53D6\u5931\u8D25", "error");
    }
  }
  async function openGallery(category) {
    legacyMethod10("closePromptTemplateDrawer", { restoreFocus: false });
    lastGalleryTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : els7.galleryManageButton;
    state7.activeGalleryCategory = findGalleryCategory3(category) ? category : state7.galleryCategories[0]?.id || "portrait";
    await refreshGallery3();
    renderGalleryCategoryControls4();
    renderGalleryGrid4();
    els7.galleryDrawer?.classList.add("open");
    els7.galleryDrawer?.setAttribute("aria-hidden", "false");
    els7.galleryDrawerBackdrop?.classList.remove("hidden");
    els7.galleryManageButton?.setAttribute("aria-expanded", "true");
    window.setTimeout(() => {
      els7.galleryDrawerClose?.focus?.({ preventScroll: true });
    }, 0);
  }
  function closeGallery2(options = {}) {
    const restoreFocus = options?.restoreFocus !== false;
    closeGalleryEditPopover3();
    closeConfirmPopover3();
    resetGalleryGridTransition2();
    els7.galleryDrawer?.classList.remove("open");
    els7.galleryDrawer?.setAttribute("aria-hidden", "true");
    els7.galleryDrawerBackdrop?.classList.add("hidden");
    els7.galleryManageButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      const focusTarget = lastGalleryTrigger || els7.galleryManageButton;
      focusTarget?.focus?.({ preventScroll: true });
    }
  }
  function findGalleryItem4(itemId) {
    return state7.galleryItems.find((item) => item.id === itemId);
  }
  function applyGalleryItemOrder2(category, itemIds) {
    const orderMap = new Map(itemIds.map((itemId, index) => [itemId, (index + 1) * 10]));
    state7.galleryItems = sortGalleryItems(
      state7.galleryItems.map((item) => item.category === category && orderMap.has(item.id) ? { ...item, order: orderMap.get(item.id) } : item)
    );
    renderQuickGalleryDock4();
    renderGalleryGrid4();
  }
  async function persistGalleryItemOrder2(category, itemIds) {
    try {
      const response = await fetch("/api/gallery/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, item_ids: itemIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u66F4\u65B0\u56FE\u7247\u987A\u5E8F\u5931\u8D25");
      const reorderedIds = new Set(itemIds);
      const reorderedItems = Array.isArray(data.items) ? data.items : [];
      state7.galleryItems = sortGalleryItems([
        ...state7.galleryItems.filter((item) => !(item.category === category && reorderedIds.has(item.id))),
        ...reorderedItems
      ]);
      renderQuickGalleryDock4();
      renderGalleryGrid4();
      setStatus6("\u56FE\u7247\u987A\u5E8F\u5DF2\u66F4\u65B0", "ok");
    } catch (error) {
      await refreshGallery3();
      setStatus6(error.message || "\u66F4\u65B0\u56FE\u7247\u987A\u5E8F\u5931\u8D25", "error");
    }
  }
  function handleGalleryManageButtonClick() {
    void openGallery(state7.activeGalleryCategory);
  }
  function bindGalleryFeatureEvents() {
    if (galleryFeatureEventsBound) return;
    galleryFeatureEventsBound = true;
    els7.galleryManageButton?.addEventListener("click", handleGalleryManageButtonClick);
    els7.galleryDrawerClose?.addEventListener("click", () => closeGallery2());
    els7.galleryDrawerBackdrop?.addEventListener("click", () => closeGallery2());
  }
  function initGalleryFeature() {
    if (galleryFeatureInitialized) return;
    galleryFeatureInitialized = true;
    bindGalleryFeatureEvents();
    Object.assign(getLegacyBridge().methods, {
      sortGalleryItems,
      filterGalleryItems: filterGalleryItems3,
      refreshGallery: refreshGallery3,
      openGallery,
      closeGallery: closeGallery2,
      findGalleryItem: findGalleryItem4,
      applyGalleryItemOrder: applyGalleryItemOrder2,
      persistGalleryItemOrder: persistGalleryItemOrder2
    });
  }

  // codex_image/webui/frontend/src/api-mode-settings.ts
  var bridge7 = getLegacyBridge();
  var els8 = bridge7.els;
  function legacyMethod11(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function currentAuthSource() {
    return legacyMethod11("currentAuthSource");
  }
  function currentApiMode() {
    return legacyMethod11("currentApiMode");
  }
  function setModeSpecificElementVisibility(element2, visible) {
    if (!element2) return;
    element2.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      element2.classList.remove("hidden");
      element2.classList.remove("mode-collapsed");
      return;
    }
    element2.classList.add("mode-collapsed");
    element2.classList.add("hidden");
  }
  function applyModeSettingsVisibility(isDirectApi) {
    setModeSpecificElementVisibility(els8.modeSpecificSettings, true);
    setModeSpecificElementVisibility(els8.mainModelField, !isDirectApi);
    setModeSpecificElementVisibility(els8.apiDirectSettingsNotice, isDirectApi);
    setModeSpecificElementVisibility(els8.promptFidelityField, true);
  }
  function setModeSettingsVariant(isDirectApi) {
    const slot = els8.modeSettingsSlot;
    if (slot) {
      slot.style.height = "";
      slot.classList.remove("is-transitioning");
    }
    applyModeSettingsVisibility(isDirectApi);
  }
  function updateModeSpecificSettings(authSource = currentAuthSource()) {
    const isDirectApi = authSource === "api" && currentApiMode() !== "responses";
    setModeSettingsVariant(isDirectApi);
  }

  // codex_image/webui/frontend/src/auth-source.ts
  var bridge8 = getLegacyBridge();
  var state8 = bridge8.state;
  var els9 = bridge8.els;
  function legacyMethod12(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus7(message, type) {
    legacyMethod12("setStatus", message, type);
  }
  function updateRequestPreview4() {
    legacyMethod12("updateRequestPreview");
  }
  function refreshAccountQuota(refresh) {
    return legacyMethod12("refreshAccountQuota", refresh);
  }
  function currentApiMode2() {
    return legacyMethod12("currentApiMode");
  }
  function currentApiProviderLabel() {
    return legacyMethod12("currentApiProviderLabel");
  }
  function apiModeLabel(mode) {
    return legacyMethod12("apiModeLabel", mode);
  }
  function openApiSettingsModal() {
    legacyMethod12("openApiSettingsModal");
  }
  async function refreshHealth() {
    try {
      const response = await fetch("/api/health");
      const data = await response.json();
      state8.authAvailable = Boolean(data.auth_available);
      state8.authStatus = data.auth || null;
      renderAuthSource(state8.authStatus);
      els9.apiStatus.className = `status-dot ${state8.authAvailable ? "ok" : "error"}`;
      els9.runButton.disabled = !state8.authAvailable;
      if (!state8.authAvailable) {
        setStatus7("\u6CA1\u6709\u68C0\u6D4B\u5230 Codex \u767B\u5F55\u6001", "error");
      }
      updateRequestPreview4();
    } catch (error) {
      state8.authAvailable = false;
      els9.apiStatus.className = "status-dot error";
      els9.runButton.disabled = true;
      setStatus7(error.message, "error");
    }
  }
  async function setAuthSource(source) {
    state8.pendingAuthSource = source;
    applyAuthSourceSelection(source);
    updateRequestPreview4();
    try {
      const response = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "\u6388\u6743\u6765\u6E90\u5207\u6362\u5931\u8D25");
      }
      state8.pendingAuthSource = null;
      state8.authStatus = data;
      state8.authAvailable = Boolean(data.auth_available);
      renderAuthSource(data);
      els9.apiStatus.className = `status-dot ${state8.authAvailable ? "ok" : "error"}`;
      els9.runButton.disabled = !state8.authAvailable;
      setStatus7(authSourceDetailText(data), state8.authAvailable ? "ok" : "error");
      await refreshAccountQuota(false);
      updateRequestPreview4();
    } catch (error) {
      state8.pendingAuthSource = null;
      renderAuthSource(state8.authStatus);
      updateRequestPreview4();
      setStatus7(error.message || "\u6388\u6743\u6765\u6E90\u5207\u6362\u5931\u8D25", "error");
    }
  }
  function handleAuthSourceClick(event) {
    const button = event.target.closest?.("[data-auth-source]");
    if (!button) return;
    const source = button.dataset.authSource;
    if (source === "api" && currentAuthSource2() === "api") {
      openApiSettingsModal();
      return;
    }
    setAuthSource(source);
  }
  function handleAuthSourceDoubleClick(event) {
    const button = event.target.closest?.("[data-auth-source]");
    if (!button || button.dataset.authSource !== "api") return;
    openApiSettingsModal();
  }
  function renderAuthSource(auth) {
    const selected = state8.pendingAuthSource || auth?.selected_source || "auto";
    applyAuthSourceSelection(selected);
    if (els9.authSourceDetail) {
      const text = auth ? authSourceDetailText(auth) : "\u6388\u6743\u68C0\u67E5\u4E2D";
      els9.authSourceDetail.textContent = text;
      els9.authSourceDetail.title = text;
    }
  }
  function applyAuthSourceSelection(source) {
    const selected = source || "auto";
    els9.authSourceGroup?.querySelectorAll("[data-auth-source]").forEach((button) => {
      const active = button.dataset.authSource === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    els9.accountQuotaButton?.classList.toggle("reserved-hidden", selected === "api");
    els9.accountQuotaButton?.setAttribute("aria-hidden", selected === "api" ? "true" : "false");
    if (selected === "api") {
      els9.accountQuotaButton?.setAttribute("aria-expanded", "false");
      els9.accountQuotaButton?.setAttribute("tabindex", "-1");
    } else {
      els9.accountQuotaButton?.removeAttribute("tabindex");
    }
    els9.apiProviderQuick?.classList.add("hidden");
    updateModeSpecificSettings(selected);
  }
  function authSourceDetailText(auth) {
    if (!auth) return "\u6388\u6743\u68C0\u67E5\u4E2D";
    const selected = sourceLabel(auth.selected_source);
    const effective = sourceLabel(auth.effective_source);
    const cockpitCount = auth.sources?.cockpit?.account_count || 0;
    const effectiveApi = auth.effective_source === "api";
    if (!auth.auth_available) {
      if (auth.selected_source === "api" || effectiveApi) {
        const provider = currentApiProviderLabel();
        return `${selected}${provider ? ` \xB7 ${provider}` : ""} \u4E0D\u53EF\u7528`;
      }
      return `${selected} \u4E0D\u53EF\u7528`;
    }
    if (auth.selected_source === "auto") {
      if (effectiveApi) {
        const provider = currentApiProviderLabel();
        const mode = apiModeLabel(currentApiMode2());
        return `\u81EA\u52A8 \u2192 ${effective}${provider ? ` \xB7 ${provider}` : ""} \xB7 ${mode}`;
      }
      return `\u81EA\u52A8 \u2192 ${effective}${auth.effective_source === "cockpit" ? ` \xB7 ${cockpitCount}\u4E2A\u8D26\u53F7` : ""}`;
    }
    if (effectiveApi) {
      const provider = currentApiProviderLabel();
      const mode = apiModeLabel(currentApiMode2());
      return `${effective}${provider ? ` \xB7 ${provider}` : ""} \xB7 ${mode}`;
    }
    return `${effective}${auth.effective_source === "cockpit" ? ` \xB7 ${cockpitCount}\u4E2A\u8D26\u53F7` : ""}`;
  }
  function sourceLabel(source) {
    if (source === "cockpit") return "Cockpit\u591A\u8D26\u53F7";
    if (source === "codex") return "Codex\u672C\u673A";
    if (source === "api") return "API";
    if (source === "auto") return "\u81EA\u52A8";
    return "\u672A\u751F\u6548";
  }
  function currentAuthSource2() {
    return state8.pendingAuthSource || state8.authStatus?.selected_source || "auto";
  }
  function isDirectApiMode(authSource = currentAuthSource2()) {
    return authSource === "api" && currentApiMode2() !== "responses";
  }

  // codex_image/webui/frontend/src/api-provider-settings.ts
  var bridge9 = getLegacyBridge();
  var state9 = bridge9.state;
  var els10 = bridge9.els;
  function legacyMethod13(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus8(message, type) {
    legacyMethod13("setStatus", message, type);
  }
  function updateRequestPreview5() {
    legacyMethod13("updateRequestPreview");
  }
  function closePromptPopover2() {
    legacyMethod13("closePromptPopover");
  }
  function normalizeApiProvider(provider = {}, index = 0) {
    const fallbackId = index === 0 ? "default" : `provider-${index + 1}`;
    const id = String(provider.id || fallbackId).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || fallbackId;
    return {
      id,
      name: String(provider.name || (id === "default" ? "Default" : `Provider ${index + 1}`)).trim() || id,
      base_url: String(provider.base_url || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL,
      api_key: String(provider.api_key || "").trim(),
      image_model: String(provider.image_model || DEFAULT_API_IMAGE_MODEL).trim() || DEFAULT_API_IMAGE_MODEL,
      api_mode: provider.api_mode === "responses" ? "responses" : DEFAULT_API_MODE,
      images_concurrency: normalizeApiImagesConcurrency(provider.images_concurrency),
      api_key_set: Boolean(provider.api_key_set || provider.api_key),
      api_key_masked: String(provider.api_key_masked || "")
    };
  }
  function normalizeApiImagesConcurrency(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return DEFAULT_API_IMAGES_CONCURRENCY;
    return Math.min(32, Math.max(1, parsed));
  }
  function normalizeApiSettings(settings = {}) {
    const rawProviders = Array.isArray(settings.providers) && settings.providers.length ? settings.providers : [{
      id: settings.active_provider_id || "default",
      name: settings.name || "Default",
      base_url: settings.base_url,
      api_key: settings.api_key,
      image_model: settings.image_model,
      api_mode: settings.api_mode,
      images_concurrency: settings.images_concurrency,
      api_key_set: settings.api_key_set,
      api_key_masked: settings.api_key_masked
    }];
    const providers = [];
    const seen = /* @__PURE__ */ new Set();
    rawProviders.forEach((provider, index) => {
      const normalized = normalizeApiProvider(provider, index);
      if (seen.has(normalized.id)) return;
      seen.add(normalized.id);
      providers.push(normalized);
    });
    if (!providers.length) providers.push(normalizeApiProvider({}, 0));
    const requestedActive = String(settings.active_provider_id || providers[0].id).trim().toLowerCase();
    const activeProvider = providers.find((provider) => provider.id === requestedActive) || providers[0];
    return {
      active_provider_id: activeProvider.id,
      providers
    };
  }
  function activeApiProvider() {
    const settings = normalizeApiSettings(state9.apiSettings);
    state9.apiSettings = settings;
    return settings.providers.find((provider) => provider.id === settings.active_provider_id) || settings.providers[0];
  }
  function restoreApiSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(API_SETTINGS_STORAGE_KEY) || "{}");
      state9.apiSettings = normalizeApiSettings(saved);
    } catch {
      state9.apiSettings = normalizeApiSettings();
    }
  }
  function persistApiSettings() {
    try {
      localStorage.setItem(API_SETTINGS_STORAGE_KEY, JSON.stringify({
        active_provider_id: state9.apiSettings.active_provider_id,
        providers: state9.apiSettings.providers
      }));
    } catch {
    }
  }
  function mergeApiProviderKeys(serverSettings) {
    const localById = new Map((state9.apiSettings.providers || []).map((provider) => [provider.id, provider]));
    const normalized = normalizeApiSettings(serverSettings);
    normalized.providers = normalized.providers.map((provider) => {
      const local = localById.get(provider.id);
      return local?.api_key ? { ...provider, api_key: local.api_key } : provider;
    });
    return normalized;
  }
  async function refreshApiSettings() {
    try {
      const response = await fetch("/api/api-settings");
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "API \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25");
      state9.apiSettings = mergeApiProviderKeys(data.settings || {});
      populateApiSettingsForm();
      updateModeSpecificSettings();
      updateRequestPreview5();
    } catch (error) {
      setApiSettingsFeedback(error.message || "API \u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25", "error");
    }
  }
  function populateApiSettingsForm() {
    const provider = activeApiProvider();
    if (els10.apiProviderQuick) {
      els10.apiProviderQuick.innerHTML = "";
      state9.apiSettings.providers.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name || item.id;
        els10.apiProviderQuick.append(option);
      });
      els10.apiProviderQuick.value = provider.id;
    }
    if (els10.apiProvider) {
      els10.apiProvider.innerHTML = "";
      state9.apiSettings.providers.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name || item.id;
        els10.apiProvider.append(option);
      });
      els10.apiProvider.value = provider.id;
    }
    if (els10.apiProviderName) els10.apiProviderName.value = provider.name || "";
    if (els10.apiBaseUrl) els10.apiBaseUrl.value = provider.base_url || DEFAULT_API_BASE_URL;
    if (els10.apiMode) {
      els10.apiMode.value = provider.api_mode || DEFAULT_API_MODE;
      els10.apiMode.dispatchEvent(new Event("change"));
    }
    if (els10.apiImageModel) els10.apiImageModel.value = provider.image_model || DEFAULT_API_IMAGE_MODEL;
    if (els10.apiImagesConcurrency) els10.apiImagesConcurrency.value = String(normalizeApiImagesConcurrency(provider.images_concurrency));
    if (els10.apiKey) {
      els10.apiKey.value = provider.api_key || "";
      els10.apiKey.placeholder = provider.api_key_set && !provider.api_key ? "\u540E\u7AEF\u5DF2\u4FDD\u5B58 API Key\uFF0C\u8F93\u5165\u65B0 key \u53EF\u8986\u76D6" : "sk-...";
    }
    if (els10.deleteApiProviderButton) {
      els10.deleteApiProviderButton.disabled = state9.apiSettings.providers.length <= 1;
    }
    updateModeSpecificSettings();
  }
  function readApiSettingsForm() {
    const settings = normalizeApiSettings(state9.apiSettings);
    const activeId = settings.active_provider_id;
    settings.providers = settings.providers.map((provider) => provider.id === activeId ? normalizeApiProvider({
      ...provider,
      name: els10.apiProviderName?.value || provider.name,
      base_url: els10.apiBaseUrl?.value || DEFAULT_API_BASE_URL,
      api_key: els10.apiKey?.value || "",
      api_mode: els10.apiMode?.value || DEFAULT_API_MODE,
      image_model: els10.apiImageModel?.value || DEFAULT_API_IMAGE_MODEL,
      images_concurrency: normalizeApiImagesConcurrency(els10.apiImagesConcurrency?.value)
    }, 0) : provider);
    state9.apiSettings = normalizeApiSettings(settings);
    return state9.apiSettings;
  }
  function currentApiProviderId() {
    return activeApiProvider().id;
  }
  function currentApiProviderLabel2() {
    const provider = activeApiProvider();
    return String(provider.name || provider.id || "").trim() || provider.id;
  }
  function addApiProvider() {
    readApiSettingsForm();
    const id = `provider-${Date.now()}`;
    state9.apiSettings.providers.push(normalizeApiProvider({
      id,
      name: "\u65B0\u4F9B\u5E94\u5546",
      base_url: DEFAULT_API_BASE_URL,
      image_model: DEFAULT_API_IMAGE_MODEL,
      api_mode: DEFAULT_API_MODE,
      images_concurrency: DEFAULT_API_IMAGES_CONCURRENCY
    }, state9.apiSettings.providers.length));
    state9.apiSettings.active_provider_id = id;
    populateApiSettingsForm();
    persistApiSettings();
    updateModeSpecificSettings();
    updateRequestPreview5();
  }
  function deleteApiProvider() {
    readApiSettingsForm();
    if (state9.apiSettings.providers.length <= 1) return;
    const activeId = state9.apiSettings.active_provider_id;
    state9.apiSettings.providers = state9.apiSettings.providers.filter((provider) => provider.id !== activeId);
    state9.apiSettings.active_provider_id = state9.apiSettings.providers[0]?.id || "default";
    populateApiSettingsForm();
    persistApiSettings();
    updateModeSpecificSettings();
    updateRequestPreview5();
  }
  function openApiSettingsModal2() {
    closePromptPopover2();
    populateApiSettingsForm();
    setApiSettingsFeedback("\u4FDD\u5B58\u540E\u7ACB\u5373\u7528\u4E8E API \u6A21\u5F0F", "");
    els10.apiSettingsModal?.classList.remove("hidden");
    els10.apiSettingsModal?.setAttribute("aria-hidden", "false");
    els10.apiBaseUrl?.focus();
  }
  function closeApiSettingsModal() {
    els10.apiSettingsModal?.classList.add("hidden");
    els10.apiSettingsModal?.setAttribute("aria-hidden", "true");
  }
  function currentApiImageModel() {
    return (activeApiProvider().image_model || DEFAULT_API_IMAGE_MODEL).trim() || DEFAULT_API_IMAGE_MODEL;
  }
  function currentApiMode3() {
    return activeApiProvider().api_mode === "responses" ? "responses" : DEFAULT_API_MODE;
  }
  function currentApiImagesConcurrency() {
    return normalizeApiImagesConcurrency(activeApiProvider().images_concurrency);
  }
  function apiModeLabel2(mode) {
    return mode === "responses" ? "Responses" : "\u76F4\u8FDE";
  }
  function backendForAuthSource(authSource, apiMode = currentApiMode3()) {
    return authSource === "api" ? apiMode === "responses" ? "openai_responses" : "openai_images" : "codex_responses";
  }
  function taskBackendValue(task) {
    return String(task?.backend || task?.requested_backend || "").trim();
  }
  function taskApiProviderId(task) {
    return String(
      task?.api_provider_id || task?.params?.api_provider_id || task?.request?.webui_api_provider_id || task?.request?.api_provider_id || ""
    ).trim();
  }
  function taskApiProviderLabel(task) {
    const providerId = taskApiProviderId(task);
    if (!providerId) return "";
    const providerName = String(
      task?.api_provider_name || task?.params?.api_provider_name || task?.request?.webui_api_provider_name || task?.request?.api_provider_name || ""
    ).trim();
    const configuredProvider = state9.apiSettings.providers.find((provider) => provider.id === providerId);
    const label = providerName || configuredProvider?.name || providerId;
    return label === providerId ? label : `${label} (${providerId})`;
  }
  function taskBackendLabel(task) {
    const backend = taskBackendValue(task);
    const provider = taskApiProviderLabel(task);
    return [backend, provider].filter(Boolean).join(" \xB7 ");
  }
  function setApiSettingsFeedback(message, type = "") {
    if (!els10.apiSettingsStatus) return;
    els10.apiSettingsStatus.textContent = message;
    els10.apiSettingsStatus.className = `api-settings-feedback ${type || ""}`.trim();
  }
  async function saveApiSettings() {
    if (!els10.saveApiSettingsButton) return;
    if (state9.apiSettingsSaveTimerId) {
      window.clearTimeout(state9.apiSettingsSaveTimerId);
      state9.apiSettingsSaveTimerId = null;
    }
    const settings = readApiSettingsForm();
    persistApiSettings();
    const payload = {
      active_provider_id: settings.active_provider_id,
      providers: settings.providers.map((provider) => {
        const item = {
          id: provider.id,
          name: provider.name,
          base_url: provider.base_url,
          image_model: provider.image_model,
          api_mode: provider.api_mode
        };
        item.images_concurrency = provider.images_concurrency;
        if (provider.api_key || !provider.api_key_set) item.api_key = provider.api_key;
        return item;
      })
    };
    els10.saveApiSettingsButton.disabled = true;
    els10.saveApiSettingsButton.textContent = "\u4FDD\u5B58\u4E2D...";
    setApiSettingsFeedback("\u6B63\u5728\u4FDD\u5B58 API \u8BBE\u7F6E...", "running");
    try {
      const response = await fetch("/api/api-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "API \u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25");
      state9.apiSettings = mergeApiProviderKeys(data.settings || {});
      persistApiSettings();
      populateApiSettingsForm();
      setApiSettingsFeedback(`\u5DF2\u4FDD\u5B58 \xB7 ${activeApiProvider().name} \xB7 ${apiModeLabel2(currentApiMode3())} \xB7 ${currentApiImageModel()} \xB7 \u5E76\u53D1 ${currentApiImagesConcurrency()}`, "ok");
      els10.saveApiSettingsButton.textContent = "\u5DF2\u4FDD\u5B58";
      state9.apiSettingsSaveTimerId = window.setTimeout(() => {
        els10.saveApiSettingsButton.textContent = "\u4FDD\u5B58 API \u8BBE\u7F6E";
        state9.apiSettingsSaveTimerId = null;
      }, 1600);
      setStatus8("API \u8BBE\u7F6E\u5DF2\u4FDD\u5B58", "ok");
      await refreshHealth();
      updateRequestPreview5();
    } catch (error) {
      setApiSettingsFeedback(error.message || "API \u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25", "error");
      els10.saveApiSettingsButton.textContent = "\u4FDD\u5B58\u5931\u8D25";
      setStatus8(error.message || "API \u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25", "error");
    } finally {
      els10.saveApiSettingsButton.disabled = false;
      if (!state9.apiSettingsSaveTimerId && els10.saveApiSettingsButton.textContent !== "\u4FDD\u5B58 API \u8BBE\u7F6E") {
        state9.apiSettingsSaveTimerId = window.setTimeout(() => {
          els10.saveApiSettingsButton.textContent = "\u4FDD\u5B58 API \u8BBE\u7F6E";
          state9.apiSettingsSaveTimerId = null;
        }, 1600);
      }
    }
  }

  // codex_image/webui/frontend/src/api-settings.ts
  var apiSettingsFeatureInitialized = false;
  function initApiSettingsFeature() {
    if (apiSettingsFeatureInitialized) return;
    apiSettingsFeatureInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      refreshHealth,
      setAuthSource,
      handleAuthSourceClick,
      handleAuthSourceDoubleClick,
      renderAuthSource,
      applyAuthSourceSelection,
      authSourceDetailText,
      sourceLabel,
      currentAuthSource: currentAuthSource2,
      isDirectApiMode,
      setModeSpecificElementVisibility,
      setModeSettingsVariant,
      updateModeSpecificSettings,
      normalizeApiProvider,
      normalizeApiImagesConcurrency,
      normalizeApiSettings,
      activeApiProvider,
      restoreApiSettings,
      persistApiSettings,
      mergeApiProviderKeys,
      refreshApiSettings,
      populateApiSettingsForm,
      readApiSettingsForm,
      currentApiProviderId,
      currentApiProviderLabel: currentApiProviderLabel2,
      addApiProvider,
      deleteApiProvider,
      openApiSettingsModal: openApiSettingsModal2,
      closeApiSettingsModal,
      currentApiImageModel,
      currentApiMode: currentApiMode3,
      currentApiImagesConcurrency,
      apiModeLabel: apiModeLabel2,
      backendForAuthSource,
      taskBackendValue,
      taskApiProviderId,
      taskApiProviderLabel,
      taskBackendLabel,
      setApiSettingsFeedback,
      saveApiSettings
    });
  }

  // codex_image/webui/frontend/src/account-quota.ts
  var bridge10 = getLegacyBridge();
  var state10 = bridge10.state;
  var els11 = bridge10.els;
  var accountQuotaFeatureInitialized = false;
  function legacyMethod14(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus9(message, type) {
    legacyMethod14("setStatus", message, type);
  }
  function escapeHtml8(value) {
    return legacyMethod14("escapeHtml", value);
  }
  async function refreshAccountQuota2(refresh = false) {
    try {
      const response = await fetch(`/api/accounts${refresh ? "?refresh=true" : ""}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u989D\u5EA6\u8BFB\u53D6\u5931\u8D25");
      state10.accountQuota = {
        items: Array.isArray(data.items) ? data.items : [],
        summary: data.summary || {},
        message: data.message || ""
      };
      renderAccountQuota();
      if (refresh) setStatus9("\u8D26\u53F7\u989D\u5EA6\u5DF2\u5237\u65B0", "ok");
    } catch (error) {
      if (els11.accountQuotaSummary) els11.accountQuotaSummary.textContent = error.message || "\u989D\u5EA6\u8BFB\u53D6\u5931\u8D25";
      setStatus9(error.message || "\u989D\u5EA6\u8BFB\u53D6\u5931\u8D25", "error");
    }
  }
  function renderAccountQuota() {
    const items = state10.accountQuota.items || [];
    const summary = state10.accountQuota.summary || {};
    const count = Number(summary.count || items.length || 0);
    if (els11.accountQuotaBadge) {
      els11.accountQuotaBadge.textContent = String(count);
      els11.accountQuotaBadge.classList.toggle("hidden", count === 0);
    }
    if (els11.accountQuotaSummary) {
      if (state10.accountQuota.message) {
        els11.accountQuotaSummary.textContent = state10.accountQuota.message;
      } else if (count) {
        const limited = Number(summary.limited_count || 0);
        const unknown = Number(summary.unknown_count || 0);
        const disabled = Number(summary.disabled_count || 0);
        const usableChannels = Number(summary.usable_channel_count ?? Math.max(0, count - disabled));
        els11.accountQuotaSummary.textContent = `\u8D26\u53F7 ${count} \xB7 \u53C2\u4E0E\u8F6E\u8BE2 ${usableChannels} \xB7 \u505C\u7528 ${disabled} \xB7 \u9650\u989D ${limited} \xB7 \u672A\u77E5 ${unknown}`;
      } else {
        els11.accountQuotaSummary.textContent = "\u6682\u65E0\u53EF\u7528\u672C\u5730\u8D26\u53F7";
      }
    }
    if (!els11.accountQuotaList) return;
    if (!items.length) {
      els11.accountQuotaList.innerHTML = `<div class="queue-empty">${escapeHtml8(state10.accountQuota.message || "\u6682\u65E0\u989D\u5EA6\u7F13\u5B58\uFF0C\u70B9\u51FB\u5237\u65B0\u989D\u5EA6")}</div>`;
      return;
    }
    els11.accountQuotaList.innerHTML = items.map((item) => accountQuotaCardHtml(item)).join("");
  }
  function accountQuotaCardHtml(item) {
    const status = String(item.status || "unknown");
    const manualDisabled = Boolean(item.manual_disabled);
    const displayStatus = manualDisabled ? "disabled" : status;
    const queueEnabled = item.queue_enabled !== false && !manualDisabled;
    const plan = item.plan && item.plan !== "unknown" ? item.plan : "\u672A\u77E5\u5957\u9910";
    const identity = item.email || item.user_id || item.account_id || item.account_key || "";
    const error = item.refresh_error ? `<div class="account-quota-error">${escapeHtml8(item.refresh_error)}</div>` : "";
    const canToggle = String(item.account_key || "").startsWith("cockpit:");
    const toggle = canToggle ? `
    <button
      class="account-quota-toggle${queueEnabled ? " active" : ""}"
      type="button"
      role="switch"
      aria-checked="${queueEnabled ? "true" : "false"}"
      aria-label="\u53C2\u4E0E\u8F6E\u8BE2\uFF1A${queueEnabled ? "\u5F00" : "\u5173"}"
      title="\u53C2\u4E0E\u8F6E\u8BE2\uFF1A${queueEnabled ? "\u5F00" : "\u5173"}"
      data-account-manual-disabled-key="${escapeHtml8(item.account_key || "")}"
      data-account-manual-disabled-value="${manualDisabled ? "true" : "false"}"
    >
      <span class="account-quota-switch-track" aria-hidden="true"></span>
    </button>
  ` : "";
    return `
    <article class="account-quota-card ${accountQuotaStatusClass(displayStatus)}">
      <div class="account-quota-card-head">
        <div>
          <div class="account-quota-name">${escapeHtml8(item.label || item.account_key || "\u8D26\u53F7")}</div>
          <div class="account-quota-meta">${escapeHtml8([plan, identity].filter(Boolean).join(" \xB7 "))}</div>
        </div>
        <span class="account-quota-status">${escapeHtml8(accountQuotaStatusText(displayStatus))}</span>
      </div>
      <div class="account-quota-limit-head">
        <div class="account-quota-limit-title">Codex \u989D\u5EA6</div>
        ${toggle}
      </div>
      ${accountQuotaLimitRowsHtml(item)}
      ${error}
    </article>
  `;
  }
  function accountQuotaLimitRowsHtml(item) {
    const rows = [
      ["5 \u5C0F\u65F6", item.codex_5h_percent, item.codex_limits?.five_hour?.reset_after],
      ["\u672C\u5468", item.codex_week_percent, item.codex_limits?.week?.reset_after]
    ];
    return `
    <div class="account-quota-limits">
      ${rows.map(([label, percent, resetAfter]) => accountQuotaLimitRowHtml(label, percent, resetAfter)).join("")}
    </div>
  `;
  }
  function accountQuotaLimitRowHtml(label, percent, resetAfter) {
    const normalized = accountQuotaPercentValue(percent);
    const percentText = normalized === null ? "\u672A\u77E5" : `${normalized}%`;
    const resetText = resetAfter ? `\u91CD\u7F6E ${resetAfter}` : "\u91CD\u7F6E\u65F6\u95F4\u672A\u77E5";
    const style = normalized === null ? "--quota-percent: 0%" : `--quota-percent: ${normalized}%`;
    return `
    <div class="account-quota-limit-row">
      <div class="account-quota-limit-label">
        <span>${escapeHtml8(label)}</span>
        <strong>${escapeHtml8(percentText)}</strong>
      </div>
      <div class="account-quota-limit-bar" style="${style}"><span></span></div>
      <div class="account-quota-reset">${escapeHtml8(resetText)}</div>
    </div>
  `;
  }
  function accountQuotaPercentValue(percent) {
    if (percent === null || percent === void 0 || percent === "") return null;
    const value = Number(percent);
    if (!Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, Math.round(value)));
  }
  function accountQuotaStatusClass(status) {
    if (status === "ok") return "ok";
    if (status === "limited") return "limited";
    if (status === "disabled") return "disabled";
    if (status === "error" || status === "disabled") return "error";
    return "unknown";
  }
  function accountQuotaStatusText(status) {
    if (status === "ok") return "\u53EF\u7528";
    if (status === "limited") return "\u5DF2\u9650\u989D";
    if (status === "error") return "\u5237\u65B0\u5931\u8D25";
    if (status === "disabled") return "\u5DF2\u505C\u7528";
    return "\u672A\u77E5";
  }
  async function toggleAccountQueueEnabled(accountKey, manualDisabled, button = null) {
    if (!accountKey) return;
    if (button) button.disabled = true;
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "manual_disabled": Boolean(manualDisabled) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u8D26\u53F7\u8BBE\u7F6E\u66F4\u65B0\u5931\u8D25");
      state10.accountQuota = {
        items: Array.isArray(data.items) ? data.items : [],
        summary: data.summary || {},
        message: data.message || ""
      };
      renderAccountQuota();
      await window.refreshQueue?.();
      setStatus9(manualDisabled ? "\u8D26\u53F7\u5DF2\u505C\u7528\uFF0C\u4E0D\u53C2\u4E0E\u8F6E\u8BE2" : "\u8D26\u53F7\u5DF2\u542F\u7528\uFF0C\u53C2\u4E0E\u8F6E\u8BE2", "ok");
    } catch (error) {
      setStatus9(error.message || "\u8D26\u53F7\u8BBE\u7F6E\u66F4\u65B0\u5931\u8D25", "error");
      if (button) button.disabled = false;
    }
  }
  function openAccountQuotaDrawer() {
    els11.accountQuotaDrawer?.classList.add("open");
    els11.accountQuotaDrawer?.setAttribute("aria-hidden", "false");
    els11.accountQuotaButton?.setAttribute("aria-expanded", "true");
    els11.accountQuotaDrawerBackdrop?.classList.remove("hidden");
    refreshAccountQuota2(false);
  }
  function closeAccountQuotaDrawer() {
    els11.accountQuotaDrawer?.classList.remove("open");
    els11.accountQuotaDrawer?.setAttribute("aria-hidden", "true");
    els11.accountQuotaButton?.setAttribute("aria-expanded", "false");
    els11.accountQuotaDrawerBackdrop?.classList.add("hidden");
  }
  function initAccountQuotaFeature() {
    if (accountQuotaFeatureInitialized) return;
    accountQuotaFeatureInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      refreshAccountQuota: refreshAccountQuota2,
      renderAccountQuota,
      accountQuotaCardHtml,
      accountQuotaLimitRowsHtml,
      accountQuotaLimitRowHtml,
      accountQuotaPercentValue,
      accountQuotaStatusClass,
      accountQuotaStatusText,
      toggleAccountQueueEnabled,
      openAccountQuotaDrawer,
      closeAccountQuotaDrawer
    });
  }

  // codex_image/webui/frontend/src/storage-settings.ts
  var bridge11 = getLegacyBridge();
  var els12 = bridge11.els;
  var storageSettingsFeatureInitialized = false;
  function legacyMethod15(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus10(message, type) {
    legacyMethod15("setStatus", message, type);
  }
  function closePromptPopover3() {
    legacyMethod15("closePromptPopover");
  }
  async function refreshSettings() {
    if (!els12.settingsInputRoot) return;
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25");
      populateSettingsForm(data.settings || {});
    } catch (error) {
      if (els12.settingsStatus) els12.settingsStatus.textContent = error.message || "\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25";
    }
  }
  function populateSettingsForm(settings) {
    if (els12.settingsInputRoot) els12.settingsInputRoot.value = settings.input_root || "";
    if (els12.settingsOutputRoot) els12.settingsOutputRoot.value = settings.output_root || "";
    if (els12.settingsGalleryRoot) els12.settingsGalleryRoot.value = settings.gallery_root || "";
    if (els12.settingsSourceDataRoot) els12.settingsSourceDataRoot.value = settings.source_data_root || "";
  }
  function openSettingsModal() {
    closePromptPopover3();
    refreshSettings();
    if (els12.settingsStatus) els12.settingsStatus.textContent = "\u4FDD\u5B58\u540E\u91CD\u542F WebUI \u751F\u6548";
    els12.settingsModal?.classList.remove("hidden");
    els12.settingsModal?.setAttribute("aria-hidden", "false");
  }
  function closeSettingsModal() {
    els12.settingsModal?.classList.add("hidden");
    els12.settingsModal?.setAttribute("aria-hidden", "true");
  }
  async function saveSettings() {
    if (!els12.saveSettingsButton) return;
    els12.saveSettingsButton.disabled = true;
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_root: els12.settingsInputRoot?.value || "",
          output_root: els12.settingsOutputRoot?.value || "",
          gallery_root: els12.settingsGalleryRoot?.value || "",
          source_data_root: els12.settingsSourceDataRoot?.value || ""
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25");
      populateSettingsForm(data.settings || {});
      if (els12.settingsStatus) {
        els12.settingsStatus.textContent = data.restart_required ? "\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F WebUI \u540E\u751F\u6548" : "\u5DF2\u4FDD\u5B58";
      }
      setStatus10("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F WebUI \u540E\u751F\u6548", "ok");
    } catch (error) {
      if (els12.settingsStatus) els12.settingsStatus.textContent = error.message || "\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25";
      setStatus10(error.message || "\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25", "error");
    } finally {
      els12.saveSettingsButton.disabled = false;
    }
  }
  function initStorageSettingsFeature() {
    if (storageSettingsFeatureInitialized) return;
    storageSettingsFeatureInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      refreshSettings,
      populateSettingsForm,
      openSettingsModal,
      closeSettingsModal,
      saveSettings
    });
  }

  // codex_image/webui/frontend/src/color-palette.ts
  var DEFAULT_COLOR_CODE = "#FFFFFF";
  var DEFAULT_COLOR_SWATCHES = ["#FFFFFF", "#111111", "#F6E8D8", "#E6F0EC", "#457B66", "#F4B183", "#B7D7F0", "#F8D7DA"];
  var DEFAULT_COLOR_SWATCH_NAMES = ["\u767D\u8272", "\u9ED1\u8272", "\u6696\u7C73\u8272", "\u6D45\u7EFF", "\u54C1\u724C\u7EFF", "\u6843\u6A59", "\u6D45\u84DD", "\u6D45\u7C89"];
  var COLOR_PALETTE_ENDPOINT = "/api/color-palette";
  var COLOR_PALETTE_IMPORT_ENDPOINT = "/api/color-palette/import";
  var bridge12 = getLegacyBridge();
  var state11 = bridge12.state;
  var els13 = bridge12.els;
  var colorPaletteInitialized = false;
  function legacyMethod16(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus11(message, type) {
    legacyMethod16("setStatus", message, type);
  }
  function renderColorSuggest(...args) {
    return legacyMethod16("renderColorSuggest", ...args);
  }
  function updateColorSuggest(...args) {
    return legacyMethod16("updateColorSuggest", ...args);
  }
  function defaultColorPalette() {
    return {
      version: 1,
      favorites: DEFAULT_COLOR_SWATCHES.map((hex, index) => ({
        name: DEFAULT_COLOR_SWATCH_NAMES[index] || `Color ${index + 1}`,
        hex,
        order: (index + 1) * 10
      })),
      recent_colors: [],
      recent_limit: 6
    };
  }
  function normalizeColorPalette(value) {
    const fallback = defaultColorPalette();
    const palette = value && typeof value === "object" ? value : {};
    const favorites = Array.isArray(palette.favorites) ? palette.favorites.map((item, index) => normalizeColorPaletteItem(item, index)).filter(Boolean) : fallback.favorites;
    const recentLimit = Number.isFinite(Number(palette.recent_limit)) ? Math.min(24, Math.max(0, Number.parseInt(palette.recent_limit, 10))) : fallback.recent_limit;
    const recentColors = Array.isArray(palette.recent_colors) ? dedupeColors(palette.recent_colors.map(normalizeHexColor).filter(Boolean)).slice(0, recentLimit) : [];
    return {
      version: 1,
      favorites,
      recent_colors: recentColors,
      recent_limit: recentLimit
    };
  }
  function normalizeColorPaletteItem(item, index) {
    if (!item || typeof item !== "object") return null;
    const hex = normalizeHexColor(item.hex);
    if (!hex) return null;
    return {
      name: String(item.name || `Color ${index + 1}`).trim() || `Color ${index + 1}`,
      hex,
      order: Number.isFinite(Number(item.order)) ? Number.parseInt(item.order, 10) : (index + 1) * 10
    };
  }
  function dedupeColors(colors) {
    const result = [];
    colors.forEach((color) => {
      if (color && !result.includes(color)) result.push(color);
    });
    return result;
  }
  async function refreshColorPalette() {
    try {
      const response = await fetch(COLOR_PALETTE_ENDPOINT);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u989C\u8272\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25");
      state11.colorPalette = normalizeColorPalette(data.palette);
      state11.selectedColorCode = state11.colorPalette.recent_colors[0] || favoriteColorsForDisplay()[0]?.hex || DEFAULT_COLOR_CODE;
      updateColorSuggest();
    } catch (error) {
      console.warn(error.message || "\u989C\u8272\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25");
      state11.colorPalette = defaultColorPalette();
    }
  }
  async function persistColorPalette(payload) {
    const response = await fetch(COLOR_PALETTE_ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "\u989C\u8272\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25");
    state11.colorPalette = normalizeColorPalette(data.palette);
    return state11.colorPalette;
  }
  async function importColorPalette(file) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(COLOR_PALETTE_IMPORT_ENDPOINT, {
      method: "POST",
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "\u989C\u8272\u914D\u7F6E\u5BFC\u5165\u5931\u8D25");
    state11.colorPalette = normalizeColorPalette(data.palette);
    renderColorSuggest({ query: state11.selectedColorCode.slice(1), range: state11.activeColorRange });
    els13.colorSuggest?.classList.remove("hidden");
    els13.promptEditor?.focus({ preventScroll: true });
    setStatus11(`\u5DF2\u5BFC\u5165 ${data.imported || 0} \u4E2A\u989C\u8272`, "ok");
  }
  function toggleColorPaletteManageMode() {
    state11.colorPaletteManageMode = !state11.colorPaletteManageMode;
    renderColorSuggest({ query: state11.selectedColorCode.slice(1), range: state11.activeColorRange });
    els13.colorSuggest?.classList.remove("hidden");
    els13.promptEditor?.focus({ preventScroll: true });
  }
  function favoriteColorsForDisplay() {
    const favorites = Array.isArray(state11.colorPalette?.favorites) ? state11.colorPalette.favorites : [];
    return Array.isArray(state11.colorPalette?.favorites) ? favorites : defaultColorPalette().favorites;
  }
  function recentColorsForDisplay() {
    const favoriteHex = new Set(favoriteColorsForDisplay().map((item) => item.hex));
    return (state11.colorPalette?.recent_colors || []).filter((color) => !favoriteHex.has(color));
  }
  function rememberRecentColor(colorCode) {
    const normalized = normalizeHexColor(colorCode);
    if (!normalized) return;
    const recentLimit = state11.colorPalette?.recent_limit ?? 6;
    const recentColors = dedupeColors([normalized, ...state11.colorPalette?.recent_colors || []]).slice(0, recentLimit);
    state11.colorPalette = { ...state11.colorPalette, recent_colors: recentColors };
    state11.selectedColorCode = normalized;
    void persistColorPalette({ recent_colors: recentColors }).catch((error) => {
      console.warn(error.message || "\u6700\u8FD1\u989C\u8272\u4FDD\u5B58\u5931\u8D25");
    });
  }
  async function saveFavoriteColor() {
    const input = els13.colorSuggest?.querySelector("[data-color-hex-input]");
    const nameInput = els13.colorSuggest?.querySelector("[data-color-name-input]");
    const normalized = normalizeHexColor(input?.value || state11.selectedColorCode);
    if (!normalized) return;
    const favorites = favoriteColorsForDisplay().filter((item) => item.hex !== normalized);
    favorites.push({
      name: String(nameInput?.value || normalized).trim() || normalized,
      hex: normalized,
      order: (favorites.length + 1) * 10
    });
    try {
      await persistColorPalette({ favorites });
      renderColorSuggest({ query: normalized.slice(1), range: state11.activeColorRange });
      els13.colorSuggest?.classList.remove("hidden");
      els13.promptEditor?.focus({ preventScroll: true });
    } catch (error) {
      console.warn(error.message || "\u5E38\u7528\u989C\u8272\u4FDD\u5B58\u5931\u8D25");
    }
  }
  async function removeFavoriteColor(colorCode) {
    const normalized = normalizeHexColor(colorCode);
    if (!normalized) return;
    const favorites = favoriteColorsForDisplay().filter((item) => item.hex !== normalized);
    try {
      await persistColorPalette({ favorites });
      renderColorSuggest({ query: state11.selectedColorCode.slice(1), range: state11.activeColorRange });
      els13.colorSuggest?.classList.remove("hidden");
      els13.promptEditor?.focus({ preventScroll: true });
    } catch (error) {
      console.warn(error.message || "\u5E38\u7528\u989C\u8272\u5220\u9664\u5931\u8D25");
    }
  }
  function normalizeHexColor(value) {
    const raw = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(raw)) {
      return `#${raw.split("").map((char) => char + char).join("").toUpperCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      return `#${raw.toUpperCase()}`;
    }
    return "";
  }
  function initColorPaletteFeature() {
    if (colorPaletteInitialized) return;
    colorPaletteInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      defaultColorPalette,
      normalizeColorPalette,
      normalizeColorPaletteItem,
      dedupeColors,
      refreshColorPalette,
      persistColorPalette,
      importColorPalette,
      toggleColorPaletteManageMode,
      favoriteColorsForDisplay,
      recentColorsForDisplay,
      rememberRecentColor,
      saveFavoriteColor,
      removeFavoriteColor,
      normalizeHexColor
    });
  }

  // codex_image/webui/frontend/src/prompt-popover-position.ts
  var PROMPT_POPOVER_MARGIN = 8;
  var PROMPT_POPOVER_GAP = 8;
  var PROMPT_POPOVER_MIN_HEIGHT = 88;
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function viewportSize() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 0,
      height: window.innerHeight || document.documentElement.clientHeight || 0
    };
  }
  function boundedPromptPopoverWidth(hostRect, options, viewportWidth) {
    const availableWidth = Math.max(
      0,
      Math.min(hostRect.width - PROMPT_POPOVER_MARGIN * 2, viewportWidth - PROMPT_POPOVER_MARGIN * 2)
    );
    const preferredWidth = Math.min(options.maxWidth, availableWidth);
    return Math.max(Math.min(options.minWidth, availableWidth), preferredWidth);
  }
  function positionPromptPopoverAtAnchor(popover, host, anchorRect, vars, options) {
    if (!popover || !host || !anchorRect) return;
    const hostRect = host.getBoundingClientRect();
    const viewport = viewportSize();
    const popupWidth = boundedPromptPopoverWidth(hostRect, options, viewport.width);
    const minLeft = Math.max(PROMPT_POPOVER_MARGIN, hostRect.left + PROMPT_POPOVER_MARGIN);
    const maxLeft = Math.max(
      minLeft,
      Math.min(
        viewport.width - popupWidth - PROMPT_POPOVER_MARGIN,
        hostRect.right - popupWidth - PROMPT_POPOVER_MARGIN
      )
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
      Math.min(options.maxHeight, Math.max(0, availableHeight))
    );
    const top = placeAbove ? Math.max(PROMPT_POPOVER_MARGIN, anchorRect.top - PROMPT_POPOVER_GAP - maxHeight) : Math.max(PROMPT_POPOVER_MARGIN, belowTop);
    popover.style.setProperty(vars.left, `${left}px`);
    popover.style.setProperty(vars.top, `${top}px`);
    popover.style.setProperty(vars.width, `${popupWidth}px`);
    popover.style.setProperty(vars.maxHeight, `${maxHeight}px`);
  }

  // codex_image/webui/frontend/src/prompt-colors.ts
  var DEFAULT_COLOR_CODE2 = "#FFFFFF";
  var COLOR_PALETTE_EXPORT_CSS_ENDPOINT = "/api/color-palette/export.css";
  var bridge13 = getLegacyBridge();
  var state12 = bridge13.state;
  var els14 = bridge13.els;
  function legacyMethod17(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml9(value) {
    return legacyMethod17("escapeHtml", value);
  }
  function setStatus12(message, type) {
    legacyMethod17("setStatus", message, type);
  }
  function normalizeHexColor2(value) {
    return legacyMethod17("normalizeHexColor", value);
  }
  function favoriteColorsForDisplay2() {
    return legacyMethod17("favoriteColorsForDisplay");
  }
  function recentColorsForDisplay2() {
    return legacyMethod17("recentColorsForDisplay");
  }
  function saveFavoriteColor2() {
    return legacyMethod17("saveFavoriteColor");
  }
  function toggleColorPaletteManageMode2() {
    legacyMethod17("toggleColorPaletteManageMode");
  }
  function importColorPalette2(file) {
    return legacyMethod17("importColorPalette", file);
  }
  function removeFavoriteColor2(colorCode) {
    return legacyMethod17("removeFavoriteColor", colorCode);
  }
  function rememberRecentColor2(colorCode) {
    legacyMethod17("rememberRecentColor", colorCode);
  }
  function getPromptText2() {
    return legacyMethod17("getPromptText");
  }
  function appendPromptText(text) {
    legacyMethod17("appendPromptText", text);
  }
  function syncPromptFromEditor() {
    legacyMethod17("syncPromptFromEditor");
  }
  function updatePromptCount2() {
    legacyMethod17("updatePromptCount");
  }
  function updateRequestPreview6() {
    legacyMethod17("updateRequestPreview");
  }
  function mentionRangeRect(range) {
    return legacyMethod17("mentionRangeRect", range);
  }
  function syncPromptAfterChipMutation() {
    legacyMethod17("syncPromptAfterChipMutation");
  }
  function setCaretAfterNode(node) {
    legacyMethod17("setCaretAfterNode", node);
  }
  function removePromptGalleryChip(chip) {
    legacyMethod17("removePromptGalleryChip", chip);
  }
  function updateColorSuggest2() {
    if (!els14.colorSuggest || !els14.promptEditor) return;
    const match = activeColorMatch();
    if (!match) {
      hideColorSuggest();
      return;
    }
    renderColorSuggest2(match);
    positionColorSuggestAtCaret(match);
    els14.colorSuggest.classList.remove("hidden");
  }
  function activeColorMatch() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !els14.promptEditor) return null;
    if (!els14.promptEditor.contains(selection.anchorNode)) return null;
    const selectionRange = selection.getRangeAt(0);
    let container = selectionRange.startContainer;
    let offset = selectionRange.startOffset;
    if (container.nodeType === Node.ELEMENT_NODE) {
      const previousNode = container.childNodes[offset - 1];
      if (previousNode?.nodeType !== Node.TEXT_NODE) return null;
      container = previousNode;
      offset = (previousNode.textContent || "").length;
    }
    if (container.nodeType !== Node.TEXT_NODE) return null;
    const textBeforeCaret = (container.textContent || "").slice(0, offset);
    const match = textBeforeCaret.match(/#([0-9a-fA-F]{0,6})$/);
    if (!match) return null;
    const tokenStart = offset - match[0].length;
    const range = document.createRange();
    range.setStart(container, tokenStart);
    range.setEnd(container, offset);
    return {
      query: match[1] || "",
      range
    };
  }
  function renderColorSuggest2(match) {
    if (!els14.colorSuggest) return;
    state12.activeColorRange = match.range ? match.range.cloneRange() : null;
    const queryColor = match.query ? normalizeHexColor2(`#${match.query}`) : "";
    const favoriteColors = favoriteColorsForDisplay2();
    const recentColors = recentColorsForDisplay2();
    const selected = queryColor || state12.selectedColorCode || recentColors[0] || favoriteColors[0]?.hex || DEFAULT_COLOR_CODE2;
    state12.selectedColorCode = selected;
    const typedValue = match.query ? `#${match.query.toUpperCase()}` : selected;
    const actionLabel = state12.activeColorChip ? "\u66F4\u65B0" : "\u63D2\u5165";
    const swatchRowClass = state12.colorPaletteManageMode ? "color-swatch-row is-managing" : "color-swatch-row";
    els14.colorSuggest.innerHTML = `
    <div class="color-suggest-main">
      <label class="color-picker-control" title="\u9009\u62E9\u989C\u8272">
        <input type="color" value="${escapeHtml9(selected)}" data-color-picker>
        <span>\u53D6\u8272</span>
      </label>
      <input class="color-hex-input" type="text" value="${escapeHtml9(typedValue)}" maxlength="7" spellcheck="false" data-color-hex-input>
      <button class="ghost-button text-sm color-insert-button" type="button" data-insert-color>${actionLabel}</button>
    </div>
    <div class="color-suggest-actions">
      <input class="color-name-input" type="text" value="${escapeHtml9(colorNameForHex(selected) || "")}" maxlength="48" spellcheck="false" placeholder="\u5E38\u7528\u8272\u540D\u79F0" data-color-name-input>
      <button class="ghost-button text-sm" type="button" data-save-favorite-color>\u4FDD\u5B58</button>
      <a class="ghost-button text-sm color-export-link" href="${COLOR_PALETTE_EXPORT_CSS_ENDPOINT}" target="_blank" rel="noopener" data-color-palette-export>\u5BFC\u51FA PS</a>
      <label class="ghost-button text-sm color-import-label" data-color-palette-import>
        \u5BFC\u5165 PS
        <input class="color-import-input" type="file" accept=".aco,.css,.html,.htm,.svg,.txt" data-color-palette-import-input>
      </label>
      <button class="ghost-button text-sm color-manage-button" type="button" aria-pressed="${state12.colorPaletteManageMode ? "true" : "false"}" data-color-palette-manage>${state12.colorPaletteManageMode ? "\u5B8C\u6210" : "\u7BA1\u7406"}</button>
    </div>
    <div class="${swatchRowClass}" aria-label="\u5E38\u7528\u989C\u8272">
      ${favoriteColors.map((item) => colorSwatchButton(item.hex, item.name, { removable: state12.colorPaletteManageMode })).join("")}
    </div>
    ${recentColors.length ? `
      <div class="color-recent-row" aria-label="\u6700\u8FD1\u989C\u8272">
        ${recentColors.map((color) => colorSwatchButton(color, "\u6700\u8FD1")).join("")}
      </div>
    ` : ""}
  `;
    bindColorSuggestEvents();
  }
  function colorNameForHex(colorCode) {
    const normalized = normalizeHexColor2(colorCode);
    if (!normalized) return "";
    return favoriteColorsForDisplay2().find((item) => item.hex === normalized)?.name || "";
  }
  function colorSwatchButton(color, label = "", { removable = false } = {}) {
    const normalized = normalizeHexColor2(color) || DEFAULT_COLOR_CODE2;
    return `
    <span class="color-swatch-item">
      <button class="color-swatch-button" type="button" title="${escapeHtml9(label ? `${label} ${normalized}` : normalized)}" data-color-swatch="${escapeHtml9(normalized)}" style="--swatch-color: ${escapeHtml9(normalized)}">
        <span>${escapeHtml9(label ? `${label} ${normalized}` : normalized)}</span>
      </button>
      ${removable ? `<button class="color-swatch-remove" type="button" title="\u5220\u9664\u5E38\u7528\u8272 ${escapeHtml9(label || normalized)}" aria-label="\u5220\u9664\u5E38\u7528\u8272 ${escapeHtml9(label || normalized)}" data-remove-favorite-color="${escapeHtml9(normalized)}">\xD7</button>` : ""}
    </span>
  `;
  }
  function bindColorSuggestEvents() {
    if (!els14.colorSuggest) return;
    const picker = els14.colorSuggest.querySelector("[data-color-picker]");
    const input = els14.colorSuggest.querySelector("[data-color-hex-input]");
    const nameInput = els14.colorSuggest.querySelector("[data-color-name-input]");
    const insert = els14.colorSuggest.querySelector("[data-insert-color]");
    const keepPromptFocus = (event) => event.preventDefault();
    const syncColor = (value) => {
      const normalized = normalizeHexColor2(value);
      if (!normalized) return;
      state12.selectedColorCode = normalized;
      if (picker) picker.value = normalized;
      if (input) input.value = normalized;
      if (nameInput) nameInput.value = colorNameForHex(normalized) || "";
    };
    picker?.addEventListener("input", () => syncColor(picker.value));
    input?.addEventListener("input", () => {
      const normalized = normalizeHexColor2(input.value);
      if (!normalized) return;
      state12.selectedColorCode = normalized;
      if (picker) picker.value = normalized;
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        insertColorCode(input.value);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hideColorSuggest();
        els14.promptEditor?.focus();
      }
    });
    insert?.addEventListener("pointerdown", keepPromptFocus);
    insert?.addEventListener("mousedown", keepPromptFocus);
    insert?.addEventListener("click", () => insertColorCode(input?.value || state12.selectedColorCode));
    const saveFavorite = els14.colorSuggest.querySelector("[data-save-favorite-color]");
    saveFavorite?.addEventListener("pointerdown", keepPromptFocus);
    saveFavorite?.addEventListener("mousedown", keepPromptFocus);
    saveFavorite?.addEventListener("click", (event) => {
      event.stopPropagation();
      saveFavoriteColor2();
    });
    const manageFavorite = els14.colorSuggest.querySelector("[data-color-palette-manage]");
    manageFavorite?.addEventListener("pointerdown", keepPromptFocus);
    manageFavorite?.addEventListener("mousedown", keepPromptFocus);
    manageFavorite?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleColorPaletteManageMode2();
    });
    const importInput = els14.colorSuggest.querySelector("[data-color-palette-import-input]");
    importInput?.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        await importColorPalette2(file);
      } catch (error) {
        setStatus12(error.message || "\u989C\u8272\u914D\u7F6E\u5BFC\u5165\u5931\u8D25", "error");
        console.warn(error.message || "\u989C\u8272\u914D\u7F6E\u5BFC\u5165\u5931\u8D25");
      } finally {
        importInput.value = "";
      }
    });
    els14.colorSuggest.querySelectorAll("[data-color-swatch]").forEach((button) => {
      button.addEventListener("pointerdown", keepPromptFocus);
      button.addEventListener("mousedown", keepPromptFocus);
      button.addEventListener("click", () => insertColorCode(button.dataset.colorSwatch));
    });
    els14.colorSuggest.querySelectorAll("[data-remove-favorite-color]").forEach((button) => {
      button.addEventListener("pointerdown", keepPromptFocus);
      button.addEventListener("mousedown", keepPromptFocus);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeFavoriteColor2(button.dataset.removeFavoriteColor);
      });
    });
  }
  function insertColorCode(colorCode) {
    const normalized = normalizeHexColor2(colorCode) || state12.selectedColorCode || DEFAULT_COLOR_CODE2;
    if (state12.activeColorChip && els14.promptEditor?.contains(state12.activeColorChip)) {
      const chip = state12.activeColorChip;
      updateColorChip(chip, normalized);
      rememberRecentColor2(normalized);
      syncPromptAfterChipMutation();
      setCaretAfterNode(chip);
      return;
    }
    let match = activeColorMatch();
    if (!match?.range && state12.activeColorRange) {
      match = { query: "", range: state12.activeColorRange };
    }
    let trailingSpace = null;
    if (match?.range) {
      match.range.deleteContents();
      const chip = createColorChip(normalized);
      trailingSpace = document.createTextNode(" ");
      match.range.insertNode(chip);
      chip.after(trailingSpace);
    } else {
      const currentText = getPromptText2();
      if (currentText && !/\s$/.test(currentText)) {
        appendPromptText(" ");
      }
      els14.promptEditor.append(createColorChip(normalized));
      trailingSpace = document.createTextNode(" ");
      els14.promptEditor.append(trailingSpace);
    }
    rememberRecentColor2(normalized);
    syncPromptFromEditor();
    updatePromptCount2();
    updateRequestPreview6();
    hideColorSuggest();
    setCaretAfterNode(trailingSpace);
  }
  function positionColorSuggestAtCaret(match) {
    if (!els14.colorSuggest || !els14.promptEditor || !match?.range) return;
    const host = els14.promptEditor.closest(".prompt-editor-wrap") || els14.promptEditor;
    const anchorRect = mentionRangeRect(match.range) || els14.promptEditor.getBoundingClientRect();
    positionPromptPopoverAtAnchor(
      els14.colorSuggest,
      host,
      anchorRect,
      {
        left: "--color-left",
        top: "--color-top",
        width: "--color-width",
        maxHeight: "--prompt-popover-max-height"
      },
      { minWidth: 260, maxWidth: 360, maxHeight: 300, minVisibleHeight: 150 }
    );
  }
  function openColorChipEditor(chip) {
    if (!chip || !els14.promptEditor?.contains(chip)) return;
    const normalized = normalizeHexColor2(chip.dataset.colorCode) || DEFAULT_COLOR_CODE2;
    state12.activeColorChip = chip;
    state12.activeColorRange = null;
    state12.selectedColorCode = normalized;
    renderColorSuggest2({ query: normalized.slice(1), range: null });
    positionColorSuggestAtChip(chip);
    els14.colorSuggest?.classList.remove("hidden");
  }
  function positionColorSuggestAtChip(chip) {
    if (!els14.colorSuggest || !els14.promptEditor || !chip) return;
    const host = els14.promptEditor.closest(".prompt-editor-wrap") || els14.promptEditor;
    const chipRect = chip.getBoundingClientRect();
    positionPromptPopoverAtAnchor(
      els14.colorSuggest,
      host,
      chipRect,
      {
        left: "--color-left",
        top: "--color-top",
        width: "--color-width",
        maxHeight: "--prompt-popover-max-height"
      },
      { minWidth: 260, maxWidth: 360, maxHeight: 300, minVisibleHeight: 150 }
    );
  }
  function createColorChip(colorCode) {
    const normalized = normalizeHexColor2(colorCode) || DEFAULT_COLOR_CODE2;
    const chip = document.createElement("span");
    chip.className = "color-chip";
    chip.contentEditable = "false";
    chip.tabIndex = 0;
    chip.draggable = true;
    chip.dataset.promptChip = "color";
    chip.dataset.colorCode = normalized;
    chip.style.setProperty("--color-code", normalized);
    chip.style.setProperty("--color-text", readableTextColor(normalized));
    const swatch = document.createElement("button");
    swatch.className = "color-chip-swatch";
    swatch.type = "button";
    swatch.setAttribute("data-edit-color-chip", "");
    swatch.setAttribute("aria-label", `\u4FEE\u6539\u989C\u8272 ${normalized}`);
    swatch.title = "\u4FEE\u6539\u989C\u8272";
    const label = document.createElement("span");
    label.className = "color-chip-label";
    label.textContent = normalized;
    const remove = document.createElement("button");
    remove.className = "color-chip-remove";
    remove.type = "button";
    remove.setAttribute("data-remove-color-chip", "");
    remove.setAttribute("aria-label", `\u79FB\u9664\u989C\u8272 ${normalized}`);
    remove.textContent = "\xD7";
    chip.append(swatch, label, remove);
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removePromptGalleryChip(chip);
      }
    });
    return chip;
  }
  function updateColorChip(chip, colorCode) {
    const normalized = normalizeHexColor2(colorCode) || DEFAULT_COLOR_CODE2;
    chip.dataset.colorCode = normalized;
    chip.style.setProperty("--color-code", normalized);
    chip.style.setProperty("--color-text", readableTextColor(normalized));
    const label = chip.querySelector(".color-chip-label");
    if (label) label.textContent = normalized;
    const swatch = chip.querySelector("[data-edit-color-chip]");
    if (swatch) {
      swatch.setAttribute("aria-label", `\u4FEE\u6539\u989C\u8272 ${normalized}`);
    }
    const remove = chip.querySelector("[data-remove-color-chip]");
    if (remove) {
      remove.setAttribute("aria-label", `\u79FB\u9664\u989C\u8272 ${normalized}`);
    }
  }
  function readableTextColor(colorCode) {
    const normalized = normalizeHexColor2(colorCode);
    if (!normalized) return "var(--text)";
    const mixedBackground = mixRgbWithWhite(hexToRgb(normalized), 0.22);
    const darkText = hexToRgb("#1f352f");
    const whiteText = hexToRgb("#ffffff");
    return contrastRatio(mixedBackground, darkText) >= contrastRatio(mixedBackground, whiteText) ? "#1f352f" : "#ffffff";
  }
  function hexToRgb(colorCode) {
    return [
      Number.parseInt(colorCode.slice(1, 3), 16),
      Number.parseInt(colorCode.slice(3, 5), 16),
      Number.parseInt(colorCode.slice(5, 7), 16)
    ];
  }
  function mixRgbWithWhite(rgb, colorWeight) {
    return rgb.map((channel) => Math.round(channel * colorWeight + 255 * (1 - colorWeight)));
  }
  function relativeLuminance(rgb) {
    const [red, green, blue] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  function contrastRatio(leftRgb, rightRgb) {
    const left = relativeLuminance(leftRgb);
    const right = relativeLuminance(rightRgb);
    const lighter = Math.max(left, right);
    const darker = Math.min(left, right);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function hideColorSuggest() {
    if (!els14.colorSuggest) return;
    els14.colorSuggest.classList.add("hidden");
    els14.colorSuggest.innerHTML = "";
    state12.activeColorRange = null;
    state12.activeColorChip = null;
    state12.colorPaletteManageMode = false;
    els14.colorSuggest.style.removeProperty("--color-left");
    els14.colorSuggest.style.removeProperty("--color-top");
    els14.colorSuggest.style.removeProperty("--color-width");
    els14.colorSuggest.style.removeProperty("--prompt-popover-max-height");
  }
  function initPromptColorsFeature() {
    Object.assign(getLegacyBridge().methods, {
      updateColorSuggest: updateColorSuggest2,
      activeColorMatch,
      renderColorSuggest: renderColorSuggest2,
      bindColorSuggestEvents,
      insertColorCode,
      positionColorSuggestAtCaret,
      openColorChipEditor,
      positionColorSuggestAtChip,
      colorNameForHex,
      colorSwatchButton,
      createColorChip,
      updateColorChip,
      readableTextColor,
      hexToRgb,
      mixRgbWithWhite,
      relativeLuminance,
      contrastRatio,
      hideColorSuggest
    });
  }

  // codex_image/webui/frontend/src/prompt-snippets.ts
  var PROMPT_SNIPPETS_ENDPOINT = "/api/prompt-snippets";
  var PROMPT_SNIPPET_TRIGGER_CHARS = "~\uFF5E\u301C\u223C\u02DC";
  var PROMPT_SNIPPET_BOUNDARY_CHARS = `\uFF0C\u3002,.\uFF1B;\uFF1A:\uFF01\uFF1F!?\u3001\uFF08\uFF09()[]\u3010\u3011"'\u201C\u201D\u2018\u2019`;
  var PROMPT_SNIPPET_TRIGGER_PATTERN = /(^|[\s\n，。,.；;：:！？!?、（）()\[\]【】"'“”‘’])([~～〜∼˜]+)([^\s~～〜∼˜@#，。,.；;：:！？!?、（）()\[\]【】"'“”‘’]*)$/;
  var bridge14 = getLegacyBridge();
  var state13 = bridge14.state;
  var els15 = bridge14.els;
  var promptSnippetSuggestEl = null;
  var promptSnippetSelectionButtonEl = null;
  var promptSnippetPopoverEl = null;
  var promptSnippetPopoverState = {
    mode: null,
    chip: null,
    snippetId: null
  };
  function legacyMethod18(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml10(value) {
    return legacyMethod18("escapeHtml", value);
  }
  function setStatus13(message, type) {
    legacyMethod18("setStatus", message, type);
  }
  function getPromptText3() {
    return legacyMethod18("getPromptText");
  }
  function promptTextFromRange(range) {
    return legacyMethod18("promptTextFromRange", range);
  }
  function rangeIntersectsNode(range, node) {
    return legacyMethod18("rangeIntersectsNode", range, node);
  }
  function appendPromptText2(text) {
    legacyMethod18("appendPromptText", text);
  }
  function mentionRangeRect2(range) {
    return legacyMethod18("mentionRangeRect", range);
  }
  function removePromptGalleryChip2(chip) {
    legacyMethod18("removePromptGalleryChip", chip);
  }
  function syncPromptAfterChipMutation2() {
    legacyMethod18("syncPromptAfterChipMutation");
  }
  function setCaretAfterNode2(node) {
    legacyMethod18("setCaretAfterNode", node);
  }
  function normalizePromptSnippet(value) {
    if (!value || typeof value !== "object") return null;
    const tag = String(value.tag || "").trim().replace(/^[~～〜∼˜]+/, "");
    const content = String(value.content || "").trim();
    if (!tag || !content) return null;
    return {
      id: String(value.id || tag).trim() || tag,
      tag,
      title: String(value.title || tag).trim() || tag,
      content,
      category: String(value.category || "\u5E38\u7528").trim() || "\u5E38\u7528",
      order: Number.isFinite(Number(value.order)) ? Number.parseInt(value.order, 10) : 0,
      created_at: value.created_at || "",
      updated_at: value.updated_at || ""
    };
  }
  function normalizePromptSnippetList(items) {
    return (Array.isArray(items) ? items : []).map(normalizePromptSnippet).filter(Boolean).sort((left, right) => left.order - right.order || left.tag.localeCompare(right.tag, "zh-Hans-CN"));
  }
  function isPromptSnippetTriggerChar(value) {
    return PROMPT_SNIPPET_TRIGGER_CHARS.includes(String(value || ""));
  }
  function isPromptSnippetBoundaryChar(value) {
    return !value || /\s/.test(String(value)) || PROMPT_SNIPPET_BOUNDARY_CHARS.includes(String(value));
  }
  function normalizePromptSnippetTrigger(value) {
    return String(value || "").split("").some((char) => isPromptSnippetTriggerChar(char)) ? "~" : "";
  }
  async function refreshPromptSnippets() {
    try {
      const response = await fetch(PROMPT_SNIPPETS_ENDPOINT);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u7247\u6BB5\u8BFB\u53D6\u5931\u8D25");
      state13.promptSnippets = normalizePromptSnippetList(data.snippets);
      updatePromptSnippetSuggest();
    } catch (error) {
      console.warn(error.message || "\u63D0\u793A\u8BCD\u7247\u6BB5\u8BFB\u53D6\u5931\u8D25");
      state13.promptSnippets = [];
    }
  }
  function promptSnippetSuggestElement() {
    if (promptSnippetSuggestEl) return promptSnippetSuggestEl;
    promptSnippetSuggestEl = document.createElement("div");
    promptSnippetSuggestEl.className = "prompt-snippet-suggest hidden";
    promptSnippetSuggestEl.setAttribute("aria-label", "\u63D0\u793A\u8BCD\u7247\u6BB5\u9009\u62E9\u5668");
    els15.promptEditor?.closest(".prompt-editor-wrap")?.appendChild(promptSnippetSuggestEl);
    return promptSnippetSuggestEl;
  }
  function promptSnippetSelectionButtonElement() {
    if (promptSnippetSelectionButtonEl) return promptSnippetSelectionButtonEl;
    promptSnippetSelectionButtonEl = document.createElement("button");
    promptSnippetSelectionButtonEl.className = "prompt-snippet-save-button hidden";
    promptSnippetSelectionButtonEl.type = "button";
    promptSnippetSelectionButtonEl.textContent = "\u6536\u85CF";
    promptSnippetSelectionButtonEl.setAttribute("aria-label", "\u6536\u85CF\u9009\u4E2D\u7684\u63D0\u793A\u8BCD\u7247\u6BB5");
    promptSnippetSelectionButtonEl.addEventListener("mousedown", (event) => event.preventDefault());
    promptSnippetSelectionButtonEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPromptSnippetSavePopover();
    });
    els15.promptEditor?.closest(".prompt-editor-wrap")?.appendChild(promptSnippetSelectionButtonEl);
    return promptSnippetSelectionButtonEl;
  }
  function promptSnippetPopoverElement() {
    if (promptSnippetPopoverEl) return promptSnippetPopoverEl;
    promptSnippetPopoverEl = document.createElement("div");
    promptSnippetPopoverEl.className = "prompt-snippet-popover hidden";
    promptSnippetPopoverEl.setAttribute("role", "dialog");
    promptSnippetPopoverEl.setAttribute("aria-label", "\u63D0\u793A\u8BCD\u7247\u6BB5");
    els15.promptEditor?.closest(".prompt-editor-wrap")?.appendChild(promptSnippetPopoverEl);
    return promptSnippetPopoverEl;
  }
  function activePromptSnippetMatch() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !els15.promptEditor) return null;
    if (!els15.promptEditor.contains(selection.anchorNode)) return null;
    const selectionRange = selection.getRangeAt(0);
    let container = selectionRange.startContainer;
    let offset = selectionRange.startOffset;
    if (container.nodeType === Node.ELEMENT_NODE) {
      const previousNode = container.childNodes[offset - 1];
      if (previousNode?.nodeType !== Node.TEXT_NODE) return null;
      container = previousNode;
      offset = (previousNode.textContent || "").length;
    }
    if (container.nodeType !== Node.TEXT_NODE) return null;
    const textBeforeCaret = (container.textContent || "").slice(0, offset);
    const match = textBeforeCaret.match(PROMPT_SNIPPET_TRIGGER_PATTERN);
    if (!match) return null;
    if (!normalizePromptSnippetTrigger(match[2])) return null;
    const token = `${match[2]}${match[3] || ""}`;
    const tokenStart = offset - token.length;
    const range = document.createRange();
    range.setStart(container, tokenStart);
    range.setEnd(container, offset);
    return {
      query: match[3] || "",
      range
    };
  }
  function updatePromptSnippetSuggest() {
    const suggest = promptSnippetSuggestElement();
    if (!suggest || !els15.promptEditor) return;
    const match = activePromptSnippetMatch();
    if (!match) {
      hidePromptSnippetSuggest();
      return;
    }
    const query = match.query.toLowerCase();
    const snippets = promptSnippetsForQuery(query).slice(0, 8);
    if (!snippets.length) {
      hidePromptSnippetSuggest();
      return;
    }
    state13.activePromptSnippetRange = match.range.cloneRange();
    suggest.innerHTML = snippets.map((snippet) => `
    <button type="button" class="prompt-snippet-option" data-prompt-snippet-id="${escapeHtml10(snippet.id)}">
      <span class="prompt-snippet-option-tag">~${escapeHtml10(snippet.tag)}</span>
      <span class="prompt-snippet-option-main">
        <span>${escapeHtml10(snippet.title)}</span>
        <small>${escapeHtml10(promptSnippetPreview(snippet.content))}</small>
      </span>
      <small>${escapeHtml10(snippet.category)}</small>
    </button>
  `).join("");
    suggest.querySelectorAll("[data-prompt-snippet-id]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const snippet = findPromptSnippetById(button.dataset.promptSnippetId);
        if (snippet) insertPromptSnippet(snippet);
      });
    });
    positionPromptSnippetSuggestAtCaret(match);
    suggest.classList.remove("hidden");
  }
  function promptSnippetsForQuery(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return state13.promptSnippets.slice();
    return state13.promptSnippets.filter((snippet) => snippet.tag.toLowerCase().includes(normalized) || snippet.title.toLowerCase().includes(normalized) || snippet.content.toLowerCase().includes(normalized));
  }
  function promptSnippetPreview(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
  }
  function positionPromptSnippetSuggestAtCaret(match) {
    const suggest = promptSnippetSuggestElement();
    if (!suggest || !els15.promptEditor || !match?.range) return;
    const host = els15.promptEditor.closest(".prompt-editor-wrap") || els15.promptEditor;
    const anchorRect = mentionRangeRect2(match.range) || els15.promptEditor.getBoundingClientRect();
    positionPromptPopoverAtAnchor(
      suggest,
      host,
      anchorRect,
      {
        left: "--prompt-snippet-left",
        top: "--prompt-snippet-top",
        width: "--prompt-snippet-width",
        maxHeight: "--prompt-popover-max-height"
      },
      { minWidth: 260, maxWidth: 380, maxHeight: 260 }
    );
  }
  function insertPromptSnippet(snippet) {
    const normalized = normalizePromptSnippet(snippet);
    if (!normalized || !els15.promptEditor) return;
    let match = activePromptSnippetMatch();
    if (!match?.range && state13.activePromptSnippetRange) {
      match = { query: "", range: state13.activePromptSnippetRange };
    }
    let trailingSpace = null;
    if (match?.range) {
      match.range.deleteContents();
      const chip = createPromptSnippetChip(normalized);
      trailingSpace = document.createTextNode(" ");
      match.range.insertNode(chip);
      chip.after(trailingSpace);
    } else {
      const currentText = getPromptText3();
      if (currentText && !/\s$/.test(currentText)) appendPromptText2(" ");
      els15.promptEditor.append(createPromptSnippetChip(normalized));
      trailingSpace = document.createTextNode(" ");
      els15.promptEditor.append(trailingSpace);
    }
    syncPromptAfterChipMutation2();
    hidePromptSnippetSuggest();
    setCaretAfterNode2(trailingSpace);
  }
  function createPromptSnippetChip(snippet) {
    const normalized = normalizePromptSnippet(snippet) || {
      id: "",
      tag: "",
      title: "",
      content: "",
      category: "\u5E38\u7528"
    };
    const chip = document.createElement("span");
    chip.className = "prompt-snippet-chip";
    chip.contentEditable = "false";
    chip.tabIndex = 0;
    chip.draggable = true;
    chip.dataset.promptChip = "snippet";
    chip.dataset.promptSnippetId = normalized.id;
    chip.dataset.promptSnippetTag = normalized.tag;
    chip.dataset.promptSnippetTitle = normalized.title;
    chip.dataset.promptSnippetContent = normalized.content;
    chip.dataset.promptSnippetCategory = normalized.category;
    chip.title = normalized.content;
    const mark = document.createElement("span");
    mark.className = "prompt-snippet-chip-mark";
    mark.textContent = "~";
    const label = document.createElement("span");
    label.className = "prompt-snippet-chip-label";
    label.textContent = normalized.tag;
    const remove = document.createElement("button");
    remove.className = "prompt-snippet-chip-remove";
    remove.type = "button";
    remove.setAttribute("data-remove-prompt-snippet-chip", "");
    remove.setAttribute("aria-label", `\u79FB\u9664 ~${normalized.tag}`);
    remove.textContent = "\xD7";
    chip.append(mark, label, remove);
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removePromptGalleryChip2(chip);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openPromptSnippetChipPopover(chip);
      }
    });
    return chip;
  }
  function findPromptSnippetRefAt(promptText, cursor) {
    const trigger = promptText[cursor];
    if (!isPromptSnippetTriggerChar(trigger)) return null;
    const previous = cursor > 0 ? promptText[cursor - 1] : "";
    if (!isPromptSnippetBoundaryChar(previous)) return null;
    let tagStart = cursor + 1;
    while (isPromptSnippetTriggerChar(promptText[tagStart])) tagStart += 1;
    const rest = promptText.slice(tagStart);
    const match = rest.match(/^([^\s~～〜∼˜@#，。,.；;：:！？!?、（）()\[\]【】"'“”‘’]+)/);
    if (!match) return null;
    const tag = match[1];
    const snippet = findPromptSnippetByTag(tag);
    if (!snippet) return null;
    return { snippet, end: tagStart + tag.length };
  }
  function findPromptSnippetById(id) {
    return state13.promptSnippets.find((snippet) => snippet.id === id) || null;
  }
  function findPromptSnippetByTag(tag) {
    const key = String(tag || "").replace(/^[~～〜∼˜]+/, "").toLowerCase();
    return state13.promptSnippets.find((snippet) => snippet.tag.toLowerCase() === key) || null;
  }
  function expandPromptSnippets(prompt) {
    const text = String(prompt || "");
    return text.replace(/(^|[\s\n，。,.；;：:！？!?、（）()\[\]【】"'“”‘’])([~～〜∼˜]+)([^\s~～〜∼˜@#，。,.；;：:！？!?、（）()\[\]【】"'“”‘’]+)/g, (full, prefix, _trigger, tag) => {
      const snippet = findPromptSnippetByTag(tag);
      if (!snippet) return full;
      return `${prefix}${snippet.content}`;
    });
  }
  function getPromptSelectionForSnippet() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed || !els15.promptEditor) return null;
    const range = selection.getRangeAt(0);
    if (!rangeIntersectsNode(range, els15.promptEditor)) return null;
    const text = promptTextFromRange(range).replace(/\u00a0/g, " ").trim();
    if (!text || selectionContainsPromptAtomicChip(range)) return null;
    return { range: range.cloneRange(), text };
  }
  function selectionContainsPromptAtomicChip(range) {
    if (!range || range.collapsed) return false;
    const fragment = range.cloneContents();
    return Boolean(fragment.querySelector?.(".gallery-chip, .color-chip, .prompt-snippet-chip"));
  }
  function updatePromptSnippetSelectionButton() {
    if (promptSnippetPopoverEl && !promptSnippetPopoverEl.classList.contains("hidden")) return;
    const selection = getPromptSelectionForSnippet();
    if (!selection) {
      hidePromptSnippetSelectionButton();
      return;
    }
    showPromptSnippetSelectionButton(selection);
  }
  function showPromptSnippetSelectionButton(selection) {
    const button = promptSnippetSelectionButtonElement();
    if (!button || !selection?.range) return;
    state13.promptSnippetSelectionRange = selection.range.cloneRange();
    state13.promptSnippetSelectionText = selection.text;
    const rect = promptSnippetSelectionAnchorRect(selection) || els15.promptEditor.getBoundingClientRect();
    const buttonWidth = 54;
    const buttonHeight = 30;
    const gap = 6;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.right;
    const maxLeft = Math.max(8, viewportWidth - buttonWidth - 8);
    const endpointLeft = rect.right;
    const inlineLeft = endpointLeft + gap;
    const left = inlineLeft <= maxLeft ? Math.max(8, inlineLeft) : Math.min(maxLeft, Math.max(8, endpointLeft - buttonWidth));
    const top = inlineLeft <= maxLeft ? Math.max(8, rect.top + Math.max(0, (rect.height - buttonHeight) / 2)) : Math.max(8, rect.bottom + gap);
    button.style.setProperty("--prompt-snippet-save-left", `${left}px`);
    button.style.setProperty("--prompt-snippet-save-top", `${top}px`);
    button.classList.remove("hidden");
  }
  function promptSnippetSelectionAnchorRect(selection) {
    if (!selection?.range) return null;
    const endRange = selection.range.cloneRange();
    endRange.collapse(false);
    const endRect = mentionRangeRect2(endRange);
    if (endRect && (endRect.width || endRect.height)) return endRect;
    const rects = Array.from(selection.range.getClientRects()).filter((rect) => rect.width || rect.height);
    return rects.length ? rects[rects.length - 1] : mentionRangeRect2(selection.range);
  }
  function hidePromptSnippetSelectionButton() {
    const button = promptSnippetSelectionButtonElement();
    button?.classList.add("hidden");
    button?.style.removeProperty("--prompt-snippet-save-left");
    button?.style.removeProperty("--prompt-snippet-save-top");
  }
  function openPromptSnippetSavePopover() {
    if (!state13.promptSnippetSelectionText || !state13.promptSnippetSelectionRange) return;
    const snippet = {
      tag: suggestPromptSnippetTag(state13.promptSnippetSelectionText),
      title: "",
      content: state13.promptSnippetSelectionText,
      category: "\u5E38\u7528"
    };
    renderPromptSnippetForm("save", snippet);
    positionPromptSnippetPopoverAtSelectionButton();
  }
  function openPromptSnippetChipPopover(chip) {
    const snippet = promptSnippetFromChip(chip);
    if (!snippet) return;
    const popover = promptSnippetPopoverElement();
    if (!popover) return;
    promptSnippetPopoverState.mode = "chip";
    promptSnippetPopoverState.chip = chip;
    promptSnippetPopoverState.snippetId = snippet.id;
    popover.innerHTML = `
    <div class="prompt-snippet-popover-title">~${escapeHtml10(snippet.tag)}</div>
    <div class="prompt-snippet-popover-meta">${escapeHtml10(snippet.title)} \xB7 ${escapeHtml10(snippet.category)}</div>
    <div class="prompt-snippet-popover-preview">${escapeHtml10(snippet.content)}</div>
    <div class="prompt-snippet-popover-actions">
      <button class="ghost-button text-sm" type="button" data-prompt-snippet-expand>\u5C55\u5F00</button>
      <button class="ghost-button text-sm" type="button" data-prompt-snippet-edit>\u7F16\u8F91</button>
      <button class="ghost-button text-sm" type="button" data-prompt-snippet-close>\u5173\u95ED</button>
    </div>
  `;
    function handlePopoverActionClick(event, action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
    popover.querySelector("[data-prompt-snippet-expand]")?.addEventListener("click", (event) => handlePopoverActionClick(event, () => expandPromptSnippetChip(chip)));
    popover.querySelector("[data-prompt-snippet-edit]")?.addEventListener("click", (event) => handlePopoverActionClick(event, () => renderPromptSnippetForm("edit", snippet, chip)));
    popover.querySelector("[data-prompt-snippet-close]")?.addEventListener("click", (event) => handlePopoverActionClick(event, closePromptSnippetPopover));
    positionPromptSnippetPopoverAtChip(chip);
    popover.classList.remove("hidden");
  }
  function renderPromptSnippetForm(mode, snippet, chip = null) {
    const popover = promptSnippetPopoverElement();
    if (!popover) return;
    promptSnippetPopoverState.mode = mode;
    promptSnippetPopoverState.chip = chip;
    promptSnippetPopoverState.snippetId = snippet.id || null;
    popover.innerHTML = `
    <form class="prompt-snippet-form">
      <div class="prompt-snippet-popover-title">${mode === "edit" ? "\u7F16\u8F91\u7247\u6BB5" : "\u6536\u85CF\u7247\u6BB5"}</div>
      <label class="prompt-snippet-field">
        <span>\u77ED\u6807\u7B7E</span>
        <input class="prompt-snippet-input" type="text" maxlength="24" value="${escapeHtml10(snippet.tag || "")}" data-prompt-snippet-tag>
      </label>
      <label class="prompt-snippet-field">
        <span>\u6807\u9898</span>
        <input class="prompt-snippet-input" type="text" maxlength="80" value="${escapeHtml10(snippet.title || "")}" placeholder="\u9ED8\u8BA4\u4F7F\u7528\u77ED\u6807\u7B7E" data-prompt-snippet-title>
      </label>
      <label class="prompt-snippet-field">
        <span>\u5206\u7C7B</span>
        <input class="prompt-snippet-input" type="text" maxlength="32" value="${escapeHtml10(snippet.category || "\u5E38\u7528")}" data-prompt-snippet-category>
      </label>
      <label class="prompt-snippet-field">
        <span>\u5185\u5BB9</span>
        <textarea class="prompt-snippet-input prompt-snippet-textarea" maxlength="4000" data-prompt-snippet-content>${escapeHtml10(snippet.content || "")}</textarea>
      </label>
      <div class="prompt-snippet-popover-actions">
        <button class="ghost-button text-sm" type="button" data-prompt-snippet-cancel>\u53D6\u6D88</button>
        <button class="ghost-button text-sm" type="submit">${mode === "edit" ? "\u4FDD\u5B58" : "\u6536\u85CF"}</button>
      </div>
    </form>
  `;
    popover.querySelector("[data-prompt-snippet-cancel]")?.addEventListener("click", closePromptSnippetPopover);
    popover.querySelector(".prompt-snippet-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      savePromptSnippetFromPopover();
    });
    popover.classList.remove("hidden");
    window.setTimeout(() => popover.querySelector("[data-prompt-snippet-tag]")?.focus(), 0);
  }
  async function savePromptSnippetFromPopover() {
    const popover = promptSnippetPopoverElement();
    if (!popover) return;
    const payload = {
      tag: popover.querySelector("[data-prompt-snippet-tag]")?.value || "",
      title: popover.querySelector("[data-prompt-snippet-title]")?.value || "",
      category: popover.querySelector("[data-prompt-snippet-category]")?.value || "\u5E38\u7528",
      content: popover.querySelector("[data-prompt-snippet-content]")?.value || ""
    };
    try {
      const isEdit = promptSnippetPopoverState.mode === "edit" && promptSnippetPopoverState.snippetId;
      const response = await fetch(isEdit ? `${PROMPT_SNIPPETS_ENDPOINT}/${encodeURIComponent(promptSnippetPopoverState.snippetId)}` : PROMPT_SNIPPETS_ENDPOINT, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u7247\u6BB5\u4FDD\u5B58\u5931\u8D25");
      state13.promptSnippets = normalizePromptSnippetList(data.snippets);
      const snippet = normalizePromptSnippet(data.snippet);
      if (isEdit && promptSnippetPopoverState.chip) {
        updatePromptSnippetChip(promptSnippetPopoverState.chip, snippet);
        syncPromptAfterChipMutation2();
      } else if (snippet) {
        replacePromptSelectionWithSnippet(snippet);
      }
      closePromptSnippetPopover();
      hidePromptSnippetSelectionButton();
      setStatus13("\u63D0\u793A\u8BCD\u7247\u6BB5\u5DF2\u4FDD\u5B58", "ok");
    } catch (error) {
      setStatus13(error.message || "\u63D0\u793A\u8BCD\u7247\u6BB5\u4FDD\u5B58\u5931\u8D25", "error");
    }
  }
  function replacePromptSelectionWithSnippet(snippet) {
    if (!state13.promptSnippetSelectionRange || !els15.promptEditor) return;
    const range = state13.promptSnippetSelectionRange;
    if (!els15.promptEditor.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const chip = createPromptSnippetChip(snippet);
    const trailingSpace = document.createTextNode(" ");
    range.insertNode(chip);
    chip.after(trailingSpace);
    syncPromptAfterChipMutation2();
    setCaretAfterNode2(trailingSpace);
  }
  function promptSnippetFromChip(chip) {
    if (!chip) return null;
    const byId = findPromptSnippetById(chip.dataset.promptSnippetId);
    return byId || normalizePromptSnippet({
      id: chip.dataset.promptSnippetId,
      tag: chip.dataset.promptSnippetTag,
      title: chip.dataset.promptSnippetTitle,
      content: chip.dataset.promptSnippetContent,
      category: chip.dataset.promptSnippetCategory
    });
  }
  function updatePromptSnippetChip(chip, snippet) {
    const normalized = normalizePromptSnippet(snippet);
    if (!chip || !normalized) return;
    chip.dataset.promptSnippetId = normalized.id;
    chip.dataset.promptSnippetTag = normalized.tag;
    chip.dataset.promptSnippetTitle = normalized.title;
    chip.dataset.promptSnippetContent = normalized.content;
    chip.dataset.promptSnippetCategory = normalized.category;
    chip.title = normalized.content;
    const label = chip.querySelector(".prompt-snippet-chip-label");
    if (label) label.textContent = normalized.tag;
    const remove = chip.querySelector("[data-remove-prompt-snippet-chip]");
    if (remove) remove.setAttribute("aria-label", `\u79FB\u9664 ~${normalized.tag}`);
  }
  function expandPromptSnippetChip(chip) {
    const snippet = promptSnippetFromChip(chip);
    if (!snippet || !els15.promptEditor?.contains(chip)) return;
    const text = document.createTextNode(snippet.content);
    chip.replaceWith(text);
    closePromptSnippetPopover();
    syncPromptAfterChipMutation2();
    setCaretAfterNode2(text);
  }
  function suggestPromptSnippetTag(text) {
    const clean = String(text || "").replace(/[~～@#，。,.]/g, " ").replace(/\s+/g, "").trim();
    return clean.slice(0, 8) || "\u5E38\u7528\u7247\u6BB5";
  }
  function positionPromptSnippetPopoverAtSelectionButton() {
    const popover = promptSnippetPopoverElement();
    const button = promptSnippetSelectionButtonElement();
    if (!popover || !button) return;
    const buttonRect = button.getBoundingClientRect();
    positionPromptSnippetPopover(buttonRect);
  }
  function positionPromptSnippetPopoverAtChip(chip) {
    if (!chip || !els15.promptEditor) return;
    const chipRect = chip.getBoundingClientRect();
    positionPromptSnippetPopover(chipRect);
  }
  function positionPromptSnippetPopover(anchorRect) {
    const popover = promptSnippetPopoverElement();
    if (!popover || !els15.promptEditor) return;
    const host = els15.promptEditor.closest(".prompt-editor-wrap") || els15.promptEditor;
    positionPromptPopoverAtAnchor(
      popover,
      host,
      anchorRect,
      {
        left: "--prompt-snippet-popover-left",
        top: "--prompt-snippet-popover-top",
        width: "--prompt-snippet-popover-width",
        maxHeight: "--prompt-popover-max-height"
      },
      { minWidth: 280, maxWidth: 380, maxHeight: 360, minVisibleHeight: 150 }
    );
  }
  function closePromptSnippetPopover() {
    if (!promptSnippetPopoverEl) return;
    promptSnippetPopoverEl.classList.add("hidden");
    promptSnippetPopoverEl.innerHTML = "";
    promptSnippetPopoverEl.style.removeProperty("--prompt-snippet-popover-left");
    promptSnippetPopoverEl.style.removeProperty("--prompt-snippet-popover-top");
    promptSnippetPopoverEl.style.removeProperty("--prompt-snippet-popover-width");
    promptSnippetPopoverEl.style.removeProperty("--prompt-popover-max-height");
    promptSnippetPopoverState.mode = null;
    promptSnippetPopoverState.chip = null;
    promptSnippetPopoverState.snippetId = null;
    state13.promptSnippetSelectionRange = null;
    state13.promptSnippetSelectionText = "";
  }
  function hidePromptSnippetSuggest() {
    const suggest = promptSnippetSuggestElement();
    if (!suggest) return;
    suggest.classList.add("hidden");
    suggest.innerHTML = "";
    suggest.style.removeProperty("--prompt-snippet-left");
    suggest.style.removeProperty("--prompt-snippet-top");
    suggest.style.removeProperty("--prompt-snippet-width");
    suggest.style.removeProperty("--prompt-popover-max-height");
    state13.activePromptSnippetRange = null;
  }
  function handlePromptSnippetDocumentClick(target) {
    if (promptSnippetSuggestEl && !promptSnippetSuggestEl.classList.contains("hidden")) {
      const clickedSuggest = promptSnippetSuggestEl.contains(target);
      const clickedPromptEditor = els15.promptEditor?.contains(target);
      if (!clickedSuggest && !clickedPromptEditor) {
        hidePromptSnippetSuggest();
      }
    }
    if (promptSnippetPopoverEl && !promptSnippetPopoverEl.classList.contains("hidden")) {
      const clickedPopover = promptSnippetPopoverEl.contains(target);
      const clickedChip = target.closest?.(".prompt-snippet-chip");
      const clickedSave = promptSnippetSelectionButtonEl?.contains(target);
      if (!clickedPopover && !clickedChip && !clickedSave) {
        closePromptSnippetPopover();
      }
    }
  }
  function initPromptSnippetsFeature() {
    Object.assign(getLegacyBridge().methods, {
      normalizePromptSnippet,
      normalizePromptSnippetList,
      refreshPromptSnippets,
      promptSnippetSuggestElement,
      promptSnippetSelectionButtonElement,
      promptSnippetPopoverElement,
      activePromptSnippetMatch,
      updatePromptSnippetSuggest,
      promptSnippetsForQuery,
      promptSnippetPreview,
      positionPromptSnippetSuggestAtCaret,
      insertPromptSnippet,
      createPromptSnippetChip,
      findPromptSnippetRefAt,
      findPromptSnippetById,
      findPromptSnippetByTag,
      expandPromptSnippets,
      getPromptSelectionForSnippet,
      selectionContainsPromptAtomicChip,
      updatePromptSnippetSelectionButton,
      showPromptSnippetSelectionButton,
      promptSnippetSelectionAnchorRect,
      hidePromptSnippetSelectionButton,
      openPromptSnippetSavePopover,
      openPromptSnippetChipPopover,
      renderPromptSnippetForm,
      savePromptSnippetFromPopover,
      replacePromptSelectionWithSnippet,
      promptSnippetFromChip,
      updatePromptSnippetChip,
      expandPromptSnippetChip,
      suggestPromptSnippetTag,
      positionPromptSnippetPopoverAtSelectionButton,
      positionPromptSnippetPopoverAtChip,
      positionPromptSnippetPopover,
      closePromptSnippetPopover,
      hidePromptSnippetSuggest,
      handlePromptSnippetDocumentClick
    });
  }

  // codex_image/webui/frontend/src/prompt-templates.ts
  var PROMPT_TEMPLATES_ENDPOINT = "/api/prompt-templates";
  var PROMPT_TEMPLATE_CATEGORIES_ENDPOINT = "/api/prompt-template-categories";
  var PROMPT_TEMPLATE_IMPORT_ENDPOINT = "/api/prompt-templates/import";
  var PROMPT_TEMPLATE_EXPORT_ENDPOINT = "/api/prompt-templates/export.json";
  var DEFAULT_PROMPT_TEMPLATE_CATEGORIES = ["\u5E38\u7528", "\u4EBA\u50CF", "\u4EA7\u54C1", "\u4FEE\u590D", "\u6D77\u62A5", "\u7535\u5546"];
  var bridge15 = getLegacyBridge();
  var state14 = bridge15.state;
  var els16 = bridge15.els;
  var promptTemplateSearchAcceptManualInput = false;
  var lastPromptTemplateTrigger = null;
  function legacyMethod19(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml11(value) {
    return legacyMethod19("escapeHtml", value);
  }
  function setStatus14(message, type) {
    legacyMethod19("setStatus", message, type);
  }
  function getPromptText4() {
    return legacyMethod19("getPromptText");
  }
  function appendPromptText3(text) {
    legacyMethod19("appendPromptText", text);
  }
  function setPromptText(text) {
    legacyMethod19("setPromptText", text);
  }
  function syncPromptFromEditor2() {
    legacyMethod19("syncPromptFromEditor");
  }
  function updatePromptCount3() {
    legacyMethod19("updatePromptCount");
  }
  function updateRequestPreview7() {
    legacyMethod19("updateRequestPreview");
  }
  function normalizePromptTemplate(value) {
    if (!value || typeof value !== "object") return null;
    const title = String(value.title || "").trim();
    const content = String(value.content || "").trim();
    if (!title || !content) return null;
    const tags = Array.isArray(value.tags) ? value.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
    const usageCount = Number.isFinite(Number(value.usage_count)) ? Number.parseInt(value.usage_count, 10) : 0;
    return {
      id: String(value.id || title).trim() || title,
      title,
      short_title: String(value.short_title || title).trim().slice(0, 12) || title.slice(0, 12),
      content,
      category: String(value.category || "\u5E38\u7528").trim() || "\u5E38\u7528",
      tags,
      mode: String(value.mode || "any"),
      model_hint: String(value.model_hint || "gpt-image-2"),
      notes: String(value.notes || ""),
      thumbnail_url: String(value.thumbnail_url || "").trim(),
      favorite: Boolean(value.favorite),
      variables: Array.isArray(value.variables) ? value.variables.map((item) => String(item || "").trim()).filter(Boolean) : [],
      usage_count: Math.max(0, usageCount),
      created_at: value.created_at || "",
      updated_at: value.updated_at || "",
      last_used_at: value.last_used_at || ""
    };
  }
  function normalizePromptTemplateCategory(value, index = 0) {
    const rawName = typeof value === "string" ? value : value?.name || value?.id;
    const name = String(rawName || "").trim().slice(0, 32);
    if (!name) return null;
    const orderValue = Number.parseInt(value?.order ?? "", 10);
    return {
      id: name,
      name,
      order: Number.isFinite(orderValue) ? Math.max(0, orderValue) : (index + 1) * 10
    };
  }
  function normalizePromptTemplateList(items) {
    return (Array.isArray(items) ? items : []).map(normalizePromptTemplate).filter(Boolean).sort((left, right) => Number(right.favorite) - Number(left.favorite) || Number(Boolean(right.last_used_at)) - Number(Boolean(left.last_used_at)) || right.usage_count - left.usage_count || left.title.localeCompare(right.title, "zh-Hans-CN"));
  }
  function normalizePromptTemplateCategoryList(items) {
    const seen = /* @__PURE__ */ new Set();
    const categories = (Array.isArray(items) && items.length ? items : DEFAULT_PROMPT_TEMPLATE_CATEGORIES).map((item, index) => normalizePromptTemplateCategory(item, index)).filter(Boolean).filter((category) => {
      const key = category.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, "zh-Hans-CN"));
    if (!categories.some((category) => category.id === "\u5E38\u7528")) {
      categories.unshift({ id: "\u5E38\u7528", name: "\u5E38\u7528", order: 10 });
    }
    return categories;
  }
  function applyPromptTemplateSettingsResponse(data) {
    state14.promptTemplates = normalizePromptTemplateList(data?.templates);
    state14.promptTemplateCategories = normalizePromptTemplateCategoryList(data?.categories);
    if (state14.promptTemplateCategory && !state14.promptTemplateCategories.some((category) => category.id === state14.promptTemplateCategory)) {
      state14.promptTemplateCategory = "";
    }
    renderPromptTemplateCategories();
    renderPromptTemplateCategoryPanel();
    renderPromptTemplateRecentDock();
    renderPromptTemplateList();
  }
  async function refreshPromptTemplates() {
    try {
      const response = await fetch(PROMPT_TEMPLATES_ENDPOINT);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u6A21\u677F\u8BFB\u53D6\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
    } catch (error) {
      console.warn(error.message || "\u63D0\u793A\u8BCD\u6A21\u677F\u8BFB\u53D6\u5931\u8D25");
      state14.promptTemplates = [];
      state14.promptTemplateCategories = normalizePromptTemplateCategoryList([]);
      renderPromptTemplateCategories();
      renderPromptTemplateRecentDock();
      renderPromptTemplateList();
    }
  }
  function syncPromptTemplateSearchInput() {
    const input = els16.promptTemplateSearch;
    if (!input) return;
    const nextValue = String(state14.promptTemplateQuery || "");
    if (input.value !== nextValue) input.value = nextValue;
  }
  function setPromptTemplateSearchLocked(locked) {
    const input = els16.promptTemplateSearch;
    if (!input) return;
    input.readOnly = locked;
    if (locked) {
      input.setAttribute("readonly", "");
    } else {
      input.removeAttribute("readonly");
    }
  }
  function guardPromptTemplateSearchInput(delays = [0, 120, 360, 900]) {
    delays.forEach((delay) => {
      window.setTimeout(() => {
        if (!els16.promptTemplateDrawer?.classList.contains("open")) return;
        syncPromptTemplateSearchInput();
      }, delay);
    });
  }
  function openPromptTemplateDrawer() {
    legacyMethod19("closeGallery", { restoreFocus: false });
    lastPromptTemplateTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : els16.promptTemplateButton;
    els16.promptTemplateDrawer?.classList.add("open");
    els16.promptTemplateDrawer?.setAttribute("aria-hidden", "false");
    els16.promptTemplateDrawerBackdrop?.classList.remove("hidden");
    els16.promptTemplateButton?.setAttribute("aria-expanded", "true");
    promptTemplateSearchAcceptManualInput = false;
    setPromptTemplateSearchLocked(true);
    renderPromptTemplateCategories();
    renderPromptTemplateList();
    syncPromptTemplateSearchInput();
    guardPromptTemplateSearchInput();
    window.setTimeout(() => {
      syncPromptTemplateSearchInput();
      els16.promptTemplateDrawerClose?.focus({ preventScroll: true });
    }, 0);
  }
  function closePromptTemplateDrawer(options = {}) {
    const restoreFocus = options?.restoreFocus !== false;
    els16.promptTemplateDrawer?.classList.remove("open");
    els16.promptTemplateDrawer?.setAttribute("aria-hidden", "true");
    els16.promptTemplateDrawerBackdrop?.classList.add("hidden");
    els16.promptTemplateButton?.setAttribute("aria-expanded", "false");
    promptTemplateSearchAcceptManualInput = false;
    setPromptTemplateSearchLocked(true);
    hidePromptTemplateDetail();
    hidePromptTemplateForm();
    hidePromptTemplateCategoryPanel();
    if (restoreFocus) {
      const focusTarget = lastPromptTemplateTrigger || els16.promptTemplateButton;
      focusTarget?.focus?.({ preventScroll: true });
    }
  }
  function renderPromptTemplateCategories() {
    if (!els16.promptTemplateCategoryList) return;
    const categories = normalizePromptTemplateCategoryList(state14.promptTemplateCategories);
    state14.promptTemplateCategories = categories;
    els16.promptTemplateCategoryList.innerHTML = [
      `<button class="prompt-template-category ${state14.promptTemplateCategory ? "" : "active"}" data-prompt-template-category="" type="button">\u5168\u90E8</button>`,
      ...categories.map((category) => `
      <button class="prompt-template-category ${state14.promptTemplateCategory === category.id ? "active" : ""}" data-prompt-template-category="${escapeHtml11(category.id)}" type="button">
        ${escapeHtml11(category.name)}
      </button>
    `)
    ].join("");
  }
  function renderPromptTemplateCategoryPanel() {
    if (!els16.promptTemplateCategoryPanel) return;
    const categories = normalizePromptTemplateCategoryList(state14.promptTemplateCategories);
    els16.promptTemplateCategoryPanel.innerHTML = `
    <div class="prompt-template-category-create">
      <input class="control" type="text" maxlength="32" placeholder="\u65B0\u5206\u7C7B" data-prompt-template-category-new>
      <button class="ghost-button text-sm" type="button" data-prompt-template-category-create>\u6DFB\u52A0</button>
    </div>
    <div class="prompt-template-category-manage-list">
      ${categories.map((category) => `
        <div class="prompt-template-category-manage-row" data-prompt-template-category-row="${escapeHtml11(category.id)}">
          <input class="control" type="text" maxlength="32" value="${escapeHtml11(category.name)}" data-prompt-template-category-name>
          <button class="ghost-button text-sm" type="button" data-prompt-template-category-rename>\u4FDD\u5B58</button>
          <button class="ghost-button text-sm quiet-danger-button" type="button" data-prompt-template-category-delete ${category.id === "\u5E38\u7528" ? "disabled" : ""}>\u5220\u9664</button>
        </div>
      `).join("")}
    </div>
  `;
  }
  function togglePromptTemplateCategoryPanel() {
    if (!els16.promptTemplateCategoryPanel) return;
    const isHidden = els16.promptTemplateCategoryPanel.classList.contains("hidden");
    if (isHidden) {
      renderPromptTemplateCategoryPanel();
      els16.promptTemplateCategoryPanel.classList.remove("hidden");
      els16.promptTemplateCategoryManageButton?.setAttribute("aria-expanded", "true");
    } else {
      hidePromptTemplateCategoryPanel();
    }
  }
  function hidePromptTemplateCategoryPanel() {
    els16.promptTemplateCategoryPanel?.classList.add("hidden");
    els16.promptTemplateCategoryManageButton?.setAttribute("aria-expanded", "false");
  }
  function promptTemplatesForDisplay() {
    const query = String(state14.promptTemplateQuery || "").trim().toLowerCase();
    return (state14.promptTemplates || []).filter((template) => {
      if (state14.promptTemplateFilter === "favorite" && !template.favorite) return false;
      if (state14.promptTemplateFilter === "recent" && !template.last_used_at) return false;
      if (state14.promptTemplateCategory && template.category !== state14.promptTemplateCategory) return false;
      if (!query) return true;
      return [
        template.title,
        template.short_title,
        template.content,
        template.category,
        template.notes,
        template.model_hint,
        ...template.tags || []
      ].join(" ").toLowerCase().includes(query);
    });
  }
  function renderPromptTemplateList() {
    if (!els16.promptTemplateList) return;
    const templates = promptTemplatesForDisplay();
    if (els16.promptTemplateSummary) {
      els16.promptTemplateSummary.className = "prompt-template-summary";
      els16.promptTemplateSummary.textContent = templates.length ? `${templates.length} \u4E2A\u53EF\u7528\u6A21\u677F` : "\u6682\u65E0\u5339\u914D\u6A21\u677F";
    }
    if (!templates.length) {
      els16.promptTemplateList.innerHTML = '<div class="prompt-template-empty">\u6682\u65E0\u6A21\u677F</div>';
      return;
    }
    els16.promptTemplateList.innerHTML = templates.map((template) => `
    <button class="prompt-template-card" type="button" data-prompt-template-id="${escapeHtml11(template.id)}">
      ${template.thumbnail_url ? `<span class="prompt-template-card-thumb"><img src="${escapeHtml11(template.thumbnail_url)}" alt=""></span>` : ""}
      <span class="prompt-template-card-title">${escapeHtml11(template.short_title)}</span>
      <span class="prompt-template-card-subtitle">${escapeHtml11(template.title)}</span>
      <span class="prompt-template-card-preview">${escapeHtml11(promptTemplatePreview(template.content, 64))}</span>
      <span class="prompt-template-card-meta">
        <span>${escapeHtml11(template.category)}</span>
        <span>${template.favorite ? "\u5DF2\u6536\u85CF" : `${template.usage_count || 0} \u6B21`}</span>
      </span>
    </button>
  `).join("");
  }
  function renderPromptTemplateRecentDock() {
    if (!els16.promptTemplateRecentDock) return;
    const recent = (state14.promptTemplates || []).filter((template) => template.last_used_at || template.favorite).slice(0, 4);
    if (!recent.length) {
      els16.promptTemplateRecentDock.classList.add("hidden");
      els16.promptTemplateRecentDock.innerHTML = "";
      return;
    }
    els16.promptTemplateRecentDock.innerHTML = recent.map((template) => `
    <button class="prompt-template-recent-chip" type="button" data-prompt-template-insert="${escapeHtml11(template.id)}">
      ${escapeHtml11(template.short_title)}
    </button>
  `).join("");
    els16.promptTemplateRecentDock.classList.remove("hidden");
  }
  function selectPromptTemplate(templateId) {
    const template = findPromptTemplateById(templateId);
    if (!template || !els16.promptTemplateDetail) return;
    state14.selectedPromptTemplateId = template.id;
    hidePromptTemplateForm();
    els16.promptTemplateDetail.innerHTML = `
    <div class="prompt-template-detail-header">
      <button class="ghost-button text-sm" type="button" data-prompt-template-back>\u8FD4\u56DE</button>
      <button class="ghost-button text-sm" type="button" data-prompt-template-edit="${escapeHtml11(template.id)}">\u7F16\u8F91</button>
    </div>
    ${template.thumbnail_url ? `<img class="prompt-template-detail-thumb" src="${escapeHtml11(template.thumbnail_url)}" alt="">` : ""}
    <h3>${escapeHtml11(template.title)}</h3>
    <div class="prompt-template-detail-meta">
      <span>${escapeHtml11(template.category)}</span>
      <span>${escapeHtml11(template.model_hint)}</span>
      ${template.favorite ? "<span>\u6536\u85CF</span>" : ""}
    </div>
    <div class="prompt-template-detail-content">${escapeHtml11(template.content)}</div>
    ${template.notes ? `<p class="prompt-template-detail-notes">${escapeHtml11(template.notes)}</p>` : ""}
    <div class="prompt-template-detail-actions">
      <button class="ghost-button text-sm" type="button" data-prompt-template-copy="${escapeHtml11(template.id)}">\u590D\u5236</button>
      <button class="ghost-button text-sm" type="button" data-prompt-template-insert="${escapeHtml11(template.id)}">\u63D2\u5165</button>
      <button class="run-button" type="button" data-prompt-template-replace="${escapeHtml11(template.id)}">\u66FF\u6362</button>
    </div>
  `;
    els16.promptTemplateList?.classList.add("hidden");
    els16.promptTemplateDetail.classList.remove("hidden");
  }
  async function applyPromptTemplate(template, mode) {
    if (!template) return;
    const content = String(template.content || "").trim();
    if (!content) return;
    if (mode === "replace") {
      setPromptText(content);
    } else {
      const current = getPromptText4();
      if (current && !/\s$/.test(current)) appendPromptText3("\n\n");
      appendPromptText3(content);
      syncPromptFromEditor2();
    }
    updatePromptCount3();
    updateRequestPreview7();
    await afterPromptTemplateApplied(template);
    closePromptTemplateDrawer();
  }
  async function afterPromptTemplateApplied(template) {
    try {
      const response = await fetch(`${PROMPT_TEMPLATES_ENDPOINT}/${encodeURIComponent(template.id)}/use`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u6A21\u677F\u4F7F\u7528\u72B6\u6001\u66F4\u65B0\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
    } catch (error) {
      console.warn(error.message || "\u63D0\u793A\u8BCD\u6A21\u677F\u4F7F\u7528\u72B6\u6001\u66F4\u65B0\u5931\u8D25");
    }
  }
  async function copyPromptTemplateContent(template) {
    if (!template) return;
    try {
      await navigator.clipboard.writeText(template.content);
      setStatus14("\u63D0\u793A\u8BCD\u6A21\u677F\u5DF2\u590D\u5236", "ok");
    } catch {
      setStatus14("\u63D0\u793A\u8BCD\u6A21\u677F\u590D\u5236\u5931\u8D25", "error");
    }
  }
  function renderPromptTemplateForm(template = null) {
    if (!els16.promptTemplateForm) return;
    const value = template || {
      id: "",
      title: "",
      short_title: "",
      content: getPromptText4(),
      category: "\u5E38\u7528",
      tags: [],
      notes: "",
      thumbnail_url: "",
      favorite: false
    };
    hidePromptTemplateDetail();
    els16.promptTemplateList?.classList.add("hidden");
    const categories = promptTemplateCategoriesForSelect(value.category);
    els16.promptTemplateForm.innerHTML = `
    <form class="prompt-template-form" data-prompt-template-form-id="${escapeHtml11(value.id || "")}">
      <div class="prompt-template-form-header">
        <button class="ghost-button text-sm" type="button" data-prompt-template-back>\u8FD4\u56DE</button>
        ${value.id ? `<button class="ghost-button text-sm danger-button" type="button" data-prompt-template-delete="${escapeHtml11(value.id)}">\u5220\u9664</button>` : ""}
      </div>
      <label class="prompt-template-field">
        <span>\u6807\u9898</span>
        <input class="control" type="text" maxlength="80" value="${escapeHtml11(value.title || "")}" data-prompt-template-title>
      </label>
      <label class="prompt-template-field">
        <span>\u77ED\u6807\u9898</span>
        <input class="control" type="text" maxlength="12" value="${escapeHtml11(value.short_title || "")}" data-prompt-template-short-title>
      </label>
      <label class="prompt-template-field">
        <span>\u5206\u7C7B</span>
        <select class="control" data-prompt-template-category-input>
          ${categories.map((category) => `<option value="${escapeHtml11(category.id)}" ${category.id === value.category ? "selected" : ""}>${escapeHtml11(category.name)}</option>`).join("")}
        </select>
      </label>
      <label class="prompt-template-field prompt-template-field-full">
        <span>\u6807\u7B7E</span>
        <input class="control" type="text" value="${escapeHtml11((value.tags || []).join("\uFF0C"))}" data-prompt-template-tags>
      </label>
      <div class="prompt-template-field prompt-template-field-full prompt-template-thumbnail-field">
        <span>\u7F29\u7565\u56FE</span>
        <input type="hidden" value="${escapeHtml11(value.thumbnail_url || "")}" data-prompt-template-thumbnail-url>
        <div class="prompt-template-thumbnail-row">
          <div class="prompt-template-thumbnail-preview" data-prompt-template-thumbnail-preview></div>
          <button class="ghost-button text-sm" type="button" data-prompt-template-thumbnail-clear>\u6E05\u9664</button>
        </div>
        <div class="prompt-template-thumbnail-picker" data-prompt-template-thumbnail-picker></div>
      </div>
      <label class="prompt-template-field prompt-template-field-full">
        <span>\u5185\u5BB9</span>
        <textarea class="control prompt-template-textarea" maxlength="8000" data-prompt-template-content>${escapeHtml11(value.content || "")}</textarea>
      </label>
      <label class="prompt-template-field prompt-template-field-full">
        <span>\u5907\u6CE8</span>
        <textarea class="control prompt-template-notes" maxlength="500" data-prompt-template-notes>${escapeHtml11(value.notes || "")}</textarea>
      </label>
      <label class="prompt-template-check">
        <input type="checkbox" ${value.favorite ? "checked" : ""} data-prompt-template-favorite>
        <span>\u6536\u85CF</span>
      </label>
      <button class="run-button prompt-template-save" type="submit">\u4FDD\u5B58</button>
    </form>
  `;
    els16.promptTemplateForm.classList.remove("hidden");
    renderPromptTemplateThumbnailPicker(value.thumbnail_url || "");
  }
  function promptTemplateCategoriesForSelect(selectedCategory) {
    const categories = normalizePromptTemplateCategoryList(state14.promptTemplateCategories);
    const selected = String(selectedCategory || "").trim();
    if (selected && !categories.some((category) => category.id === selected)) {
      categories.push({ id: selected, name: selected, order: categories.length * 10 + 10 });
    }
    return categories;
  }
  function historyTemplateThumbnails() {
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    (state14.tasks || []).forEach((task) => {
      const urls = [];
      if (Array.isArray(task?.outputs)) {
        task.outputs.forEach((output) => {
          if (output?.status === "completed" && output?.url) urls.push(String(output.url));
        });
      }
      if (Array.isArray(task?.output_urls)) urls.push(...task.output_urls.map((url) => String(url || "")).filter(Boolean));
      if (task?.output_url) urls.push(String(task.output_url));
      urls.forEach((url, index) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        items.push({
          url,
          label: `${promptTemplatePreview(task?.prompt || task?.prompt_for_model || task?.task_id || "\u5386\u53F2\u8BB0\u5F55", 18)} ${index + 1}`
        });
      });
    });
    return items.slice(0, 16);
  }
  function renderPromptTemplateThumbnailPicker(selectedUrl = "") {
    const form = els16.promptTemplateForm?.querySelector(".prompt-template-form");
    if (!form) return;
    const picker = form.querySelector("[data-prompt-template-thumbnail-picker]");
    const preview = form.querySelector("[data-prompt-template-thumbnail-preview]");
    const input = form.querySelector("[data-prompt-template-thumbnail-url]");
    if (input) input.value = selectedUrl;
    if (preview) {
      preview.innerHTML = selectedUrl ? `<img src="${escapeHtml11(selectedUrl)}" alt=""><span>${escapeHtml11(promptTemplatePreview(selectedUrl, 30))}</span>` : "<span>\u672A\u9009\u62E9</span>";
    }
    if (!picker) return;
    const thumbnails = historyTemplateThumbnails();
    if (!thumbnails.length) {
      picker.innerHTML = '<div class="prompt-template-thumbnail-empty">\u6682\u65E0\u5386\u53F2\u7F29\u7565\u56FE</div>';
      return;
    }
    picker.innerHTML = thumbnails.map((item) => `
    <button class="prompt-template-thumbnail-option ${item.url === selectedUrl ? "active" : ""}" type="button" data-prompt-template-thumbnail-select="${escapeHtml11(item.url)}" title="${escapeHtml11(item.label)}">
      <img src="${escapeHtml11(item.url)}" alt="">
    </button>
  `).join("");
  }
  function setPromptTemplateThumbnailUrl(url) {
    renderPromptTemplateThumbnailPicker(String(url || "").trim());
  }
  function setPromptTemplateSummary(message, type = "") {
    if (!els16.promptTemplateSummary) return;
    els16.promptTemplateSummary.textContent = message;
    els16.promptTemplateSummary.className = ["prompt-template-summary", type].filter(Boolean).join(" ");
  }
  async function savePromptTemplateFromDrawer() {
    const form = els16.promptTemplateForm?.querySelector(".prompt-template-form");
    if (!form) return;
    const templateId = form.dataset.promptTemplateFormId || "";
    const payload = {
      title: form.querySelector("[data-prompt-template-title]")?.value || "",
      short_title: form.querySelector("[data-prompt-template-short-title]")?.value || "",
      category: form.querySelector("[data-prompt-template-category-input]")?.value || "\u5E38\u7528",
      tags: (form.querySelector("[data-prompt-template-tags]")?.value || "").split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      content: form.querySelector("[data-prompt-template-content]")?.value || "",
      notes: form.querySelector("[data-prompt-template-notes]")?.value || "",
      thumbnail_url: form.querySelector("[data-prompt-template-thumbnail-url]")?.value || "",
      favorite: Boolean(form.querySelector("[data-prompt-template-favorite]")?.checked),
      model_hint: "gpt-image-2"
    };
    try {
      const response = await fetch(templateId ? `${PROMPT_TEMPLATES_ENDPOINT}/${encodeURIComponent(templateId)}` : PROMPT_TEMPLATES_ENDPOINT, {
        method: templateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u6A21\u677F\u4FDD\u5B58\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      hidePromptTemplateForm();
      setStatus14("\u63D0\u793A\u8BCD\u6A21\u677F\u5DF2\u4FDD\u5B58", "ok");
    } catch (error) {
      setStatus14(error.message || "\u63D0\u793A\u8BCD\u6A21\u677F\u4FDD\u5B58\u5931\u8D25", "error");
    }
  }
  async function deletePromptTemplate(template) {
    if (!template) return;
    try {
      const response = await fetch(`${PROMPT_TEMPLATES_ENDPOINT}/${encodeURIComponent(template.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u63D0\u793A\u8BCD\u6A21\u677F\u5220\u9664\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      hidePromptTemplateForm();
      hidePromptTemplateDetail();
      setStatus14("\u63D0\u793A\u8BCD\u6A21\u677F\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      setStatus14(error.message || "\u63D0\u793A\u8BCD\u6A21\u677F\u5220\u9664\u5931\u8D25", "error");
    }
  }
  async function createPromptTemplateCategory(name) {
    const clean = String(name || "").trim();
    if (!clean) return;
    try {
      const response = await fetch(PROMPT_TEMPLATE_CATEGORIES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u6A21\u677F\u5206\u7C7B\u6DFB\u52A0\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      renderPromptTemplateCategoryPanel();
      setStatus14("\u6A21\u677F\u5206\u7C7B\u5DF2\u6DFB\u52A0", "ok");
    } catch (error) {
      setStatus14(error.message || "\u6A21\u677F\u5206\u7C7B\u6DFB\u52A0\u5931\u8D25", "error");
    }
  }
  async function updatePromptTemplateCategory(categoryId, name) {
    const clean = String(name || "").trim();
    if (!categoryId || !clean) return;
    try {
      const response = await fetch(`${PROMPT_TEMPLATE_CATEGORIES_ENDPOINT}/${encodeURIComponent(String(categoryId))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u6A21\u677F\u5206\u7C7B\u4FDD\u5B58\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      renderPromptTemplateCategoryPanel();
      setStatus14("\u6A21\u677F\u5206\u7C7B\u5DF2\u4FDD\u5B58", "ok");
    } catch (error) {
      setStatus14(error.message || "\u6A21\u677F\u5206\u7C7B\u4FDD\u5B58\u5931\u8D25", "error");
    }
  }
  async function deletePromptTemplateCategory(categoryId) {
    if (!categoryId) return;
    try {
      const response = await fetch(`${PROMPT_TEMPLATE_CATEGORIES_ENDPOINT}/${encodeURIComponent(String(categoryId))}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u6A21\u677F\u5206\u7C7B\u5220\u9664\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      renderPromptTemplateCategoryPanel();
      setStatus14("\u6A21\u677F\u5206\u7C7B\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      setStatus14(error.message || "\u6A21\u677F\u5206\u7C7B\u5220\u9664\u5931\u8D25", "error");
    }
  }
  async function importPromptTemplatePack(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(PROMPT_TEMPLATE_IMPORT_ENDPOINT, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "\u6A21\u677F\u5305\u5BFC\u5165\u5931\u8D25");
      applyPromptTemplateSettingsResponse(data);
      const message = `\u5DF2\u5BFC\u5165 ${data.imported || 0} \u4E2A\u6A21\u677F`;
      setPromptTemplateSummary(message, "ok");
      setStatus14(message, "ok");
    } catch (error) {
      const message = error.message || "\u6A21\u677F\u5305\u5BFC\u5165\u5931\u8D25";
      setPromptTemplateSummary(message, "error");
      setStatus14(message, "error");
    }
  }
  async function exportPromptTemplatePack() {
    const button = els16.promptTemplateExportButton;
    if (button) button.disabled = true;
    try {
      const response = await fetch(PROMPT_TEMPLATE_EXPORT_ENDPOINT, {
        headers: { Accept: "application/json" }
      });
      const text = await response.text();
      if (!response.ok) {
        let message = "\u6A21\u677F\u5305\u5BFC\u51FA\u5931\u8D25";
        try {
          const data = JSON.parse(text);
          message = data?.detail || message;
        } catch {
        }
        throw new Error(message);
      }
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "webui-prompt-templates.json";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        link.remove();
      }, 0);
      setPromptTemplateSummary("\u6A21\u677F\u5305\u5DF2\u5BFC\u51FA", "ok");
      setStatus14("\u6A21\u677F\u5305\u5DF2\u5BFC\u51FA", "ok");
    } catch (error) {
      const message = error.message || "\u6A21\u677F\u5305\u5BFC\u51FA\u5931\u8D25";
      setPromptTemplateSummary(message, "error");
      setStatus14(message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  }
  function hidePromptTemplateDetail() {
    if (!els16.promptTemplateDetail) return;
    els16.promptTemplateDetail.classList.add("hidden");
    els16.promptTemplateDetail.innerHTML = "";
    els16.promptTemplateList?.classList.remove("hidden");
  }
  function hidePromptTemplateForm() {
    if (!els16.promptTemplateForm) return;
    els16.promptTemplateForm.classList.add("hidden");
    els16.promptTemplateForm.innerHTML = "";
    els16.promptTemplateList?.classList.remove("hidden");
  }
  function findPromptTemplateById(id) {
    return (state14.promptTemplates || []).find((template) => template.id === id) || null;
  }
  function promptTemplatePreview(text, length = 80) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > length ? `${clean.slice(0, length)}...` : clean;
  }
  function bindPromptTemplateEvents() {
    els16.promptTemplateButton?.addEventListener("click", openPromptTemplateDrawer);
    els16.promptTemplateDrawerClose?.addEventListener("click", closePromptTemplateDrawer);
    els16.promptTemplateDrawerBackdrop?.addEventListener("click", closePromptTemplateDrawer);
    els16.promptTemplateCreateButton?.addEventListener("click", () => renderPromptTemplateForm());
    els16.promptTemplateCategoryManageButton?.addEventListener("click", togglePromptTemplateCategoryPanel);
    els16.promptTemplateImportButton?.addEventListener("click", () => els16.promptTemplateImportInput?.click());
    els16.promptTemplateExportButton?.addEventListener("click", () => {
      void exportPromptTemplatePack();
    });
    els16.promptTemplateImportInput?.addEventListener("change", () => {
      const input = els16.promptTemplateImportInput;
      const file = input?.files?.[0];
      void importPromptTemplatePack(file);
      if (input) input.value = "";
    });
    els16.promptTemplateSearch?.addEventListener("pointerdown", (event) => {
      const input = els16.promptTemplateSearch;
      if (!input?.readOnly) return;
      event.preventDefault();
      setPromptTemplateSearchLocked(false);
      syncPromptTemplateSearchInput();
      input.focus({ preventScroll: true });
    });
    els16.promptTemplateSearch?.addEventListener("keydown", (event) => {
      const input = els16.promptTemplateSearch;
      if (input?.readOnly && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key || "";
        const isPrintable = key.length === 1;
        const isClearKey = key === "Backspace" || key === "Delete";
        if (isPrintable || isClearKey) {
          event.preventDefault();
          setPromptTemplateSearchLocked(false);
          promptTemplateSearchAcceptManualInput = true;
          const nextValue = isClearKey ? "" : key;
          input.value = nextValue;
          state14.promptTemplateQuery = nextValue;
          renderPromptTemplateList();
        }
        return;
      }
      promptTemplateSearchAcceptManualInput = true;
    });
    els16.promptTemplateSearch?.addEventListener("paste", () => {
      promptTemplateSearchAcceptManualInput = true;
    });
    els16.promptTemplateSearch?.addEventListener("drop", () => {
      promptTemplateSearchAcceptManualInput = true;
    });
    els16.promptTemplateSearch?.addEventListener("blur", () => {
      promptTemplateSearchAcceptManualInput = false;
      setPromptTemplateSearchLocked(true);
    });
    els16.promptTemplateSearch?.addEventListener("input", () => {
      if (!promptTemplateSearchAcceptManualInput) {
        syncPromptTemplateSearchInput();
        guardPromptTemplateSearchInput([120, 360, 900]);
        return;
      }
      state14.promptTemplateQuery = els16.promptTemplateSearch?.value || "";
      renderPromptTemplateList();
    });
    els16.promptTemplateSearch?.addEventListener("focus", () => {
      promptTemplateSearchAcceptManualInput = false;
      guardPromptTemplateSearchInput();
    });
    els16.promptTemplateDrawer?.addEventListener("click", (event) => {
      const target = event.target;
      const filter = target?.closest("[data-prompt-template-filter]");
      const category = target?.closest("[data-prompt-template-category]");
      const categoryCreate = target?.closest("[data-prompt-template-category-create]");
      const categoryRename = target?.closest("[data-prompt-template-category-rename]");
      const categoryDelete = target?.closest("[data-prompt-template-category-delete]");
      const thumbnailSelect = target?.closest("[data-prompt-template-thumbnail-select]");
      const thumbnailClear = target?.closest("[data-prompt-template-thumbnail-clear]");
      const card = target?.closest("[data-prompt-template-id]");
      const insert = target?.closest("[data-prompt-template-insert]");
      const replace = target?.closest("[data-prompt-template-replace]");
      const copy = target?.closest("[data-prompt-template-copy]");
      const edit = target?.closest("[data-prompt-template-edit]");
      const remove = target?.closest("[data-prompt-template-delete]");
      const back = target?.closest("[data-prompt-template-back]");
      if (filter) {
        state14.promptTemplateFilter = filter.dataset.promptTemplateFilter || "all";
        els16.promptTemplateDrawer?.querySelectorAll("[data-prompt-template-filter]").forEach((button) => {
          button.classList.toggle("active", button === filter);
        });
        renderPromptTemplateList();
        return;
      }
      if (category) {
        state14.promptTemplateCategory = category.dataset.promptTemplateCategory || "";
        renderPromptTemplateCategories();
        renderPromptTemplateList();
        return;
      }
      if (categoryCreate) {
        const input = els16.promptTemplateCategoryPanel?.querySelector("[data-prompt-template-category-new]");
        void createPromptTemplateCategory(input?.value || "");
        return;
      }
      if (categoryRename || categoryDelete) {
        const row = target?.closest("[data-prompt-template-category-row]");
        const categoryId = row?.dataset.promptTemplateCategoryRow || "";
        if (categoryRename) {
          const input = row?.querySelector("[data-prompt-template-category-name]");
          void updatePromptTemplateCategory(categoryId, input?.value || "");
        } else {
          void deletePromptTemplateCategory(categoryId);
        }
        return;
      }
      if (thumbnailSelect) {
        setPromptTemplateThumbnailUrl(thumbnailSelect.dataset.promptTemplateThumbnailSelect || "");
        return;
      }
      if (thumbnailClear) {
        setPromptTemplateThumbnailUrl("");
        return;
      }
      if (back) {
        hidePromptTemplateDetail();
        hidePromptTemplateForm();
        return;
      }
      if (insert) {
        const template = findPromptTemplateById(insert.dataset.promptTemplateInsert);
        void applyPromptTemplate(template, "insert");
      } else if (replace) {
        const template = findPromptTemplateById(replace.dataset.promptTemplateReplace);
        void applyPromptTemplate(template, "replace");
      } else if (copy) {
        void copyPromptTemplateContent(findPromptTemplateById(copy.dataset.promptTemplateCopy));
      } else if (edit) {
        renderPromptTemplateForm(findPromptTemplateById(edit.dataset.promptTemplateEdit));
      } else if (remove) {
        void deletePromptTemplate(findPromptTemplateById(remove.dataset.promptTemplateDelete));
      } else if (card) {
        selectPromptTemplate(card.dataset.promptTemplateId);
      }
    });
    els16.promptTemplateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void savePromptTemplateFromDrawer();
    });
    els16.promptTemplateRecentDock?.addEventListener("click", (event) => {
      const button = event.target?.closest("[data-prompt-template-insert]");
      if (!button) return;
      const template = findPromptTemplateById(button.dataset.promptTemplateInsert);
      void applyPromptTemplate(template, "insert");
    });
  }
  function initPromptTemplatesFeature() {
    Object.assign(getLegacyBridge().methods, {
      normalizePromptTemplate,
      normalizePromptTemplateCategory,
      normalizePromptTemplateList,
      normalizePromptTemplateCategoryList,
      refreshPromptTemplates,
      openPromptTemplateDrawer,
      closePromptTemplateDrawer,
      renderPromptTemplateCategories,
      renderPromptTemplateCategoryPanel,
      togglePromptTemplateCategoryPanel,
      promptTemplatesForDisplay,
      renderPromptTemplateList,
      renderPromptTemplateRecentDock,
      selectPromptTemplate,
      applyPromptTemplate,
      afterPromptTemplateApplied,
      copyPromptTemplateContent,
      renderPromptTemplateForm,
      historyTemplateThumbnails,
      renderPromptTemplateThumbnailPicker,
      importPromptTemplatePack,
      exportPromptTemplatePack,
      savePromptTemplateFromDrawer,
      deletePromptTemplate,
      createPromptTemplateCategory,
      updatePromptTemplateCategory,
      deletePromptTemplateCategory,
      hidePromptTemplateDetail,
      hidePromptTemplateForm,
      findPromptTemplateById,
      promptTemplatePreview
    });
    bindPromptTemplateEvents();
  }

  // codex_image/webui/frontend/src/prompt-serialization.ts
  var bridge16 = getLegacyBridge();
  var els17 = bridge16.els;
  function legacyMethod20(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function createGalleryChip(item) {
    return legacyMethod20("createGalleryChip", item);
  }
  function createColorChip2(colorCode) {
    return legacyMethod20("createColorChip", colorCode);
  }
  function normalizeHexColor3(value) {
    return legacyMethod20("normalizeHexColor", value);
  }
  function findPromptSnippetRefAt2(promptText, cursor) {
    return legacyMethod20("findPromptSnippetRefAt", promptText, cursor);
  }
  function createPromptSnippetChip2(snippet) {
    return legacyMethod20("createPromptSnippetChip", snippet);
  }
  function updatePromptChipSelectionState() {
    legacyMethod20("updatePromptChipSelectionState");
  }
  function galleryRefsByMentionLength(refs) {
    return legacyMethod20("galleryRefsByMentionLength", refs);
  }
  function findGalleryRefMentionAt(promptText, cursor, refs) {
    return legacyMethod20("findGalleryRefMentionAt", promptText, cursor, refs);
  }
  function hideMentionSuggest() {
    legacyMethod20("hideMentionSuggest");
  }
  function hideColorSuggest2() {
    legacyMethod20("hideColorSuggest");
  }
  function hidePromptSnippetSuggest2() {
    legacyMethod20("hidePromptSnippetSuggest");
  }
  function hidePromptSnippetSelectionButton2() {
    legacyMethod20("hidePromptSnippetSelectionButton");
  }
  function closePromptSnippetPopover2() {
    legacyMethod20("closePromptSnippetPopover");
  }
  function getPromptText5() {
    if (!els17.promptEditor) return els17.prompt.value;
    return promptTextFromNode(els17.promptEditor).replace(/\u00a0/g, " ").trim();
  }
  function promptTextFromNode(node) {
    let text = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (child.classList.contains("gallery-chip")) {
        text += `@${child.dataset.galleryName || child.textContent.trim()}`;
        return;
      }
      if (child.classList.contains("color-chip")) {
        text += child.dataset.colorCode || child.textContent.trim();
        return;
      }
      if (child.classList.contains("prompt-snippet-chip")) {
        text += `~${child.dataset.promptSnippetTag || child.textContent.replace(/^~/, "").trim()}`;
        return;
      }
      if (child.tagName === "BR") {
        text += "\n";
        return;
      }
      text += promptTextFromNode(child);
      if (child.tagName === "DIV" || child.tagName === "P") {
        text += "\n";
      }
    });
    return text;
  }
  function promptSelectionText() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !els17.promptEditor) return "";
    const parts = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      if (range.collapsed || !rangeIntersectsNode2(range, els17.promptEditor)) continue;
      parts.push(promptTextFromRange2(range));
    }
    return parts.join("").replace(/\u00a0/g, " ");
  }
  function promptTextFromRange2(range) {
    const fragment = range.cloneContents();
    return promptTextFromNode(fragment);
  }
  function rangeIntersectsNode2(range, node) {
    if (!range || !node) return false;
    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }
  function selectPromptEditorContents() {
    if (!els17.promptEditor) return;
    els17.promptEditor.focus();
    const range = document.createRange();
    range.selectNodeContents(els17.promptEditor);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    updatePromptChipSelectionState();
  }
  function setPromptText2(text) {
    if (els17.promptEditor) {
      els17.promptEditor.textContent = text || "";
    }
    els17.prompt.value = text || "";
    hideMentionSuggest();
    hideColorSuggest2();
    hidePromptSnippetSuggest2();
    hidePromptSnippetSelectionButton2();
    closePromptSnippetPopover2();
  }
  function setPromptWithGalleryRefs(text, refs) {
    if (!els17.promptEditor) {
      setPromptText2(text);
      return;
    }
    const refList = Array.isArray(refs) ? refs : [];
    const sortedRefs = galleryRefsByMentionLength(refList);
    const promptText = String(text || "");
    els17.promptEditor.innerHTML = "";
    let cursor = 0;
    let plainStart = 0;
    while (cursor < promptText.length) {
      const refMatch = findGalleryRefMentionAt(promptText, cursor, sortedRefs);
      if (refMatch) {
        appendPromptText4(promptText.slice(plainStart, cursor));
        els17.promptEditor.append(createGalleryChip(refMatch.ref));
        cursor = refMatch.end;
        plainStart = cursor;
        continue;
      }
      const colorMatch = promptText.slice(cursor).match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/);
      if (colorMatch) {
        const match = colorMatch;
        const colorCode = normalizeHexColor3(match[0]);
        appendPromptText4(promptText.slice(plainStart, cursor));
        els17.promptEditor.append(createColorChip2(colorCode));
        cursor += match[0].length;
        plainStart = cursor;
        continue;
      }
      const snippetMatch = findPromptSnippetRefAt2(promptText, cursor);
      if (snippetMatch) {
        appendPromptText4(promptText.slice(plainStart, cursor));
        els17.promptEditor.append(createPromptSnippetChip2(snippetMatch.snippet));
        cursor = snippetMatch.end;
        plainStart = cursor;
        continue;
      }
      cursor += 1;
    }
    appendPromptText4(promptText.slice(plainStart));
    syncPromptFromEditor3();
    hideMentionSuggest();
    hideColorSuggest2();
    hidePromptSnippetSuggest2();
  }
  function appendPromptText4(text) {
    if (text) {
      els17.promptEditor.append(document.createTextNode(text));
    }
  }
  function clearPromptEditorIfEmpty() {
    if (!els17.promptEditor) return;
    const visibleText = promptTextFromNode(els17.promptEditor).replace(/\u00a0/g, " ").trim();
    if (!visibleText) {
      els17.promptEditor.textContent = "";
    }
  }
  function syncPromptFromEditor3() {
    els17.prompt.value = getPromptText5();
  }
  function initPromptSerializationFeature() {
    Object.assign(getLegacyBridge().methods, {
      getPromptText: getPromptText5,
      promptTextFromNode,
      promptSelectionText,
      promptTextFromRange: promptTextFromRange2,
      rangeIntersectsNode: rangeIntersectsNode2,
      selectPromptEditorContents,
      setPromptText: setPromptText2,
      setPromptWithGalleryRefs,
      appendPromptText: appendPromptText4,
      clearPromptEditorIfEmpty,
      syncPromptFromEditor: syncPromptFromEditor3
    });
  }

  // codex_image/webui/frontend/src/prompt-gallery-chips.ts
  var bridge17 = getLegacyBridge();
  var state15 = bridge17.state;
  var els18 = bridge17.els;
  function legacyMethod21(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml12(value) {
    return legacyMethod21("escapeHtml", value);
  }
  function categoryLabel4(category) {
    return legacyMethod21("categoryLabel", category);
  }
  function categoryPromptRole2(category) {
    return legacyMethod21("categoryPromptRole", category);
  }
  function findGalleryItem5(itemId) {
    return legacyMethod21("findGalleryItem", itemId);
  }
  function addGalleryInput4(item, options) {
    legacyMethod21("addGalleryInput", item, options);
  }
  function gallerySource3(item) {
    return legacyMethod21("gallerySource", item);
  }
  function galleryInputs2() {
    return legacyMethod21("galleryInputs");
  }
  function renderImageStrip5() {
    legacyMethod21("renderImageStrip");
  }
  function setMode3(mode) {
    legacyMethod21("setMode", mode);
  }
  function updatePromptCount4() {
    legacyMethod21("updatePromptCount");
  }
  function updateRequestPreview8() {
    legacyMethod21("updateRequestPreview");
  }
  function getPromptText6() {
    return legacyMethod21("getPromptText");
  }
  function appendPromptText5(text) {
    legacyMethod21("appendPromptText", text);
  }
  function syncPromptFromEditor4() {
    legacyMethod21("syncPromptFromEditor");
  }
  function clearPromptEditorIfEmpty2() {
    legacyMethod21("clearPromptEditorIfEmpty");
  }
  function hideColorSuggest3() {
    legacyMethod21("hideColorSuggest");
  }
  function setCaretAfterNode3(node) {
    legacyMethod21("setCaretAfterNode", node);
  }
  function mentionRangeRect3(range) {
    return legacyMethod21("mentionRangeRect", range);
  }
  function galleryRefsByMentionLength2(refs) {
    return (Array.isArray(refs) ? refs : []).filter((ref) => ref?.name && !ref.missing && ref.image_url).slice().sort((left, right) => String(right.name || "").length - String(left.name || "").length);
  }
  function findGalleryRefMentionAt2(promptText, cursor, refs) {
    if (promptText[cursor] !== "@") return null;
    for (const ref of refs) {
      const name = String(ref.name || "");
      if (!name) continue;
      const mention = `@${name}`;
      if (promptText.startsWith(mention, cursor)) {
        return { ref, end: cursor + mention.length };
      }
    }
    return null;
  }
  function updateMentionSuggest() {
    if (!els18.mentionSuggest || !els18.promptEditor) return;
    const match = activeMentionMatch();
    if (!match) {
      hideMentionSuggest2();
      return;
    }
    const query = match.query.toLowerCase();
    const items = state15.galleryItems.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 8);
    if (!items.length) {
      hideMentionSuggest2();
      return;
    }
    els18.mentionSuggest.innerHTML = items.map((item) => `
    <button type="button" class="mention-option" data-mention-id="${escapeHtml12(item.id)}">
      <img src="${escapeHtml12(item.image_url)}" alt="">
      <span>@${escapeHtml12(item.name)}</span>
      <small>${escapeHtml12(categoryLabel4(item.category))}</small>
    </button>
  `).join("");
    els18.mentionSuggest.querySelectorAll("[data-mention-id]").forEach((button) => {
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const item = findGalleryItem5(button.dataset.mentionId);
        if (item) insertGalleryMention(item);
      });
    });
    positionMentionSuggestAtCaret(match);
    els18.mentionSuggest.classList.remove("hidden");
  }
  function activeMentionMatch() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !els18.promptEditor) return null;
    if (!els18.promptEditor.contains(selection.anchorNode)) return null;
    const selectionRange = selection.getRangeAt(0);
    let container = selectionRange.startContainer;
    let offset = selectionRange.startOffset;
    if (container.nodeType === Node.ELEMENT_NODE) {
      const previousNode = container.childNodes[offset - 1];
      if (previousNode?.nodeType !== Node.TEXT_NODE) return null;
      container = previousNode;
      offset = (previousNode.textContent || "").length;
    }
    if (container.nodeType !== Node.TEXT_NODE) return null;
    const textBeforeCaret = (container.textContent || "").slice(0, offset);
    const match = textBeforeCaret.match(/@([^\s@，。,.]*)$/);
    if (!match) return null;
    const tokenStart = offset - match[0].length;
    const range = document.createRange();
    range.setStart(container, tokenStart);
    range.setEnd(container, offset);
    return {
      query: match[1] || "",
      range
    };
  }
  function insertGalleryMention(item) {
    const match = activeMentionMatch();
    let trailingSpace = null;
    if (match?.range) {
      match.range.deleteContents();
      const chip = createGalleryChip2(item);
      trailingSpace = document.createTextNode(" ");
      match.range.insertNode(chip);
      chip.after(trailingSpace);
    } else {
      const currentText = getPromptText6();
      if (currentText && !/\s$/.test(currentText)) {
        appendPromptText5(" ");
      }
      els18.promptEditor.append(createGalleryChip2(item));
      trailingSpace = document.createTextNode(" ");
      els18.promptEditor.append(trailingSpace);
    }
    addGalleryInput4(item, { syncPrompt: false });
    syncPromptFromEditor4();
    updatePromptCount4();
    updateRequestPreview8();
    hideMentionSuggest2();
    hideColorSuggest3();
    setCaretAfterNode3(trailingSpace);
  }
  function positionMentionSuggestAtCaret(match) {
    if (!els18.mentionSuggest || !els18.promptEditor || !match?.range) return;
    const host = els18.promptEditor.closest(".prompt-editor-wrap") || els18.promptEditor;
    const anchorRect = mentionRangeRect3(match.range) || els18.promptEditor.getBoundingClientRect();
    positionPromptPopoverAtAnchor(
      els18.mentionSuggest,
      host,
      anchorRect,
      {
        left: "--mention-left",
        top: "--mention-top",
        width: "--mention-width",
        maxHeight: "--prompt-popover-max-height"
      },
      { minWidth: 220, maxWidth: 340, maxHeight: 240 }
    );
  }
  function createGalleryChip2(item) {
    const chip = document.createElement("span");
    chip.className = "gallery-chip";
    chip.contentEditable = "false";
    chip.tabIndex = 0;
    chip.draggable = true;
    chip.dataset.promptChip = "gallery";
    chip.dataset.galleryId = item.id;
    chip.dataset.galleryName = item.name;
    chip.dataset.galleryCategory = item.category || "";
    chip.dataset.galleryCategoryName = item.category_name || categoryLabel4(item.category);
    chip.dataset.galleryCategoryPromptRole = item.category_prompt_role || categoryPromptRole2(item.category);
    chip.dataset.galleryPromptNote = item.prompt_note || "";
    chip.dataset.galleryImageUrl = item.image_url || "";
    const image = document.createElement("img");
    image.src = item.image_url || "";
    image.alt = "";
    const label = document.createElement("span");
    label.textContent = `@${item.name}`;
    const remove = document.createElement("button");
    remove.className = "gallery-chip-remove";
    remove.type = "button";
    remove.setAttribute("data-remove-gallery-chip", "");
    remove.setAttribute("aria-label", `\u79FB\u9664 @${item.name}`);
    remove.textContent = "\xD7";
    chip.append(image, label, remove);
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removePromptGalleryChip3(chip);
      }
    });
    return chip;
  }
  function removePromptGalleryChip3(chip) {
    if (!chip || !els18.promptEditor?.contains(chip)) return;
    const nextNode = chip.nextSibling;
    chip.remove();
    if (nextNode?.nodeType === Node.TEXT_NODE && !nextNode.textContent.trim()) {
      nextNode.remove();
    }
    clearPromptEditorIfEmpty2();
    syncPromptFromEditor4();
    updatePromptCount4();
    const galleryInputsChanged = syncGalleryInputsFromPrompt();
    if (!galleryInputsChanged) updateRequestPreview8();
    hideMentionSuggest2();
    hideColorSuggest3();
    setCaretToEnd(els18.promptEditor);
  }
  function currentPromptGalleryIds() {
    if (!els18.promptEditor) return /* @__PURE__ */ new Set();
    return new Set(
      Array.from(els18.promptEditor.querySelectorAll(".gallery-chip[data-gallery-id]")).map((chip) => chip.dataset.galleryId).filter(Boolean)
    );
  }
  function ensurePromptGalleryMention(item) {
    if (!item || !els18.promptEditor || currentPromptGalleryIds().has(item.id)) {
      syncPromptFromEditor4();
      return;
    }
    const currentText = getPromptText6();
    if (currentText && !/\s$/.test(currentText)) {
      appendPromptText5(" ");
    }
    els18.promptEditor.append(createGalleryChip2(item));
    appendPromptText5(" ");
    syncPromptFromEditor4();
    updatePromptCount4();
    hideMentionSuggest2();
    hideColorSuggest3();
  }
  function syncGalleryInputsFromPrompt() {
    const chips = Array.from(els18.promptEditor?.querySelectorAll(".gallery-chip[data-gallery-id]") || []);
    const mentionedIds = new Set(chips.map((chip) => chip.dataset.galleryId).filter(Boolean));
    const beforeKey = imageSourcesKey(state15.images);
    const uploads = state15.images.filter((source) => source.kind !== "gallery");
    const existingById = new Map(state15.images.filter((source) => source.kind === "gallery").map((source) => [source.id, source]));
    const galleries = chips.map((chip) => {
      const itemId = chip.dataset.galleryId;
      const existing = existingById.get(itemId);
      if (existing) return existing;
      const item = findGalleryItem5(itemId);
      if (item) return gallerySource3(item);
      return gallerySource3({
        id: itemId,
        name: chip.dataset.galleryName || chip.textContent.replace(/^@/, "").trim() || "\u56FE\u5E93\u56FE\u7247",
        category: chip.dataset.galleryCategory || "",
        category_name: chip.dataset.galleryCategoryName || "",
        category_prompt_role: chip.dataset.galleryCategoryPromptRole || "",
        prompt_note: chip.dataset.galleryPromptNote || "",
        image_url: chip.dataset.galleryImageUrl || "",
        missing: true
      });
    }).filter((source) => source.id && mentionedIds.has(source.id));
    state15.images = [...uploads, ...galleries];
    if (imageSourcesKey(state15.images) === beforeKey) return false;
    if (!state15.images.length) {
      setMode3("generate");
    }
    renderImageStrip5();
    updateRequestPreview8();
    return true;
  }
  function imageSourcesKey(sources) {
    return JSON.stringify((sources || []).map((source) => [
      source.kind,
      source.kind === "gallery" ? source.id : source.name,
      Boolean(source.missing)
    ]));
  }
  function syncPromptGalleryMentionsFromInputs() {
    if (!els18.promptEditor) return false;
    const selectedGalleryIds = new Set(galleryInputs2().map((source) => source.id));
    let changed = false;
    els18.promptEditor.querySelectorAll(".gallery-chip[data-gallery-id]").forEach((chip) => {
      if (!selectedGalleryIds.has(chip.dataset.galleryId)) {
        chip.remove();
        changed = true;
      }
    });
    if (!changed) return false;
    clearPromptEditorIfEmpty2();
    syncPromptFromEditor4();
    updatePromptCount4();
    return true;
  }
  function hideMentionSuggest2() {
    if (!els18.mentionSuggest) return;
    els18.mentionSuggest.classList.add("hidden");
    els18.mentionSuggest.innerHTML = "";
    els18.mentionSuggest.style.removeProperty("--mention-left");
    els18.mentionSuggest.style.removeProperty("--mention-top");
    els18.mentionSuggest.style.removeProperty("--mention-width");
    els18.mentionSuggest.style.removeProperty("--prompt-popover-max-height");
  }
  function setCaretToEnd(element2) {
    legacyMethod21("setCaretToEnd", element2);
  }
  function initPromptGalleryChipsFeature() {
    Object.assign(getLegacyBridge().methods, {
      galleryRefsByMentionLength: galleryRefsByMentionLength2,
      findGalleryRefMentionAt: findGalleryRefMentionAt2,
      updateMentionSuggest,
      activeMentionMatch,
      insertGalleryMention,
      positionMentionSuggestAtCaret,
      createGalleryChip: createGalleryChip2,
      removePromptGalleryChip: removePromptGalleryChip3,
      currentPromptGalleryIds,
      ensurePromptGalleryMention,
      syncGalleryInputsFromPrompt,
      imageSourcesKey,
      syncPromptGalleryMentionsFromInputs,
      hideMentionSuggest: hideMentionSuggest2
    });
  }

  // codex_image/webui/frontend/src/prompt-editor-paste.ts
  var bridge18 = getLegacyBridge();
  var els19 = bridge18.els;
  function legacyMethod22(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function rangeIntersectsNode3(range, node) {
    return legacyMethod22("rangeIntersectsNode", range, node);
  }
  function setCaretAfterNode4(node) {
    legacyMethod22("setCaretAfterNode", node);
  }
  function syncPromptAfterChipMutation3() {
    legacyMethod22("syncPromptAfterChipMutation");
  }
  function updateMentionSuggest2() {
    legacyMethod22("updateMentionSuggest");
  }
  function updateColorSuggest3() {
    legacyMethod22("updateColorSuggest");
  }
  function updatePromptSnippetSuggest2() {
    legacyMethod22("updatePromptSnippetSuggest");
  }
  function clipboardHasImageFile(data) {
    return Array.from(data.items || []).some((item) => item.kind === "file" && item.type?.startsWith("image/"));
  }
  function promptPlainTextFromHtml(html) {
    const container = document.createElement("div");
    container.innerHTML = String(html || "");
    return normalizePromptPasteText(promptPlainTextFromHtmlNode(container));
  }
  function promptPlainTextFromHtmlNode(node) {
    let text = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tagName = child.tagName;
      if (tagName === "BR") {
        text += "\n";
        return;
      }
      const isBlock = ["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"].includes(tagName);
      if (isBlock && text && !text.endsWith("\n")) text += "\n";
      text += promptPlainTextFromHtmlNode(child);
      if (isBlock && text && !text.endsWith("\n")) text += "\n";
    });
    return text;
  }
  function normalizePromptPasteText(text) {
    return String(text || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function promptPasteTextFromClipboard(data) {
    const plain = data.getData("text/plain");
    if (plain) return normalizePromptPasteText(plain);
    const html = data.getData("text/html");
    return html ? promptPlainTextFromHtml(html) : "";
  }
  function insertPlainPromptText(text) {
    if (!els19.promptEditor) return;
    const normalized = normalizePromptPasteText(text);
    if (!normalized) return;
    els19.promptEditor.focus();
    const textNode = document.createTextNode(normalized);
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      els19.promptEditor.append(textNode);
      setCaretAfterNode4(textNode);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!rangeIntersectsNode3(range, els19.promptEditor)) {
      els19.promptEditor.append(textNode);
      setCaretAfterNode4(textNode);
      return;
    }
    range.deleteContents();
    range.insertNode(textNode);
    setCaretAfterNode4(textNode);
  }
  function handlePromptEditorPaste(event) {
    if (!event.clipboardData || !els19.promptEditor?.contains(event.target)) return;
    if (clipboardHasImageFile(event.clipboardData)) return;
    const text = promptPasteTextFromClipboard(event.clipboardData);
    if (!text) return;
    event.preventDefault();
    insertPlainPromptText(text);
    syncPromptAfterChipMutation3();
    updateMentionSuggest2();
    updateColorSuggest3();
    updatePromptSnippetSuggest2();
  }

  // codex_image/webui/frontend/src/prompt-editor-events.ts
  var bridge19 = getLegacyBridge();
  var state16 = bridge19.state;
  var els20 = bridge19.els;
  function legacyMethod23(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function getPromptText7() {
    return legacyMethod23("getPromptText");
  }
  function promptTextFromNode2(node) {
    return legacyMethod23("promptTextFromNode", node);
  }
  function promptSelectionText2() {
    return legacyMethod23("promptSelectionText");
  }
  function rangeIntersectsNode4(range, node) {
    return legacyMethod23("rangeIntersectsNode", range, node);
  }
  function selectPromptEditorContents2() {
    legacyMethod23("selectPromptEditorContents");
  }
  function syncGalleryInputsFromPrompt2() {
    return legacyMethod23("syncGalleryInputsFromPrompt");
  }
  function updateMentionSuggest3() {
    legacyMethod23("updateMentionSuggest");
  }
  function hideMentionSuggest3() {
    legacyMethod23("hideMentionSuggest");
  }
  function hideColorSuggest4() {
    legacyMethod23("hideColorSuggest");
  }
  function updateColorSuggest4() {
    legacyMethod23("updateColorSuggest");
  }
  function insertColorCode2(colorCode) {
    legacyMethod23("insertColorCode", colorCode);
  }
  function openColorChipEditor2(chip) {
    legacyMethod23("openColorChipEditor", chip);
  }
  function hidePromptSnippetSuggest3() {
    legacyMethod23("hidePromptSnippetSuggest");
  }
  function hidePromptSnippetSelectionButton3() {
    legacyMethod23("hidePromptSnippetSelectionButton");
  }
  function closePromptSnippetPopover3() {
    legacyMethod23("closePromptSnippetPopover");
  }
  function promptSnippetSuggestElement2() {
    return legacyMethod23("promptSnippetSuggestElement");
  }
  function findPromptSnippetById2(id) {
    return legacyMethod23("findPromptSnippetById", id);
  }
  function insertPromptSnippet2(snippet) {
    legacyMethod23("insertPromptSnippet", snippet);
  }
  function updatePromptSnippetSuggest3() {
    legacyMethod23("updatePromptSnippetSuggest");
  }
  function updatePromptSnippetSelectionButton2() {
    legacyMethod23("updatePromptSnippetSelectionButton");
  }
  function openPromptSnippetChipPopover2(chip) {
    legacyMethod23("openPromptSnippetChipPopover", chip);
  }
  function updatePromptCount5() {
    legacyMethod23("updatePromptCount");
  }
  function updateRequestPreview9() {
    legacyMethod23("updateRequestPreview");
  }
  function removePromptGalleryChip4(chip) {
    legacyMethod23("removePromptGalleryChip", chip);
  }
  function findGalleryItem6(itemId) {
    return legacyMethod23("findGalleryItem", itemId);
  }
  function insertGalleryMention2(item) {
    legacyMethod23("insertGalleryMention", item);
  }
  function handlePromptEditorCopy(event) {
    if (!event.clipboardData) return;
    const text = promptSelectionText2();
    if (!text) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
  }
  function promptEditorFocusInside() {
    const activeElement = document.activeElement;
    return Boolean(activeElement && els20.promptEditor && els20.promptEditor.contains(activeElement));
  }
  function updatePromptChipSelectionState2() {
    const chips = Array.from(els20.promptEditor?.querySelectorAll(".gallery-chip, .color-chip, .prompt-snippet-chip") || []);
    if (!chips.length) return;
    const selection = window.getSelection();
    const ranges = [];
    if (selection && !selection.isCollapsed && selection.rangeCount && els20.promptEditor) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index);
        if (rangeIntersectsNode4(range, els20.promptEditor)) ranges.push(range);
      }
    }
    chips.forEach((chip) => {
      const selected = ranges.some((range) => rangeIntersectsNode4(range, chip));
      chip.classList.toggle("prompt-chip-selected", selected);
    });
  }
  function syncPromptFromEditor5() {
    els20.prompt.value = getPromptText7();
  }
  function handlePromptEditorKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectPromptEditorContents2();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      const chip = promptChipAtCaretForDeletion(event.key) || promptChipFallbackForDeletion(event.key);
      if (chip) {
        event.preventDefault();
        removePromptGalleryChip4(chip);
        return;
      }
    }
    if (event.key === "Escape") {
      hideMentionSuggest3();
      hideColorSuggest4();
      hidePromptSnippetSuggest3();
      hidePromptSnippetSelectionButton3();
      closePromptSnippetPopover3();
      return;
    }
    if (event.key === "Enter" && !els20.colorSuggest.classList.contains("hidden")) {
      event.preventDefault();
      const input = els20.colorSuggest.querySelector("[data-color-hex-input]");
      insertColorCode2(input?.value || state16.selectedColorCode);
      return;
    }
    if (event.key === "Enter" && !els20.mentionSuggest.classList.contains("hidden")) {
      const first = els20.mentionSuggest.querySelector("[data-mention-id]");
      if (first) {
        event.preventDefault();
        const item = findGalleryItem6(first.dataset.mentionId);
        if (item) insertGalleryMention2(item);
      }
      return;
    }
    const promptSnippetSuggest = promptSnippetSuggestElement2();
    if (event.key === "Enter" && promptSnippetSuggest && !promptSnippetSuggest.classList.contains("hidden")) {
      const first = promptSnippetSuggest.querySelector("[data-prompt-snippet-id]");
      if (first) {
        event.preventDefault();
        const snippet = findPromptSnippetById2(first.dataset.promptSnippetId);
        if (snippet) insertPromptSnippet2(snippet);
      }
    }
  }
  function handlePromptEditorClick(event) {
    const removeButton = event.target.closest?.("[data-remove-gallery-chip], [data-remove-color-chip], [data-remove-prompt-snippet-chip]");
    if (removeButton && els20.promptEditor.contains(removeButton)) {
      event.preventDefault();
      event.stopPropagation();
      removePromptGalleryChip4(removeButton.closest(".gallery-chip, .color-chip, .prompt-snippet-chip"));
      return;
    }
    const editColorButton = event.target.closest?.("[data-edit-color-chip]");
    if (editColorButton && els20.promptEditor.contains(editColorButton)) {
      event.preventDefault();
      event.stopPropagation();
      openColorChipEditor2(editColorButton.closest(".color-chip"));
      return;
    }
    const snippetChip = event.target.closest?.(".prompt-snippet-chip");
    if (snippetChip && els20.promptEditor.contains(snippetChip) && !event.target.closest?.("[data-remove-prompt-snippet-chip]")) {
      event.preventDefault();
      event.stopPropagation();
      openPromptSnippetChipPopover2(snippetChip);
    }
  }
  function promptChipAtCaretForDeletion(key) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !els20.promptEditor) return null;
    if (!els20.promptEditor.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0);
    const isBackspace = key === "Backspace";
    const container = range.startContainer;
    const offset = range.startOffset;
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || "";
      if (isBackspace && offset > 0) return null;
      if (!isBackspace && offset < text.length) return null;
      const sibling = isBackspace ? container.previousSibling : container.nextSibling;
      return sibling?.nodeType === Node.ELEMENT_NODE && isPromptAtomicChip(sibling) ? sibling : null;
    }
    if (container.nodeType === Node.ELEMENT_NODE) {
      const children = Array.from(container.childNodes);
      const candidate = children[isBackspace ? offset - 1 : offset];
      return candidate?.nodeType === Node.ELEMENT_NODE && isPromptAtomicChip(candidate) ? candidate : null;
    }
    return null;
  }
  function promptChipFallbackForDeletion(key) {
    if (!els20.promptEditor) return null;
    const chips = Array.from(els20.promptEditor.querySelectorAll(".gallery-chip[data-gallery-id], .color-chip[data-color-code], .prompt-snippet-chip[data-prompt-snippet-tag]"));
    if (!chips.length) return null;
    const textWithoutChips = Array.from(els20.promptEditor.childNodes).reduce((text, child) => {
      if (child.nodeType === Node.ELEMENT_NODE && isPromptAtomicChip(child)) {
        return text;
      }
      return text + (child.textContent || "");
    }, "");
    if (textWithoutChips.trim()) return null;
    return key === "Backspace" ? chips[chips.length - 1] : chips[0];
  }
  function isPromptAtomicChip(node) {
    return Boolean(node?.classList?.contains("gallery-chip") || node?.classList?.contains("color-chip") || node?.classList?.contains("prompt-snippet-chip"));
  }
  function promptChipFromEvent(event) {
    const chip = event.target.closest?.(".gallery-chip, .color-chip, .prompt-snippet-chip");
    if (!chip || !els20.promptEditor?.contains(chip)) return null;
    return chip;
  }
  function handlePromptChipDragStart(event) {
    const chip = promptChipFromEvent(event);
    if (!chip || event.target.closest?.("[data-remove-gallery-chip], [data-remove-color-chip], [data-remove-prompt-snippet-chip]")) {
      event.preventDefault();
      return;
    }
    state16.draggedPromptChip = chip;
    chip.classList.add("prompt-chip-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", promptTextFromNode2(chip));
  }
  function handlePromptChipDragOver(event) {
    if (!state16.draggedPromptChip) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearPromptChipDropClasses();
    const targetChip = promptDropTargetChip(event);
    if (!targetChip) return;
    targetChip.classList.add(promptDropPlacement(event, targetChip) === "before" ? "prompt-chip-drop-before" : "prompt-chip-drop-after");
  }
  function handlePromptEditorDrop(event) {
    handlePromptChipDrop(event);
  }
  function handlePromptChipDrop(event) {
    const chip = state16.draggedPromptChip;
    if (!chip || !els20.promptEditor?.contains(chip)) return;
    event.preventDefault();
    clearPromptChipDropClasses();
    const targetChip = promptDropTargetChip(event);
    if (targetChip) {
      const insertBefore = promptDropPlacement(event, targetChip) === "before" ? targetChip : targetChip.nextSibling;
      els20.promptEditor.insertBefore(chip, insertBefore);
    } else {
      const range = promptRangeFromPoint(event.clientX, event.clientY);
      if (range && els20.promptEditor.contains(range.startContainer)) {
        range.insertNode(chip);
      } else {
        els20.promptEditor.append(chip);
      }
    }
    const trailingBoundary = normalizePromptChipBoundaries(chip);
    syncPromptAfterChipMutation4();
    setCaretAfterNode5(trailingBoundary || chip);
  }
  function handlePromptChipDragEnd() {
    state16.draggedPromptChip?.classList.remove("prompt-chip-dragging");
    state16.draggedPromptChip = null;
    clearPromptChipDropClasses();
  }
  function promptDropTargetChip(event) {
    const chip = promptChipFromEvent(event);
    if (!chip || chip === state16.draggedPromptChip) return null;
    return chip;
  }
  function promptDropPlacement(event, chip) {
    const rect = chip.getBoundingClientRect();
    const horizontal = rect.width >= rect.height;
    const position = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
    const size = horizontal ? rect.width : rect.height;
    return position < size / 2 ? "before" : "after";
  }
  function clearPromptChipDropClasses() {
    els20.promptEditor?.querySelectorAll(".prompt-chip-drop-before, .prompt-chip-drop-after").forEach((chip) => {
      chip.classList.remove("prompt-chip-drop-before", "prompt-chip-drop-after");
    });
  }
  function promptRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }
  function normalizePromptChipBoundaries(chip) {
    if (!chip || !els20.promptEditor?.contains(chip)) return null;
    ensurePromptChipLeadingBoundary(chip);
    return ensurePromptChipTrailingBoundary(chip);
  }
  function ensurePromptChipLeadingBoundary(chip) {
    const previousNode = chip.previousSibling;
    if (!previousNode) return null;
    if (previousNode.nodeType === Node.TEXT_NODE && /[\s\u00a0]$/.test(previousNode.textContent || "")) {
      return null;
    }
    els20.promptEditor.insertBefore(document.createTextNode(" "), chip);
    return chip.previousSibling;
  }
  function ensurePromptChipTrailingBoundary(chip) {
    const nextNode = chip.nextSibling;
    if (!nextNode) {
      chip.after(document.createTextNode(" "));
      return chip.nextSibling;
    }
    if (nextNode.nodeType === Node.TEXT_NODE && /^[\s\u00a0]/.test(nextNode.textContent || "")) {
      return null;
    }
    els20.promptEditor.insertBefore(document.createTextNode(" "), nextNode);
    return chip.nextSibling;
  }
  function syncPromptAfterChipMutation4() {
    clearPromptEditorIfEmpty3();
    syncPromptFromEditor5();
    updatePromptCount5();
    const galleryInputsChanged = syncGalleryInputsFromPrompt2();
    if (!galleryInputsChanged) updateRequestPreview9();
    hideMentionSuggest3();
    hideColorSuggest4();
    hidePromptSnippetSuggest3();
  }
  function mentionRangeRect4(range) {
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) return rect;
    const rects = range.getClientRects();
    return rects.length ? rects[0] : null;
  }
  function clearPromptEditorIfEmpty3() {
    if (!els20.promptEditor) return;
    const visibleText = promptTextFromNode2(els20.promptEditor).replace(/\u00a0/g, " ").trim();
    if (!visibleText) {
      els20.promptEditor.textContent = "";
    }
  }
  function setCaretToEnd2(element2) {
    element2.focus();
    const range = document.createRange();
    range.selectNodeContents(element2);
    range.collapse(false);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function setCaretAfterNode5(node) {
    if (!node) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    els20.promptEditor?.focus();
  }
  function bindPromptEditorEvents() {
    els20.promptEditor?.addEventListener("input", () => {
      syncPromptFromEditor5();
      updatePromptCount5();
      const galleryInputsChanged = syncGalleryInputsFromPrompt2();
      updateMentionSuggest3();
      updateColorSuggest4();
      updatePromptSnippetSuggest3();
      if (!galleryInputsChanged) updateRequestPreview9();
    });
    els20.promptEditor?.addEventListener("keyup", (event) => {
      if (event.key === "Escape") return;
      updateMentionSuggest3();
      updateColorSuggest4();
      updatePromptSnippetSuggest3();
      updatePromptSnippetSelectionButton2();
    });
    els20.promptEditor?.addEventListener("keydown", handlePromptEditorKeydown);
    els20.promptEditor?.addEventListener("copy", handlePromptEditorCopy);
    els20.promptEditor?.addEventListener("paste", handlePromptEditorPaste);
    els20.promptEditor?.addEventListener("click", handlePromptEditorClick);
    els20.promptEditor?.addEventListener("dragstart", handlePromptChipDragStart);
    els20.promptEditor?.addEventListener("dragover", handlePromptChipDragOver);
    els20.promptEditor?.addEventListener("drop", handlePromptChipDrop);
    els20.promptEditor?.addEventListener("dragend", handlePromptChipDragEnd);
    els20.promptEditor?.addEventListener("mouseup", updatePromptSnippetSelectionButton2);
    els20.promptEditor?.addEventListener("blur", () => {
      window.setTimeout(() => {
        hideMentionSuggest3();
        hidePromptSnippetSuggest3();
        if (!els20.colorSuggest?.contains(document.activeElement) && !promptEditorFocusInside()) hideColorSuggest4();
      }, 160);
    });
    document.addEventListener("selectionchange", () => {
      updatePromptChipSelectionState2();
      updatePromptSnippetSelectionButton2();
    });
  }
  function initPromptEditorEventsFeature() {
    Object.assign(getLegacyBridge().methods, {
      handlePromptEditorCopy,
      promptPlainTextFromHtml,
      promptPasteTextFromClipboard,
      insertPlainPromptText,
      handlePromptEditorPaste,
      promptEditorFocusInside,
      updatePromptChipSelectionState: updatePromptChipSelectionState2,
      syncPromptFromEditor: syncPromptFromEditor5,
      handlePromptEditorKeydown,
      handlePromptEditorClick,
      promptChipAtCaretForDeletion,
      promptChipFallbackForDeletion,
      isPromptAtomicChip,
      promptChipFromEvent,
      handlePromptChipDragStart,
      handlePromptChipDragOver,
      handlePromptEditorDrop,
      handlePromptChipDrop,
      handlePromptChipDragEnd,
      promptDropTargetChip,
      promptDropPlacement,
      clearPromptChipDropClasses,
      promptRangeFromPoint,
      normalizePromptChipBoundaries,
      ensurePromptChipLeadingBoundary,
      ensurePromptChipTrailingBoundary,
      syncPromptAfterChipMutation: syncPromptAfterChipMutation4,
      mentionRangeRect: mentionRangeRect4,
      clearPromptEditorIfEmpty: clearPromptEditorIfEmpty3,
      setCaretToEnd: setCaretToEnd2,
      setCaretAfterNode: setCaretAfterNode5,
      bindPromptEditorEvents
    });
  }

  // codex_image/webui/frontend/src/prompt-model.ts
  var bridge20 = getLegacyBridge();
  var els21 = bridge20.els;
  function legacyMethod24(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function getPromptText8() {
    return legacyMethod24("getPromptText");
  }
  function expandPromptSnippets2(prompt) {
    return legacyMethod24("expandPromptSnippets", prompt);
  }
  function galleryInputs3() {
    return legacyMethod24("galleryInputs");
  }
  function uploadInputs2() {
    return legacyMethod24("uploadInputs");
  }
  function referenceAssetInputs2() {
    return legacyMethod24("referenceAssetInputs");
  }
  function categoryPromptRole3(category) {
    return legacyMethod24("categoryPromptRole", category);
  }
  function promptTokenReplacement(prompt) {
    return expandPromptSnippets2(prompt);
  }
  function galleryPromptText(galleries = galleryInputs3()) {
    if (!galleries.length) return "";
    const referenceOffset = uploadInputs2().length + referenceAssetInputs2().length;
    const lines = galleries.map((source, index) => galleryReferenceInstruction(source, referenceOffset + index + 1));
    return `\u53C2\u8003\u56FE\u8BF4\u660E\uFF1A
${lines.join("\n")}`;
  }
  function buildPromptForModel() {
    const prompt = expandPromptSnippets2(getPromptText8());
    const galleries = galleryInputs3();
    const galleryText = galleryPromptText(galleries);
    if (!galleryText) return prompt;
    return `${prompt}

${galleryText}`;
  }
  function galleryReferenceInstruction(source, number) {
    const role = source.category_prompt_role || categoryPromptRole3(source.category);
    const promptNote = String(source.prompt_note || "").trim();
    return `- \u53C2\u8003\u56FE ${number}\uFF1A\u56FE\u5E93\u300C${source.name}\u300D\uFF0C\u7528\u9014\uFF1A${role}\u3002\u63D0\u793A\u8BCD\u4E2D\u7684 @${source.name} \u6307\u8FD9\u5F20\u56FE\u3002${promptNote ? ` ${promptNote}` : ""}`;
  }
  function currentPromptForModel() {
    return currentPromptFidelity() === "original" ? expandPromptSnippets2(getPromptText8()) : buildPromptForModel();
  }
  function currentPromptFidelity() {
    const value = els21.promptFidelity?.value || "strict";
    return ["strict", "original", "off"].includes(value) ? value : "strict";
  }
  function initPromptModelFeature() {
    Object.assign(getLegacyBridge().methods, {
      promptTokenReplacement,
      galleryPromptText,
      buildPromptForModel,
      galleryReferenceInstruction,
      currentPromptForModel,
      currentPromptFidelity
    });
  }

  // codex_image/webui/frontend/src/prompt.ts
  var bridge21 = getLegacyBridge();
  var els22 = bridge21.els;
  var promptFeatureInitialized = false;
  function legacyMethod25(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function closePromptColorSuggest() {
    legacyMethod25("hideColorSuggest");
  }
  function handlePromptSnippetDocumentClick2(target) {
    legacyMethod25("handlePromptSnippetDocumentClick", target);
  }
  function handlePromptDocumentClick(event) {
    const target = event.target;
    if (els22.colorSuggest && !els22.colorSuggest.classList.contains("hidden")) {
      const clickedColorSuggest = els22.colorSuggest.contains(target);
      const clickedPromptEditor = els22.promptEditor?.contains(target);
      if (!clickedColorSuggest && !clickedPromptEditor) {
        closePromptColorSuggest();
      }
    }
    handlePromptSnippetDocumentClick2(target);
  }
  function initPromptFeature() {
    if (promptFeatureInitialized) return;
    promptFeatureInitialized = true;
    initPromptSerializationFeature();
    initPromptGalleryChipsFeature();
    initPromptEditorEventsFeature();
    initPromptModelFeature();
    Object.assign(getLegacyBridge().methods, {
      handlePromptDocumentClick
    });
    bindPromptEditorEvents();
  }

  // codex_image/webui/frontend/src/prompt-find-replace.ts
  var bridge22 = getLegacyBridge();
  var els23 = bridge22.els;
  var PROMPT_FIND_ELEMENT_NODE = 1;
  var PROMPT_FIND_TEXT_NODE = 3;
  var promptFindInitialized = false;
  var promptFindMatches = [];
  function legacyMethod26(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function syncPromptAfterFindMutation() {
    legacyMethod26("syncPromptFromEditor");
    legacyMethod26("syncGalleryInputsFromPrompt");
    legacyMethod26("updatePromptCount");
    legacyMethod26("updateRequestPreview");
  }
  function promptFindCell() {
    return els23.promptFindPanel?.closest(".prompt-template-recent-cell") || null;
  }
  function promptFindQuery() {
    return String(els23.promptFindInput?.value || "");
  }
  function promptFindReplacement() {
    return String(els23.promptReplaceInput?.value || "");
  }
  function isPromptFindOpen() {
    return Boolean(els23.promptFindPanel && !els23.promptFindPanel.classList.contains("hidden"));
  }
  function isNodeInsidePromptAtomicChip(node) {
    const element2 = node.nodeType === PROMPT_FIND_ELEMENT_NODE ? node : node.parentElement || (node.parentNode?.nodeType === PROMPT_FIND_ELEMENT_NODE ? node.parentNode : null);
    return Boolean(element2?.closest(".gallery-chip, .color-chip, .prompt-snippet-chip"));
  }
  function collectPromptFindMatchesFromNode(node, needle, matches) {
    if (isNodeInsidePromptAtomicChip(node)) return;
    if (node.nodeType === PROMPT_FIND_TEXT_NODE) {
      const textNode = node;
      const text = textNode.textContent || "";
      let start = text.indexOf(needle);
      while (start !== -1) {
        matches.push({ node: textNode, start, end: start + needle.length });
        start = text.indexOf(needle, start + needle.length);
      }
      return;
    }
    Array.from(node.childNodes || []).forEach((child) => collectPromptFindMatchesFromNode(child, needle, matches));
  }
  function collectPromptFindMatches(query = promptFindQuery()) {
    const root = els23.promptEditor;
    const needle = String(query || "");
    if (!root || !needle) return [];
    root.normalize();
    const matches = [];
    collectPromptFindMatchesFromNode(root, needle, matches);
    return matches;
  }
  function promptFindActionButtons() {
    return Array.from(els23.promptFindPanel?.querySelectorAll("[data-prompt-find-action]") || []);
  }
  function setPromptFindStatus(message) {
    if (els23.promptFindStatus) els23.promptFindStatus.textContent = message;
  }
  function setPromptFindCount(count = promptFindMatches.length) {
    if (els23.promptFindCount) {
      els23.promptFindCount.textContent = `${count} \u5904`;
    }
  }
  function updatePromptFindControls() {
    const hasQuery = Boolean(promptFindQuery());
    promptFindActionButtons().forEach((button) => {
      const action = button.dataset.promptFindAction || "";
      button.disabled = (action === "count" || action === "replace-all") && !hasQuery;
    });
  }
  function countPromptFindMatches() {
    promptFindMatches = collectPromptFindMatches();
    setPromptFindCount();
    setPromptFindStatus(promptFindMatches.length ? `\u627E\u5230 ${promptFindMatches.length} \u5904` : "\u672A\u627E\u5230\u5339\u914D\u6587\u672C");
    updatePromptFindControls();
  }
  function replaceAllPromptMatches() {
    const matches = collectPromptFindMatches();
    promptFindMatches = matches;
    if (!matches.length) {
      setPromptFindCount(0);
      setPromptFindStatus("\u672A\u627E\u5230\u5339\u914D\u6587\u672C");
      updatePromptFindControls();
      return;
    }
    const replacement = promptFindReplacement();
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      if (!match) continue;
      const text = match.node.textContent || "";
      match.node.textContent = `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`;
    }
    syncPromptAfterFindMutation();
    promptFindMatches = collectPromptFindMatches();
    setPromptFindCount();
    setPromptFindStatus(`\u5DF2\u66FF\u6362 ${matches.length} \u5904`);
    updatePromptFindControls();
  }
  function clearPromptFindResult() {
    promptFindMatches = [];
    setPromptFindCount(0);
    setPromptFindStatus("");
    updatePromptFindControls();
  }
  function setPromptFindOpen(open) {
    if (!els23.promptFindPanel) return;
    els23.promptFindPanel.classList.toggle("hidden", !open);
    promptFindCell()?.classList.toggle("find-active", open);
    els23.promptFindButton?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      clearPromptFindResult();
      els23.promptFindInput?.focus({ preventScroll: true });
      return;
    }
    clearPromptFindResult();
    els23.promptFindButton?.focus({ preventScroll: true });
  }
  function handlePromptFindAction(action) {
    if (action === "count") {
      countPromptFindMatches();
    } else if (action === "replace-all") {
      replaceAllPromptMatches();
    }
  }
  function bindPromptFindActionButtons() {
    promptFindActionButtons().forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        handlePromptFindAction(button.dataset.promptFindAction || "");
      });
    });
  }
  function handlePromptFindKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setPromptFindOpen(false);
    }
  }
  function handlePromptFindShortcut(event) {
    const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";
    if (!isFindShortcut || event.altKey || event.shiftKey) {
      return;
    }
    const activeElement = document.activeElement;
    const insidePromptEditor = Boolean(activeElement && els23.promptEditor?.contains(activeElement));
    const insideFindPanel = Boolean(activeElement && els23.promptFindPanel?.contains(activeElement));
    if (!insidePromptEditor && !insideFindPanel) return;
    event.preventDefault();
    setPromptFindOpen(true);
  }
  function initPromptFindReplaceFeature() {
    if (promptFindInitialized) return;
    promptFindInitialized = true;
    if (!els23.promptFindButton || !els23.promptFindPanel || !els23.promptFindInput) return;
    els23.promptFindButton.addEventListener("click", () => setPromptFindOpen(!isPromptFindOpen()));
    bindPromptFindActionButtons();
    els23.promptFindClose?.addEventListener("click", () => setPromptFindOpen(false));
    els23.promptFindPanel.addEventListener("keydown", handlePromptFindKeydown);
    els23.promptFindInput.addEventListener("input", () => {
      clearPromptFindResult();
    });
    els23.promptReplaceInput?.addEventListener("input", () => {
      setPromptFindStatus("");
      updatePromptFindControls();
    });
    els23.clearPromptButton?.addEventListener("click", () => {
      if (isPromptFindOpen()) window.setTimeout(() => clearPromptFindResult(), 0);
    });
    document.addEventListener("keydown", handlePromptFindShortcut);
  }

  // codex_image/webui/frontend/src/output-controls.ts
  var { els: els24 } = getLegacyBridge();
  function legacyMethod27(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function buildPreviewRequest() {
    return legacyMethod27("buildPreviewRequest");
  }
  function updateRangeProgress(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || min);
    const progress = max > min ? (value - min) / (max - min) * 100 : 0;
    input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, progress))}%`);
  }
  function currentQuantity() {
    const value = Number.parseInt(els24.nInput?.value || "1", 10);
    if (Number.isNaN(value)) return 1;
    return Math.min(4, Math.max(1, value));
  }
  function updateQuantity() {
    if (!els24.nInput) return;
    els24.nInput.value = String(currentQuantity());
    if (els24.nValue) {
      els24.nValue.textContent = els24.nInput.value;
    }
    if (els24.nInput.matches?.('input[type="range"]')) {
      updateRangeProgress(els24.nInput);
    }
  }
  function updateCompression() {
    const compressionEnabled = els24.outputFormat.value !== "png";
    els24.compression.disabled = !compressionEnabled;
    if (!compressionEnabled) {
      closeCompressionPopover();
    }
    els24.compressionValue.textContent = `${els24.compression.value}%`;
    updateRangeProgress(els24.compression);
  }
  function openCompressionPopover() {
    if (!els24.compressionPopover || els24.outputFormat.value === "png") return;
    els24.compressionPopover.classList.remove("hidden");
    els24.compressionPopover.setAttribute("aria-hidden", "false");
  }
  function closeCompressionPopover() {
    if (!els24.compressionPopover) return;
    els24.compressionPopover.classList.add("hidden");
    els24.compressionPopover.setAttribute("aria-hidden", "true");
  }
  function handleOutputFormatDoubleClick(event) {
    const button = event.target.closest("[data-val]");
    if (!button || !["jpeg", "webp"].includes(button.dataset.val)) return;
    openCompressionPopover();
  }
  function syncRadioButtons(...selects) {
    selects.filter(Boolean).forEach((select) => {
      select.dispatchEvent(new Event("change"));
    });
  }
  function updateRequestPreview10() {
    if (!els24.requestJson) return;
    els24.requestJson.textContent = JSON.stringify(buildPreviewRequest(), null, 2);
  }

  // codex_image/webui/frontend/src/main-model-combobox.ts
  var DEFAULT_MAIN_MODEL = "gpt-5.4-mini";
  var MAIN_MODEL_OPTIONS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"];
  var RETIRED_MAIN_MODEL_OPTIONS = /* @__PURE__ */ new Set(["gpt-5.3-codex-spark"]);
  var MAIN_MODEL_STORAGE_KEY = "codex-image-main-model";
  var bridge23 = getLegacyBridge();
  var state17 = bridge23.state;
  var els25 = bridge23.els;
  function legacyMethod28(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml13(value) {
    return legacyMethod28("escapeHtml", value);
  }
  function mainModelOptionsForQuery(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return MAIN_MODEL_OPTIONS.slice();
    return MAIN_MODEL_OPTIONS.filter((model) => model.toLowerCase().includes(normalized));
  }
  function openMainModelCombobox({ showAll = false } = {}) {
    if (!els25.mainModel || !els25.mainModelOptions || !els25.mainModelCombobox) return;
    if (showAll) {
      state17.mainModelShowAllOptions = true;
      const selectedIndex = MAIN_MODEL_OPTIONS.indexOf(currentMainModel());
      state17.mainModelOptionIndex = selectedIndex >= 0 ? selectedIndex : 0;
    }
    state17.mainModelComboboxOpen = true;
    renderMainModelOptions();
    els25.mainModelOptions.classList.remove("hidden");
    els25.mainModelCombobox.setAttribute("aria-expanded", "true");
    els25.mainModel.setAttribute("aria-expanded", "true");
  }
  function closeMainModelCombobox() {
    state17.mainModelComboboxOpen = false;
    state17.mainModelOptionIndex = 0;
    state17.mainModelShowAllOptions = false;
    els25.mainModelOptions?.classList.add("hidden");
    els25.mainModelCombobox?.setAttribute("aria-expanded", "false");
    els25.mainModel?.setAttribute("aria-expanded", "false");
    els25.mainModel?.removeAttribute("aria-activedescendant");
  }
  function renderMainModelOptions() {
    if (!els25.mainModel || !els25.mainModelOptions) return;
    const query = state17.mainModelShowAllOptions ? "" : els25.mainModel.value;
    const options = mainModelOptionsForQuery(query);
    state17.mainModelOptionIndex = Math.min(Math.max(0, state17.mainModelOptionIndex), Math.max(0, options.length - 1));
    if (!options.length) {
      els25.mainModelOptions.innerHTML = `<div class="model-combobox-empty" role="option" aria-disabled="true">\u6309\u5F53\u524D\u8F93\u5165\u4F7F\u7528\u81EA\u5B9A\u4E49\u6A21\u578B</div>`;
      els25.mainModel.removeAttribute("aria-activedescendant");
      return;
    }
    els25.mainModelOptions.innerHTML = options.map((model, index) => {
      const active = index === state17.mainModelOptionIndex;
      const selected = model === currentMainModel();
      return `
      <button
        id="mainModelOption-${index}"
        class="model-combobox-option${active ? " active" : ""}${selected ? " selected" : ""}"
        type="button"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        data-main-model-option="${escapeHtml13(model)}"
      >${escapeHtml13(model)}</button>
    `;
    }).join("");
    els25.mainModel.setAttribute("aria-activedescendant", `mainModelOption-${state17.mainModelOptionIndex}`);
    els25.mainModelOptions.querySelectorAll("[data-main-model-option]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => selectMainModelOption(button.dataset.mainModelOption));
    });
  }
  function selectMainModelOption(model) {
    if (!els25.mainModel || !model) return;
    els25.mainModel.value = model;
    persistMainModel();
    updateRequestPreview10();
    closeMainModelCombobox();
    els25.mainModel.focus();
  }
  function handleMainModelKeydown(event) {
    if (!els25.mainModelOptions) return;
    const options = mainModelOptionsForQuery(els25.mainModel?.value || "");
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!state17.mainModelComboboxOpen) {
        state17.mainModelShowAllOptions = true;
        state17.mainModelOptionIndex = 0;
        openMainModelCombobox();
        return;
      }
      if (options.length) state17.mainModelOptionIndex = (state17.mainModelOptionIndex + 1) % options.length;
      renderMainModelOptions();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!state17.mainModelComboboxOpen) {
        state17.mainModelShowAllOptions = true;
        state17.mainModelOptionIndex = Math.max(0, MAIN_MODEL_OPTIONS.length - 1);
        openMainModelCombobox();
        return;
      }
      if (options.length) state17.mainModelOptionIndex = (state17.mainModelOptionIndex - 1 + options.length) % options.length;
      renderMainModelOptions();
    } else if (event.key === "Enter" && state17.mainModelComboboxOpen && options.length) {
      event.preventDefault();
      selectMainModelOption(options[state17.mainModelOptionIndex]);
    } else if (event.key === "Escape") {
      closeMainModelCombobox();
    }
  }
  function currentMainModel() {
    return (els25.mainModel?.value || DEFAULT_MAIN_MODEL).trim() || DEFAULT_MAIN_MODEL;
  }
  function restoreMainModel() {
    if (!els25.mainModel) return;
    try {
      const saved = localStorage.getItem(MAIN_MODEL_STORAGE_KEY);
      let model = (saved || DEFAULT_MAIN_MODEL).trim() || DEFAULT_MAIN_MODEL;
      if (RETIRED_MAIN_MODEL_OPTIONS.has(model)) {
        model = DEFAULT_MAIN_MODEL;
        localStorage.setItem(MAIN_MODEL_STORAGE_KEY, model);
      }
      els25.mainModel.value = model;
    } catch {
      els25.mainModel.value = DEFAULT_MAIN_MODEL;
    }
    renderMainModelOptions();
  }
  function persistMainModel() {
    if (!els25.mainModel) return;
    try {
      localStorage.setItem(MAIN_MODEL_STORAGE_KEY, currentMainModel());
    } catch {
    }
  }

  // codex_image/webui/frontend/src/size-presets.ts
  var DEFAULT_RESOLUTION = "standard";
  var DEFAULT_RATIO = "1:1";
  var DEFAULT_ORIENTATION = "square";
  var RATIO_ORIENTATION = {
    "1:1": "square",
    "4:5": "portrait",
    "5:4": "landscape",
    "3:4": "portrait",
    "4:3": "landscape",
    "2:3": "portrait",
    "3:2": "landscape",
    "9:16": "portrait",
    "16:9": "landscape",
    "9:21": "portrait",
    "21:9": "landscape"
  };
  var RATIO_COUNTERPARTS = {
    "1:1": "1:1",
    "4:5": "5:4",
    "5:4": "4:5",
    "3:4": "4:3",
    "4:3": "3:4",
    "2:3": "3:2",
    "3:2": "2:3",
    "9:16": "16:9",
    "16:9": "9:16",
    "9:21": "21:9",
    "21:9": "9:21"
  };
  var ORIENTATION_DEFAULT_RATIOS = {
    square: "1:1",
    portrait: "2:3",
    landscape: "3:2"
  };
  var GPT_IMAGE_2_SIZE_PRESETS = {
    standard: {
      "1:1": [1024, 1024],
      "4:5": [1024, 1280],
      "5:4": [1280, 1024],
      "3:4": [1152, 1536],
      "4:3": [1536, 1152],
      "2:3": [1024, 1536],
      "3:2": [1536, 1024],
      "9:16": [864, 1536],
      "16:9": [1536, 864],
      "9:21": [672, 1568],
      "21:9": [1568, 672]
    },
    "2k": {
      "1:1": [2048, 2048],
      "4:5": [1600, 2e3],
      "5:4": [2e3, 1600],
      "3:4": [1536, 2048],
      "4:3": [2048, 1536],
      "2:3": [1344, 2016],
      "3:2": [2016, 1344],
      "9:16": [1152, 2048],
      "16:9": [2048, 1152],
      "9:21": [1152, 2688],
      "21:9": [2688, 1152]
    },
    "4k": {
      "1:1": [2880, 2880],
      "4:5": [2560, 3200],
      "5:4": [3200, 2560],
      "3:4": [2448, 3264],
      "4:3": [3264, 2448],
      "2:3": [2336, 3504],
      "3:2": [3504, 2336],
      "9:16": [2160, 3840],
      "16:9": [3840, 2160],
      "9:21": [1632, 3808],
      "21:9": [3808, 1632]
    }
  };
  var GPT_IMAGE_2_MIN_PIXELS = 655360;
  var GPT_IMAGE_2_MAX_PIXELS = 8294400;
  var GPT_IMAGE_2_MAX_LONG_SHORT_RATIO = 3;
  var { els: els26 } = getLegacyBridge();
  function legacyMethod29(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function currentPromptFidelity2() {
    return legacyMethod29("currentPromptFidelity");
  }
  function presetDimensions(resolution, ratio) {
    const defaultPreset = GPT_IMAGE_2_SIZE_PRESETS[DEFAULT_RESOLUTION];
    const preset = GPT_IMAGE_2_SIZE_PRESETS[resolution] || defaultPreset;
    const dimensions = preset[ratio] || preset[DEFAULT_RATIO] || defaultPreset[DEFAULT_RATIO] || [1024, 1024];
    return dimensions;
  }
  function sizeForPreset(resolution, ratio) {
    const [width, height] = presetDimensions(resolution, ratio);
    return `${width}x${height}`;
  }
  function orientationForDimensions(width, height) {
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (numericWidth === numericHeight) return "square";
    return numericWidth > numericHeight ? "landscape" : "portrait";
  }
  function normalizeCustomDimension(value) {
    const rawValue = String(value ?? "").trim();
    if (!rawValue) return null;
    const numericValue = Number(rawValue);
    if (!Number.isInteger(numericValue)) return null;
    return numericValue;
  }
  function customDimensionValue(input) {
    return normalizeCustomDimension(input?.value);
  }
  function customSizeValidationMessage(width = customDimensionValue(els26.customWidth), height = customDimensionValue(els26.customHeight)) {
    if (width === null || height === null) return "\u8BF7\u8F93\u5165\u5BBD\u5EA6\u548C\u9AD8\u5EA6";
    if (width < 16 || width > 3840 || height < 16 || height > 3840) return "\u5BBD\u9AD8\u9700\u5728 16-3840 px \u4E4B\u95F4";
    if (width % 16 !== 0 || height % 16 !== 0) return "\u5BBD\u9AD8\u9700\u4E3A 16 \u7684\u500D\u6570";
    if (Math.max(width, height) / Math.min(width, height) > GPT_IMAGE_2_MAX_LONG_SHORT_RATIO) return "\u957F\u77ED\u8FB9\u6BD4\u4F8B\u4E0D\u80FD\u8D85\u8FC7 3:1";
    const totalPixels = width * height;
    if (totalPixels < GPT_IMAGE_2_MIN_PIXELS || totalPixels > GPT_IMAGE_2_MAX_PIXELS) return "\u603B\u50CF\u7D20\u9700\u5728 655,360-8,294,400 \u4E4B\u95F4";
    return "";
  }
  function findPresetForSize(size) {
    for (const [resolution, ratios] of Object.entries(GPT_IMAGE_2_SIZE_PRESETS)) {
      for (const [ratio, dimensions] of Object.entries(ratios)) {
        if (`${dimensions[0]}x${dimensions[1]}` === size) {
          return { resolution, ratio, orientation: RATIO_ORIENTATION[ratio] || orientationForDimensions(dimensions[0], dimensions[1]) };
        }
      }
    }
    return null;
  }
  function currentSize() {
    if (els26.size.value !== "custom") return els26.size.value;
    return `${els26.customWidth.value}x${els26.customHeight.value}`;
  }
  function currentImageToolModel() {
    return currentAuthSource2() === "api" ? currentApiImageModel() : els26.model.value;
  }
  function currentTaskParams() {
    const params = {
      main_model: currentMainModel(),
      model: currentImageToolModel(),
      size: currentSize(),
      n: currentQuantity(),
      prompt_fidelity: currentPromptFidelity2(),
      quality: els26.quality.value,
      output_format: els26.outputFormat.value,
      moderation: els26.moderation.value,
      output_compression: els26.outputFormat.value === "png" ? null : Number(els26.compression.value)
    };
    if (currentAuthSource2() === "api") {
      params.api_provider_id = currentApiProviderId();
      params.api_mode = currentApiMode3();
      params.api_images_concurrency = currentApiImagesConcurrency();
    }
    return params;
  }

  // codex_image/webui/frontend/src/custom-size-controls.ts
  var CUSTOM_SIZE_TRANSITION_MS = 220;
  var CUSTOM_SIZE_HEIGHT_SNAP_TOLERANCE = 4;
  var bridge24 = getLegacyBridge();
  var state18 = bridge24.state;
  var els27 = bridge24.els;
  var customSizeTransitionTimers = /* @__PURE__ */ new WeakMap();
  function measuredElementHeight2(element2) {
    if (!element2) return 0;
    return Math.ceil(element2.getBoundingClientRect().height);
  }
  function handleSizeModeEvent(event) {
    const button = event.target.closest?.("[data-custom-size-mode]");
    if (!button || !els27.sizeModeGroup?.contains(button)) return;
    setCustomSizeMode(button.dataset.customSizeMode === "custom");
  }
  function setCustomSizeMode(isCustom) {
    if (els27.customSizeToggle) els27.customSizeToggle.checked = Boolean(isCustom);
    updateSizeFromPreset();
  }
  function swapCustomSizeDimensions(event) {
    event?.preventDefault?.();
    if (!els27.customWidth || !els27.customHeight) return;
    const width = els27.customWidth.value;
    els27.customWidth.value = els27.customHeight.value;
    els27.customHeight.value = width;
    if (typeof swapCustomRatioDigits === "function") swapCustomRatioDigits();
    updateCustomSize();
    updatePixelPreview("custom");
    updateRequestPreview10();
  }
  function sanitizeCustomRatioInput(input) {
    const value = String(input?.value ?? "");
    const digit = value.match(/[1-9]/)?.[0] || "";
    if (input && input.value !== digit) input.value = digit;
    return digit;
  }
  function customRatioDigitValue(input) {
    const digit = sanitizeCustomRatioInput(input);
    return digit ? Number(digit) : null;
  }
  function customAspectRatioFromManualInputs() {
    const widthRatio = customRatioDigitValue(els27.customRatioWidth);
    const heightRatio = customRatioDigitValue(els27.customRatioHeight);
    if (!widthRatio || !heightRatio) return null;
    return widthRatio / heightRatio;
  }
  function normalizeAspectDimension(value) {
    const steppedValue = Math.round(value / 16) * 16;
    const boundedValue = Math.min(3840, Math.max(16, steppedValue));
    return String(boundedValue);
  }
  function updateCustomRatioFieldState() {
    const locked = Boolean(state18.customAspectRatioLocked);
    els27.customRatioField?.classList.toggle("active", locked);
  }
  function setCustomAspectRatioFromManualInputs() {
    const ratio = customAspectRatioFromManualInputs();
    state18.customAspectRatioLocked = Boolean(ratio);
    state18.customAspectRatioValue = ratio;
    state18.customAspectRatioSource = "manual";
    updateCustomRatioFieldState();
  }
  function applyCustomAspectRatioFromWidth() {
    if (!state18.customAspectRatioLocked || !state18.customAspectRatioValue) return;
    if (!els27.customWidth || !els27.customHeight) return;
    const width = customDimensionValue(els27.customWidth);
    if (!width) return;
    els27.customHeight.value = normalizeAspectDimension(width / state18.customAspectRatioValue);
  }
  function handleCustomRatioInput(input) {
    sanitizeCustomRatioInput(input);
    setCustomAspectRatioFromManualInputs();
    applyCustomAspectRatioFromWidth();
  }
  function singleDigitAspectRatioForDimensions(width, height) {
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) return null;
    function gcd(left, right) {
      let a = Math.round(Math.abs(left));
      let b = Math.round(Math.abs(right));
      while (b) {
        const remainder = a % b;
        a = b;
        b = remainder;
      }
      return a || 1;
    }
    const divisor = gcd(numericWidth, numericHeight);
    const reducedWidth = Math.round(numericWidth / divisor);
    const reducedHeight = Math.round(numericHeight / divisor);
    if (reducedWidth >= 1 && reducedWidth <= 9 && reducedHeight >= 1 && reducedHeight <= 9) {
      return { width: reducedWidth, height: reducedHeight };
    }
    const targetRatio = numericWidth / numericHeight;
    let best = { width: 1, height: 1, error: Number.POSITIVE_INFINITY };
    for (let widthRatio = 1; widthRatio <= 9; widthRatio += 1) {
      for (let heightRatio = 1; heightRatio <= 9; heightRatio += 1) {
        const candidateRatio = widthRatio / heightRatio;
        const error = Math.abs(Math.log(candidateRatio / targetRatio));
        if (error < best.error) {
          best = { width: widthRatio, height: heightRatio, error };
        }
      }
    }
    return { width: best.width, height: best.height };
  }
  function firstReferenceImageSource() {
    return (Array.isArray(state18.images) ? state18.images : []).find((source) => source && !source.missing && Boolean(sourceUrlForAspectRatio(source)));
  }
  function updateCustomRatioReferenceButtonState() {
    if (!els27.customRatioFromImageButton) return;
    const enabled = Boolean(firstReferenceImageSource());
    els27.customRatioFromImageButton.disabled = !enabled;
    els27.customRatioFromImageButton.setAttribute("aria-disabled", enabled ? "false" : "true");
  }
  function sourceUrlForAspectRatio(source) {
    if (!source || source.missing) return "";
    if (source.kind === "upload") return source.previewUrl || "";
    return source.image_url || source.previewUrl || "";
  }
  function loadImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (width > 0 && height > 0) {
          resolve({ width, height });
        } else {
          reject(new Error("\u56FE\u7247\u5C3A\u5BF8\u4E0D\u53EF\u7528"));
        }
      };
      image.onerror = () => reject(new Error("\u56FE\u7247\u52A0\u8F7D\u5931\u8D25"));
      image.src = String(url || "");
    });
  }
  function applyCustomAspectRatioDigits(widthRatio, heightRatio) {
    if (!els27.customRatioWidth || !els27.customRatioHeight) return;
    els27.customRatioWidth.value = String(widthRatio || "");
    els27.customRatioHeight.value = String(heightRatio || "");
    setCustomAspectRatioFromManualInputs();
    applyCustomAspectRatioFromWidth();
    updateCustomSize();
    updatePixelPreview("custom");
    updateRequestPreview10();
  }
  async function applyFirstReferenceImageAspectRatio(event) {
    event?.preventDefault?.();
    const source = firstReferenceImageSource();
    updateCustomRatioReferenceButtonState();
    if (!source) return;
    const url = sourceUrlForAspectRatio(source);
    if (!url) return;
    return loadImageDimensions(url).catch(() => null).then((dimensions) => {
      if (!dimensions) return;
      const ratio = singleDigitAspectRatioForDimensions(dimensions.width, dimensions.height);
      if (!ratio) return;
      applyCustomAspectRatioDigits(ratio.width, ratio.height);
    });
  }
  function handleCustomDimensionInput(input) {
    if (!state18.customAspectRatioLocked || !state18.customAspectRatioValue) return;
    if (!els27.customWidth || !els27.customHeight) return;
    const value = customDimensionValue(input);
    if (!value) return;
    if (input === els27.customWidth) {
      els27.customHeight.value = normalizeAspectDimension(value / state18.customAspectRatioValue);
      return;
    }
    if (input === els27.customHeight) {
      els27.customWidth.value = normalizeAspectDimension(value * state18.customAspectRatioValue);
    }
  }
  function swapCustomRatioDigits() {
    if (!els27.customRatioWidth || !els27.customRatioHeight) return;
    const widthRatio = els27.customRatioWidth.value;
    els27.customRatioWidth.value = els27.customRatioHeight.value;
    els27.customRatioHeight.value = widthRatio;
    setCustomAspectRatioFromManualInputs();
  }
  function updateSizeFromPreset(event = null) {
    const changedControl = sizeControlName(event?.target);
    syncRatioAndOrientation(changedControl);
    if (els27.customSizeToggle?.checked) {
      if (els27.size?.value !== "custom") {
        populateCustomSizeFromCurrentPreset();
      }
      els27.size.value = "custom";
      if (typeof setCustomAspectRatioFromManualInputs === "function") setCustomAspectRatioFromManualInputs();
      if (typeof applyCustomAspectRatioFromWidth === "function") applyCustomAspectRatioFromWidth();
      updateCustomSize();
      updatePixelPreview("custom");
      updateRequestPreview10();
      return;
    }
    const size = sizeForPreset(els27.resolution?.value, els27.ratio?.value);
    els27.size.value = size;
    updatePixelPreview(size);
    updateCustomSize();
    updateRequestPreview10();
  }
  function populateCustomSizeFromCurrentPreset() {
    if (!els27.customWidth || !els27.customHeight) return;
    const [width, height] = sizeForPreset(els27.resolution?.value, els27.ratio?.value).split("x");
    if (!width || !height) return;
    els27.customWidth.value = width;
    els27.customHeight.value = height;
  }
  function sizeControlName(target) {
    if (target === els27.resolution) return "resolution";
    if (target === els27.ratio) return "ratio";
    if (target === els27.orientation) return "orientation";
    return null;
  }
  function syncRatioAndOrientation(changedControl) {
    if (!els27.resolution || !els27.ratio || !els27.orientation) return;
    if (!GPT_IMAGE_2_SIZE_PRESETS[els27.resolution.value]) {
      setSizeControlValue(els27.resolution, DEFAULT_RESOLUTION);
    }
    if (!RATIO_ORIENTATION[els27.ratio.value]) {
      setSizeControlValue(els27.ratio, DEFAULT_RATIO);
    }
    if (!ORIENTATION_DEFAULT_RATIOS[els27.orientation.value]) {
      setSizeControlValue(els27.orientation, RATIO_ORIENTATION[els27.ratio.value] || DEFAULT_ORIENTATION);
    }
    if (changedControl === "orientation") {
      syncRatioFromOrientation();
      return;
    }
    syncOrientationFromRatio();
  }
  function syncOrientationFromRatio() {
    const nextOrientation = RATIO_ORIENTATION[els27.ratio.value] || DEFAULT_ORIENTATION;
    setSizeControlValue(els27.orientation, nextOrientation);
  }
  function syncRatioFromOrientation() {
    const orientation = els27.orientation.value;
    if (orientation === "square") {
      setSizeControlValue(els27.ratio, DEFAULT_RATIO);
      return;
    }
    if (RATIO_ORIENTATION[els27.ratio.value] === orientation) return;
    const counterpart = RATIO_COUNTERPARTS[els27.ratio.value];
    if (counterpart && RATIO_ORIENTATION[counterpart] === orientation) {
      setSizeControlValue(els27.ratio, counterpart);
      return;
    }
    setSizeControlValue(els27.ratio, ORIENTATION_DEFAULT_RATIOS[orientation] || DEFAULT_RATIO);
  }
  function setSizeControlValue(select, value) {
    if (!select || select.value === value) return false;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function updatePixelPreview(size) {
    if (!els27.pixelPreview) return;
    if (size === "auto") {
      els27.pixelPreview.textContent = "\u8F93\u51FA\u50CF\u7D20: auto\uFF08OpenAI \u81EA\u52A8\u9009\u62E9\uFF09";
      return;
    }
    if (size === "custom") {
      const message = customSizeValidationMessage();
      if (message) {
        els27.pixelPreview.textContent = `\u8F93\u51FA\u50CF\u7D20: ${message}`;
        return;
      }
      els27.pixelPreview.textContent = `\u8F93\u51FA\u50CF\u7D20: ${customDimensionValue(els27.customWidth)} x ${customDimensionValue(els27.customHeight)} px`;
      return;
    }
    const [width, height] = String(size).split("x");
    els27.pixelPreview.textContent = `\u8F93\u51FA\u50CF\u7D20: ${width} x ${height} px`;
  }
  function syncSizeControlsFromSize(size) {
    if (!size || size === "auto") {
      if (els27.customSizeToggle) els27.customSizeToggle.checked = false;
      if (els27.resolution) els27.resolution.value = DEFAULT_RESOLUTION;
      if (els27.ratio) els27.ratio.value = DEFAULT_RATIO;
      if (els27.orientation) els27.orientation.value = DEFAULT_ORIENTATION;
      updateSizeFromPreset();
      syncRadioButtons(els27.resolution, els27.ratio, els27.orientation);
      return;
    }
    const presetMatch = findPresetForSize(size);
    if (presetMatch) {
      if (els27.customSizeToggle) els27.customSizeToggle.checked = false;
      els27.resolution.value = presetMatch.resolution;
      els27.ratio.value = presetMatch.ratio;
      els27.orientation.value = presetMatch.orientation;
      updateSizeFromPreset();
      syncRadioButtons(els27.resolution, els27.ratio, els27.orientation);
      return;
    }
    const [width, height] = String(size).split("x");
    if (width && height) {
      if (els27.customSizeToggle) els27.customSizeToggle.checked = true;
      els27.size.value = "custom";
      els27.customWidth.value = width;
      els27.customHeight.value = height;
      updatePixelPreview("custom");
      updateCustomSize();
      updateRequestPreview10();
    }
  }
  function setCustomSizeModeLayout(isCustom) {
    els27.customSize?.classList.toggle("hidden", !isCustom);
    els27.customSize?.classList.toggle("custom-size-collapsed", !isCustom);
    els27.customSize?.setAttribute("aria-hidden", isCustom ? "false" : "true");
    els27.settingsGrid?.classList.toggle("custom-size-mode", isCustom);
  }
  function measureCustomSizeModeHeight(isCustom) {
    const grid = els27.settingsGrid;
    const customSize = els27.customSize;
    if (!grid) return 0;
    const originalHeight = grid.style.height;
    const originalGridTransition = grid.style.transition;
    const originalCustomTransition = customSize?.style.transition || "";
    const originalCustomMode = grid.classList.contains("custom-size-mode");
    const originalCustomHidden = customSize?.classList.contains("hidden") || false;
    const originalCustomCollapsed = customSize?.classList.contains("custom-size-collapsed") || false;
    const originalCustomAriaHidden = customSize?.getAttribute("aria-hidden");
    grid.style.transition = "none";
    grid.style.height = "";
    if (customSize) customSize.style.transition = "none";
    setCustomSizeModeLayout(isCustom);
    const height = measuredElementHeight2(grid);
    grid.classList.toggle("custom-size-mode", originalCustomMode);
    if (customSize) {
      customSize.classList.toggle("hidden", originalCustomHidden);
      customSize.classList.toggle("custom-size-collapsed", originalCustomCollapsed);
      if (originalCustomAriaHidden === null) {
        customSize.removeAttribute("aria-hidden");
      } else {
        customSize.setAttribute("aria-hidden", originalCustomAriaHidden);
      }
      customSize.style.transition = originalCustomTransition;
    }
    grid.style.height = originalHeight;
    grid.style.transition = originalGridTransition;
    return height;
  }
  function transitionCustomSizeMode(isCustom) {
    const grid = els27.settingsGrid;
    const customSize = els27.customSize;
    if (!grid || !customSize) {
      setCustomSizeModeLayout(isCustom);
      state18.customSizeMode = isCustom;
      return;
    }
    if (state18.customSizeMode === null) {
      state18.customSizeMode = isCustom;
      grid.style.height = "";
      grid.classList.remove("is-size-transitioning");
      setCustomSizeModeLayout(isCustom);
      return;
    }
    const pendingTimerId = customSizeTransitionTimers.get(grid);
    if (state18.customSizeMode === isCustom && !pendingTimerId) {
      grid.style.height = "";
      grid.classList.remove("is-size-transitioning");
      setCustomSizeModeLayout(isCustom);
      return;
    }
    state18.customSizeMode = isCustom;
    state18.customSizeTransitionSeq += 1;
    const transitionSeq = state18.customSizeTransitionSeq;
    if (pendingTimerId) {
      window.clearTimeout(pendingTimerId);
      customSizeTransitionTimers.delete(grid);
    }
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      grid.style.height = "";
      grid.classList.remove("is-size-transitioning");
      setCustomSizeModeLayout(isCustom);
      return;
    }
    const fromHeight = measuredElementHeight2(grid);
    const targetHeight = measureCustomSizeModeHeight(isCustom);
    if (Math.abs(targetHeight - fromHeight) <= CUSTOM_SIZE_HEIGHT_SNAP_TOLERANCE) {
      grid.style.height = "";
      grid.classList.remove("is-size-transitioning");
      setCustomSizeModeLayout(isCustom);
      return;
    }
    grid.style.height = `${fromHeight}px`;
    grid.classList.add("is-size-transitioning");
    if (isCustom) {
      customSize.classList.remove("hidden");
      customSize.classList.add("custom-size-collapsed");
      customSize.setAttribute("aria-hidden", "false");
      grid.classList.add("custom-size-mode");
      void grid.offsetHeight;
      window.requestAnimationFrame(() => {
        if (transitionSeq !== state18.customSizeTransitionSeq) return;
        customSize.classList.remove("custom-size-collapsed");
        grid.style.height = `${targetHeight}px`;
      });
    } else {
      customSize.classList.remove("hidden");
      customSize.classList.remove("custom-size-collapsed");
      customSize.setAttribute("aria-hidden", "false");
      grid.classList.add("custom-size-mode");
      void grid.offsetHeight;
      window.requestAnimationFrame(() => {
        if (transitionSeq !== state18.customSizeTransitionSeq) return;
        customSize.classList.add("custom-size-collapsed");
        grid.classList.remove("custom-size-mode");
        grid.style.height = `${targetHeight}px`;
      });
    }
    const timerId = window.setTimeout(() => {
      if (transitionSeq !== state18.customSizeTransitionSeq) return;
      setCustomSizeModeLayout(isCustom);
      grid.style.height = "";
      grid.classList.remove("is-size-transitioning");
      customSizeTransitionTimers.delete(grid);
    }, CUSTOM_SIZE_TRANSITION_MS);
    customSizeTransitionTimers.set(grid, timerId);
  }
  function updateCustomSize() {
    const isCustom = els27.size?.value === "custom";
    transitionCustomSizeMode(isCustom);
    if (els27.customSizeToggle) els27.customSizeToggle.checked = isCustom;
    els27.sizeModeGroup?.querySelectorAll("[data-custom-size-mode]").forEach((button) => {
      const active = button.dataset.customSizeMode === (isCustom ? "custom" : "preset");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const message = isCustom ? customSizeValidationMessage() : "";
    els27.customSize?.classList.toggle("has-error", Boolean(message));
    if (els27.customSizeHint) {
      els27.customSizeHint.textContent = message || "\u5355\u4F4D px \xB7 16-3840 \xB7 16\u500D\u6570 \xB7 \u22643:1";
    }
    updateCustomRatioFieldState();
  }

  // codex_image/webui/frontend/src/form-controls.ts
  var bridge25 = getLegacyBridge();
  var state19 = bridge25.state;
  var els28 = bridge25.els;
  var formControlsInitialized = false;
  var formControlEventsBound = false;
  function bindFormControlEvents() {
    if (formControlEventsBound) return;
    formControlEventsBound = true;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode4(button.dataset.mode));
    });
    [
      els28.mainModel,
      els28.model,
      els28.size,
      els28.customWidth,
      els28.customHeight,
      els28.quality,
      els28.outputFormat,
      els28.moderation,
      els28.compression,
      els28.nInput,
      els28.promptFidelity
    ].filter(Boolean).forEach((element2) => element2.addEventListener("input", () => {
      persistMainModel();
      updateQuantity();
      updateCompression();
      if (element2 === els28.customWidth || element2 === els28.customHeight) handleCustomDimensionInput(element2);
      updateCustomSize();
      if (element2 === els28.customWidth || element2 === els28.customHeight) updatePixelPreview("custom");
      updateRequestPreview10();
    }));
    els28.mainModel?.addEventListener("focus", () => openMainModelCombobox({ showAll: true }));
    els28.mainModel?.addEventListener("click", () => {
      if (!state19.mainModelComboboxOpen) openMainModelCombobox({ showAll: true });
    });
    els28.mainModel?.addEventListener("input", () => {
      state19.mainModelShowAllOptions = false;
      openMainModelCombobox();
      renderMainModelOptions();
    });
    els28.mainModel?.addEventListener("keydown", handleMainModelKeydown);
    els28.mainModelToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      if (state19.mainModelComboboxOpen) {
        closeMainModelCombobox();
      } else {
        openMainModelCombobox({ showAll: true });
        els28.mainModel?.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!els28.mainModelCombobox || els28.mainModelCombobox.contains(event.target)) return;
      closeMainModelCombobox();
    });
    [els28.resolution, els28.ratio, els28.orientation].filter(Boolean).forEach((element2) => {
      element2.addEventListener("input", updateSizeFromPreset);
      element2.addEventListener("change", updateSizeFromPreset);
    });
    [els28.customRatioWidth, els28.customRatioHeight].filter(Boolean).forEach((element2) => {
      element2.addEventListener("input", () => {
        handleCustomRatioInput(element2);
        updateCustomSize();
        updatePixelPreview("custom");
        updateRequestPreview10();
      });
    });
    els28.sizeModeGroup?.addEventListener("click", handleSizeModeEvent);
    els28.swapCustomSizeButton?.addEventListener("click", swapCustomSizeDimensions);
    els28.customRatioFromImageButton?.addEventListener("click", (event) => {
      void applyFirstReferenceImageAspectRatio(event);
    });
    if (els28.customSizeToggle) {
      els28.customSizeToggle.addEventListener("change", updateSizeFromPreset);
    }
    els28.outputFormatGroup?.addEventListener("dblclick", handleOutputFormatDoubleClick);
  }
  function setMode4(mode) {
    state19.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    if (!state19.runTimerId) {
      els28.runButton.textContent = mode === "edit" ? "\u5F00\u59CB\u7F16\u8F91" : "\u5F00\u59CB\u751F\u6210";
    }
    syncRadioButtons(els28.quality, els28.outputFormat, els28.moderation);
    updateRequestPreview10();
  }
  function initFormControlsFeature() {
    if (formControlsInitialized) return;
    formControlsInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      bindFormControlEvents,
      setMode: setMode4,
      updateQuantity,
      updateCompression,
      openCompressionPopover,
      closeCompressionPopover,
      currentSize,
      currentTaskParams,
      currentMainModel,
      currentQuantity,
      currentImageToolModel,
      restoreMainModel,
      persistMainModel,
      syncSizeControlsFromSize,
      updateSizeFromPreset,
      updateCustomSize,
      updateCustomRatioFieldState,
      updateCustomRatioReferenceButtonState,
      updatePixelPreview,
      customSizeValidationMessage,
      syncRadioButtons,
      updateRequestPreview: updateRequestPreview10,
      mainModelOptionsForQuery,
      openMainModelCombobox,
      closeMainModelCombobox,
      renderMainModelOptions,
      selectMainModelOption,
      handleMainModelKeydown,
      handleSizeModeEvent,
      handleCustomDimensionInput,
      handleCustomRatioInput,
      applyFirstReferenceImageAspectRatio,
      swapCustomSizeDimensions,
      handleOutputFormatDoubleClick
    });
  }

  // codex_image/webui/frontend/src/task-list-render.ts
  var bridge26 = getLegacyBridge();
  var state20 = bridge26.state;
  var els29 = bridge26.els;
  var EXPANDED_TASK_GROUP_INITIAL_CARD_COUNT = 24;
  var EXPANDED_TASK_GROUP_CHUNK_SIZE = 48;
  var expandedTaskGroupRenderToken = 0;
  var queueTaskIdsCacheKey = "";
  var queueTaskIdsCache = null;
  function legacyMethod30(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function escapeHtml14(...args) {
    return legacyMethod30("escapeHtml", ...args);
  }
  function updateDocumentTitle(...args) {
    return legacyMethod30("updateDocumentTitle", ...args);
  }
  function isTaskArchived(...args) {
    return legacyMethod30("isTaskArchived", ...args);
  }
  function taskArchived(...args) {
    return legacyMethod30("taskArchived", ...args);
  }
  function renderBatchToolbar(...args) {
    return legacyMethod30("renderBatchToolbar", ...args);
  }
  function updateTaskElapsedDisplays2(...args) {
    return legacyMethod30("updateTaskElapsedDisplays", ...args);
  }
  function taskBackendLabel2(...args) {
    return legacyMethod30("taskBackendLabel", ...args);
  }
  function formatTaskStatus2(...args) {
    return legacyMethod30("formatTaskStatus", ...args);
  }
  function ensureExpandedTaskGroupKey(...args) {
    return legacyMethod30("ensureExpandedTaskGroupKey", ...args);
  }
  function renderTaskHistoryAnchors(...args) {
    return legacyMethod30("renderTaskHistoryAnchors", ...args);
  }
  function scrollExpandedTaskGroupToTop(...args) {
    return legacyMethod30("scrollExpandedTaskGroupToTop", ...args);
  }
  function captureTaskHistoryLayout(...args) {
    return legacyMethod30("captureTaskHistoryLayout", ...args);
  }
  function animateTaskHistoryLayout(...args) {
    return legacyMethod30("animateTaskHistoryLayout", ...args);
  }
  var taskRatio = (...args) => legacyMethod30("taskRatio", ...args);
  var taskOrientation = (...args) => legacyMethod30("taskOrientation", ...args);
  var taskPromptFidelity = (...args) => legacyMethod30("taskPromptFidelity", ...args);
  var taskResolution = (...args) => legacyMethod30("taskResolution", ...args);
  var taskInputPreviewUrls = (...args) => legacyMethod30("taskInputPreviewUrls", ...args);
  var taskThumbnailUrls = (...args) => legacyMethod30("taskThumbnailUrls", ...args);
  var taskOutputUrls = (...args) => legacyMethod30("taskOutputUrls", ...args);
  var taskImageBlockStates = (...args) => legacyMethod30("taskImageBlockStates", ...args);
  var compressTaskImageBlockStates = (...args) => legacyMethod30("compressTaskImageBlockStates", ...args);
  var taskImageStatusCounts = (...args) => legacyMethod30("taskImageStatusCounts", ...args);
  var taskFailureMessage = (...args) => legacyMethod30("taskFailureMessage", ...args);
  var taskRetryStateText2 = (...args) => legacyMethod30("taskRetryStateText", ...args);
  var taskRuntimeText2 = (...args) => legacyMethod30("taskRuntimeText", ...args);
  var taskCompletionTimestampTitle = (...args) => legacyMethod30("taskCompletionTimestampTitle", ...args);
  var timestampMs2 = (...args) => legacyMethod30("timestampMs", ...args);
  function renderTasks2() {
    const query = taskSearchQuery();
    const filters = taskFilterValues();
    const visibleTasks = state20.tasks.filter((task) => !isTaskArchived(task.task_id));
    const tasks = visibleTasks.filter((task) => {
      return taskMatchesSearch(task, query) && taskMatchesFilters(task, filters);
    });
    const visibleTaskIds = visibleTasks.map((task) => String(task.task_id));
    state20.batchSelectedTaskIds = state20.batchSelectedTaskIds.filter((taskId) => visibleTaskIds.includes(String(taskId)));
    renderBatchToolbar();
    const activeGroup = activeTaskGroup(tasks, query);
    const groups = taskHistoryGroups(tasks, query);
    const expandedGroup = ensureExpandedTaskGroupKey(groups);
    const layout = taskAnchorLayout(groups, expandedGroup?.key || null, query);
    const nextRenderKey = taskListRenderKey(tasks, query, layout, filters, activeGroup);
    if (state20.tasksRenderKey === nextRenderKey) {
      updateTaskElapsedDisplays2();
      return;
    }
    state20.tasksRenderKey = nextRenderKey;
    renderTaskHistoryAnchors(layout);
    const activeHtml = activeGroup ? activeTaskGroupHtml(activeGroup) : "";
    renderActiveTaskGroup(activeHtml);
    if (!tasks.length) {
      expandedTaskGroupRenderToken += 1;
      els29.taskList.innerHTML = `<div class="task-meta">\u6682\u65E0\u5386\u53F2\u4EFB\u52A1</div>`;
      updateDocumentTitle();
      return;
    }
    if (!layout.expandedGroup) {
      expandedTaskGroupRenderToken += 1;
      els29.taskList.innerHTML = "";
      updateDocumentTitle();
      return;
    }
    const group = layout.expandedGroup;
    els29.taskList.innerHTML = renderExpandedTaskGroupShellHtml(group);
    scheduleExpandedTaskGroupItemsRender(group, layout.expandedKey || group?.key || null);
    updateDocumentTitle();
  }
  function renderActiveTaskGroup(activeHtml) {
    if (!els29.taskActiveList) return;
    els29.taskActiveList.innerHTML = activeHtml;
    els29.taskActiveList.classList.toggle("hidden", !activeHtml);
  }
  function taskAnchorLayout(groups, expandedKey, query) {
    if (query) {
      return {
        top: [],
        bottom: [],
        expandedGroup: groups[0] || null,
        expandedKey: groups[0]?.key || expandedKey || null,
        queryMode: true
      };
    }
    const index = groups.findIndex((group) => String(group.key) === String(expandedKey));
    if (index < 0) {
      return {
        top: groups,
        bottom: [],
        expandedGroup: null,
        expandedKey: null,
        queryMode: false
      };
    }
    return {
      top: index > 0 ? groups.slice(0, index) : [],
      bottom: groups.slice(index + 1),
      expandedGroup: groups[index] || null,
      expandedKey,
      queryMode: false
    };
  }
  function animateExpandedTaskGroupBody(groupKey) {
    const escapedGroupKey = cssEscape(groupKey);
    const body = els29.taskList?.querySelector(
      `.task-group-items-expanded[data-expanded-task-group-items-key="${escapedGroupKey}"]`
    );
    const headerButton = els29.taskList?.querySelector(
      `.task-group[data-task-group="${escapedGroupKey}"] .task-group-header-split`
    );
    if (!body) return;
    headerButton?.setAttribute("aria-expanded", "false");
    body.style.maxHeight = "0px";
    body.style.opacity = "0";
    void body.offsetHeight;
    requestAnimationFrame(() => {
      headerButton?.setAttribute("aria-expanded", "true");
      body.style.maxHeight = `${body.scrollHeight}px`;
      body.style.opacity = "1";
    });
    const handleTransitionEnd = (event) => {
      if (event.propertyName !== "max-height") return;
      body.style.maxHeight = "none";
      body.removeEventListener("transitionend", handleTransitionEnd);
    };
    body.addEventListener("transitionend", handleTransitionEnd);
  }
  function expandedTaskGroupItemsContainer(groupKey) {
    if (!els29.taskList) return null;
    return els29.taskList.querySelector(
      `.task-group-items-expanded[data-expanded-task-group-items-key="${cssEscape(groupKey)}"]`
    );
  }
  function scheduleExpandedTaskGroupItemsRender(group, activeGroupKey = null) {
    const tasks = Array.isArray(group?.tasks) ? group.tasks : [];
    const groupKey = String(group?.key || "");
    if (!groupKey) return;
    const normalizedActiveGroupKey = String(activeGroupKey || groupKey);
    const token = ++expandedTaskGroupRenderToken;
    let index = 0;
    const renderChunk = () => {
      if (token !== expandedTaskGroupRenderToken) return;
      if (normalizedActiveGroupKey !== groupKey) return;
      const body = expandedTaskGroupItemsContainer(groupKey);
      if (!body) return;
      const chunkSize = index === 0 ? EXPANDED_TASK_GROUP_INITIAL_CARD_COUNT : EXPANDED_TASK_GROUP_CHUNK_SIZE;
      const nextTasks = tasks.slice(index, index + chunkSize);
      if (!nextTasks.length) {
        body.dataset.renderComplete = "true";
        return;
      }
      body.insertAdjacentHTML("beforeend", nextTasks.map((task) => taskCardHtml(task)).join(""));
      index += nextTasks.length;
      if (index === nextTasks.length) {
        animateExpandedTaskGroupBody(groupKey);
      } else if (body.style.maxHeight && body.style.maxHeight !== "none") {
        body.style.maxHeight = `${body.scrollHeight}px`;
      }
      if (index < tasks.length) {
        requestAnimationFrame(renderChunk);
      } else {
        body.dataset.renderComplete = "true";
      }
    };
    requestAnimationFrame(renderChunk);
  }
  function taskCardRoot() {
    return els29.taskHistoryShell || els29.sidebarContent || els29.taskList;
  }
  function taskCardElement(taskId) {
    const root = taskCardRoot();
    if (!root || taskId == null) return null;
    return root.querySelector(`.task-card[data-task-id="${cssEscape(taskId)}"]`);
  }
  function updateTaskSelectionVisuals(taskId = state20.selectedTaskId) {
    const root = taskCardRoot();
    if (!root) return;
    const selectedId = taskId == null ? "" : String(taskId);
    root.querySelectorAll(".task-card.active").forEach((card) => {
      if (String(card.dataset.taskId || "") !== selectedId) {
        card.classList.remove("active");
      }
    });
    const selectedCard = taskCardElement(taskId);
    if (selectedCard) {
      selectedCard.classList.add("active");
      selectedCard.classList.remove("unread");
      selectedCard.dataset.taskUnread = "false";
      selectedCard.querySelector(".task-unread-dot")?.remove();
    }
    updateDocumentTitle();
  }
  function taskSearchQuery() {
    return els29.taskSearch.value.trim().toLowerCase();
  }
  function taskFilterValues() {
    return {
      ratio: els29.taskRatioFilter?.value || "",
      orientation: els29.taskOrientationFilter?.value || "",
      promptFidelity: els29.taskPromptFidelityFilter?.value || "",
      resolution: els29.taskResolutionFilter?.value || ""
    };
  }
  function taskMatchesSearch(task, query) {
    const text = `${task.prompt || ""} ${task.status || ""} ${task.mode || ""} ${taskBackendLabel2(task)}`.toLowerCase();
    return text.includes(query);
  }
  function taskMatchesFilters(task, filters) {
    if (filters.ratio && taskRatio(task) !== filters.ratio) return false;
    if (filters.orientation && taskOrientation(task) !== filters.orientation) return false;
    if (filters.promptFidelity && taskPromptFidelity(task) !== filters.promptFidelity) return false;
    if (filters.resolution && taskResolution(task) !== filters.resolution) return false;
    return true;
  }
  function filteredVisibleTasks(query = taskSearchQuery(), filters = taskFilterValues()) {
    return state20.tasks.filter((task) => {
      return !isTaskArchived(task.task_id) && taskMatchesSearch(task, query) && taskMatchesFilters(task, filters);
    });
  }
  function clearTaskListFiltersForActiveGroup() {
    let changed = false;
    if (els29.taskSearch?.value) {
      els29.taskSearch.value = "";
      changed = true;
    }
    [els29.taskRatioFilter, els29.taskOrientationFilter, els29.taskPromptFidelityFilter, els29.taskResolutionFilter].filter(Boolean).forEach((element2) => {
      if (element2.value) {
        element2.value = "";
        changed = true;
      }
    });
    return changed;
  }
  function revealActiveTaskGroup() {
    const activeTasks = state20.tasks.filter((task) => !isTaskArchived(task.task_id) && isAlwaysVisibleTask(task));
    if (!activeTasks.length) return;
    const visibleActiveTasks = filteredVisibleTasks().filter((task) => isAlwaysVisibleTask(task));
    const clearedControls = visibleActiveTasks.length ? false : clearTaskListFiltersForActiveGroup();
    const previousLayout = captureTaskHistoryLayout();
    if (clearedControls) {
      renderTasks2();
      animateTaskHistoryLayout(previousLayout);
    }
    scrollExpandedTaskGroupToTop("smooth");
    if (clearedControls) {
      legacyMethod30("setStatus", "\u5DF2\u663E\u793A\u8FDB\u884C\u4E2D\u4EFB\u52A1", "ok");
    }
  }
  function renderExpandedTaskGroupShellHtml(group) {
    const groupKey = escapeHtml14(group.key);
    return `
    <section class="task-group task-group-expanded" data-task-group="${groupKey}">
      <button
        class="task-group-header task-group-header-split"
        type="button"
        data-task-group-toggle-key="${groupKey}"
        data-task-group-expanded="true"
        aria-expanded="false"
        aria-label="\u6536\u8D77 ${escapeHtml14(group.label)}"
      >
        <span class="task-group-label-button">
          <span class="task-group-title">
            <span class="task-group-label">${escapeHtml14(group.label)}</span>
            <span class="task-group-count-separator" aria-hidden="true"> \xB7 </span>
            <span class="task-group-count">${group.tasks.length}</span>
          </span>
        </span>
        <span
          class="task-group-arrow-button"
          aria-hidden="true"
        >
          <span class="task-group-toggle" aria-hidden="true">
            <svg class="task-group-toggle-icon" viewBox="0 0 12 12" focusable="false">
              <path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
            </svg>
          </span>
        </span>
      </button>
      <div class="task-group-items task-group-items-expanded" data-expanded-task-group-items-key="${groupKey}"></div>
    </section>
  `;
  }
  function activeTaskSections(tasks) {
    const queueIds = queueTaskIdsBySection();
    const running = [];
    const waiting = [];
    tasks.forEach((task) => {
      const taskId = String(task?.task_id || "");
      const status = String(task?.status || "");
      if (queueIds.running.has(taskId) || status === "running") {
        running.push(task);
      } else if (queueIds.waiting.has(taskId) || task?.local_pending || ["submitting", "queued"].includes(status)) {
        waiting.push(task);
      }
    });
    return { running, waiting };
  }
  function activeTaskSectionHtml(key, label, tasks) {
    if (!tasks.length) return "";
    const sectionClass = key === "running" ? 'class="task-active-section task-active-section-running"' : 'class="task-active-section task-active-section-waiting"';
    const sectionData = key === "running" ? 'data-active-task-section="running"' : 'data-active-task-section="waiting"';
    return `
    <div ${sectionClass} ${sectionData}>
      <div class="task-active-section-title">
        <span>${escapeHtml14(label)}</span>
        <span class="task-active-section-count">${tasks.length}</span>
      </div>
      <div class="task-active-section-items">
        ${tasks.map((task) => taskCardHtml(task)).join("")}
      </div>
    </div>
  `;
  }
  function activeTaskDispatchPendingHtml() {
    return `
    <div class="task-active-empty" data-active-task-section="dispatch-pending">
      \u6B63\u5728\u5206\u914D\u53EF\u7528\u901A\u9053...
    </div>
  `;
  }
  function activeTaskGroup(tasks, query = "") {
    if (query) return null;
    const activeTasks = activeTasksForGroup(tasks);
    if (!activeTasks.length) return null;
    return {
      key: "active",
      label: "\u8FDB\u884C\u4E2D",
      tasks: activeTasks,
      collapsible: false,
      defaultCollapsed: false
    };
  }
  function activeTaskGroupHtml(group) {
    const groupKey = escapeHtml14(group.key);
    const sections = activeTaskSections(group.tasks || []);
    const dispatchPending = Boolean(legacyMethod30("isQueueDispatchPending"));
    const body = [
      activeTaskSectionHtml("running", "\u8FD0\u884C\u4E2D", sections.running),
      activeTaskSectionHtml("waiting", "\u7B49\u5F85\u4E2D", sections.waiting),
      !sections.running.length && !sections.waiting.length && dispatchPending ? activeTaskDispatchPendingHtml() : ""
    ].join("");
    return `
    <section class="task-group task-group-expanded task-group-active" data-task-group="${groupKey}">
      <div
        class="task-group-header task-group-header-split task-active-group-header"
        role="heading"
        aria-level="2"
      >
        <span class="task-group-label-button">
          <span class="task-group-title">
            <span class="task-group-label">${escapeHtml14(group.label)}</span>
            <span class="task-group-count-separator" aria-hidden="true"> \xB7 </span>
            <span class="task-group-count">${group.tasks.length}</span>
          </span>
        </span>
      </div>
      <div class="task-group-items task-group-items-expanded">
        ${body}
      </div>
    </section>
  `;
  }
  function expandedTaskGroupHtml(group) {
    const groupKey = escapeHtml14(group.key);
    return `
    <section class="task-group task-group-expanded" data-task-group="${groupKey}">
      <button
        class="task-group-header task-group-header-split"
        type="button"
        data-task-group-toggle-key="${groupKey}"
        data-task-group-expanded="true"
        aria-expanded="true"
        aria-label="\u6536\u8D77 ${escapeHtml14(group.label)}"
      >
        <span class="task-group-label-button">
          <span class="task-group-title">
            <span class="task-group-label">${escapeHtml14(group.label)}</span>
            <span class="task-group-count-separator" aria-hidden="true"> \xB7 </span>
            <span class="task-group-count">${group.tasks.length}</span>
          </span>
        </span>
        <span
          class="task-group-arrow-button"
          aria-hidden="true"
        >
          <span class="task-group-toggle" aria-hidden="true">
            <svg class="task-group-toggle-icon" viewBox="0 0 12 12" focusable="false">
              <path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
            </svg>
          </span>
        </span>
      </button>
      <div class="task-group-items task-group-items-expanded">
        ${group.tasks.map((task) => taskCardHtml(task)).join("")}
      </div>
    </section>
  `;
  }
  function taskGroupHtml(group) {
    return expandedTaskGroupHtml(group);
  }
  function taskGroupButtonLabel(group) {
    return `${group.label}\uFF0C${group.tasks.length} \u4E2A\u4EFB\u52A1`;
  }
  function taskQueueSection(task, queueIds = queueTaskIdsBySection()) {
    const taskId = String(task?.task_id || "");
    if (!taskId) return "";
    if (queueIds.running.has(taskId)) return "running";
    if (queueIds.waiting.has(taskId)) return "waiting";
    return "";
  }
  function waitingQueueIndex(taskId, queueIds = queueTaskIdsBySection()) {
    const normalizedTaskId = String(taskId || "");
    return queueIds.waiting.get(normalizedTaskId) ?? -1;
  }
  function taskQueueActionStripHtml(task, queueSection = taskQueueSection(task), waitingIndex = waitingQueueIndex(task?.task_id)) {
    if (!queueSection) return "";
    const taskId = escapeHtml14(task.task_id);
    if (queueSection === "running") {
      return `
      <div class="task-queue-actions task-queue-actions-running" role="group" aria-label="\u8FD0\u884C\u4EFB\u52A1\u961F\u5217\u64CD\u4F5C" data-task-queue-section="${escapeHtml14(queueSection)}">
        <button class="task-queue-action task-queue-cancel-button" type="button" data-task-queue-cancel-id="${taskId}" aria-label="\u53D6\u6D88\u8FD0\u884C\u4EFB\u52A1" title="\u53D6\u6D88\u8FD0\u884C\u4EFB\u52A1">\u53D6\u6D88</button>
      </div>
    `;
    }
    const waitingCount = (state20.queue.waiting || []).length;
    const disableMoveUp = waitingIndex <= 0;
    const disableMoveDown = waitingIndex < 0 || waitingIndex >= waitingCount - 1;
    return `
    <div class="task-queue-actions task-queue-actions-waiting" role="group" aria-label="\u7B49\u5F85\u4EFB\u52A1\u961F\u5217\u64CD\u4F5C" data-task-queue-section="${escapeHtml14(queueSection)}">
      <button class="task-queue-drag-handle" type="button" draggable="true" data-task-queue-drag-handle-id="${taskId}" aria-label="\u62D6\u52A8\u8C03\u6574\u7B49\u5F85\u987A\u5E8F" title="\u62D6\u52A8\u6392\u5E8F">
        <svg class="task-queue-drag-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5 3.5h.1M5 8h.1M5 12.5h.1M10.5 3.5h.1M10.5 8h.1M10.5 12.5h.1" />
        </svg>
      </button>
      <button class="task-queue-action" type="button" data-task-queue-move-id="${taskId}" data-task-queue-direction="up" aria-label="\u4E0A\u79FB\u7B49\u5F85\u4EFB\u52A1" title="\u4E0A\u79FB"${disableMoveUp ? " disabled" : ""}>\u4E0A</button>
      <button class="task-queue-action" type="button" data-task-queue-move-id="${taskId}" data-task-queue-direction="down" aria-label="\u4E0B\u79FB\u7B49\u5F85\u4EFB\u52A1" title="\u4E0B\u79FB"${disableMoveDown ? " disabled" : ""}>\u4E0B</button>
      <button class="task-queue-action" type="button" data-task-queue-promote-id="${taskId}" aria-label="\u7F6E\u9876\u7B49\u5F85\u4EFB\u52A1" title="\u7F6E\u9876">\u9876</button>
      <button class="task-queue-action task-queue-delete-button" type="button" data-task-queue-delete-id="${taskId}" aria-label="\u5220\u9664\u7B49\u5F85\u4EFB\u52A1" title="\u5220\u9664\u7B49\u5F85\u4EFB\u52A1">\u5220</button>
    </div>
  `;
  }
  function taskCardActionsHtml(taskId, queueSection = "") {
    if (queueSection) return "";
    return `
      <div class="task-card-actions" role="group" aria-label="\u4EFB\u52A1\u64CD\u4F5C">
        <button class="task-archive-button" type="button" data-archive-task-id="${taskId}" aria-label="\u5F52\u6863\u4EFB\u52A1" title="\u5F52\u6863\u4EFB\u52A1">
          <svg class="task-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M4 6h12v11H4z" />
            <path d="M6 3h8l2 3H4l2-3z" />
            <path d="M10 8v5" />
            <path d="M7.5 10.5L10 13l2.5-2.5" />
          </svg>
        </button>
        <button class="task-delete-button" type="button" data-delete-task-id="${taskId}" aria-label="\u5220\u9664\u4EFB\u52A1" title="\u5220\u9664\u4EFB\u52A1">
          <svg class="task-action-icon task-delete-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M5 5h10" />
            <path d="M8 5l1-2h2l1 2" />
            <path d="M6 5l1 12h6l1-12" />
            <path d="M8.5 8v6M11.5 8v6" />
          </svg>
        </button>
      </div>
  `;
  }
  function taskCardHtml(task) {
    const image = taskThumbHtml(task);
    const active = String(task.task_id) === String(state20.selectedTaskId) ? " active" : "";
    const unread = taskHasUnreadUpdate(task);
    const unreadClass = unread ? " unread" : "";
    const statusClass = task.status ? ` ${escapeHtml14(task.status)}` : "";
    const title = escapeHtml14(task.prompt || task.mode || "Untitled");
    const statusLight = taskStatusLightHtml(task);
    const statusMeta = escapeHtml14(taskMetaDetailsText(task));
    const imageBlocks = taskImageBlocksHtml(task);
    const imageSummary = escapeHtml14(taskImageSummaryText(task));
    const retryText = taskRetryStateText2(task);
    const runtime = taskRuntimeText2(task);
    const completionTitle = taskCompletionTimestampTitle(task);
    const taskId = escapeHtml14(task.task_id);
    const runtimeTitle = completionTitle ? ` title="${escapeHtml14(completionTitle)}"` : "";
    const runtimeHtml = runtime ? `<div class="task-runtime" data-task-runtime-id="${taskId}" data-task-completed-at-id="${taskId}"${runtimeTitle}>${escapeHtml14(runtime)}</div>` : "";
    const retryHtml = retryText ? `<div class="task-retry-state" data-task-retry-id="${taskId}">${escapeHtml14(retryText)}</div>` : "";
    const batchSelected = state20.batchSelectedTaskIds.includes(String(task.task_id));
    const batchClass = state20.batchMode ? " batch-mode" : "";
    const batchSelectedClass = batchSelected ? " batch-selected" : "";
    const queueIds = queueTaskIdsBySection();
    const queueSection = taskQueueSection(task, queueIds);
    const queueClass = queueSection ? ` queue-${escapeHtml14(queueSection)}` : "";
    const queueTaskData = queueSection === "waiting" ? ` data-queue-task-id="${taskId}"` : "";
    const queueActions = taskQueueActionStripHtml(task, queueSection, waitingQueueIndex(task.task_id, queueIds));
    const taskActions = taskCardActionsHtml(taskId, queueSection);
    const batchSelect = state20.batchMode ? `
      <button class="task-select-button" type="button" data-batch-select-task-id="${taskId}" aria-pressed="${batchSelected ? "true" : "false"}" aria-label="\u9009\u62E9\u4F1A\u8BDD">
        <span></span>
      </button>
    ` : "";
    const unreadDot = unread ? '<span class="task-unread-dot" aria-label="\u672A\u8BFB\u66F4\u65B0"></span>' : "";
    return `
    <div class="task-card${active}${unreadClass}${statusClass}${batchClass}${batchSelectedClass}${queueClass}" role="button" tabindex="0" data-task-id="${taskId}" data-task-unread="${unread ? "true" : "false"}"${queueTaskData}>
      ${batchSelect}
      ${image}
      <div class="task-info">
        <div class="task-title-row">
          ${unreadDot}
          <div class="task-title">${title}</div>
        </div>
        <div class="task-status-row" aria-label="${escapeHtml14(taskStatusAccessibleLabel2(task))}">
          ${statusLight}
          <span class="task-status-meta">${statusMeta}</span>
        </div>
        <div class="task-image-row">
          ${imageBlocks}
          <span class="task-image-summary">${imageSummary}</span>
        </div>
        ${retryHtml}
        ${runtimeHtml}
      </div>
      ${queueActions}
      ${taskActions}
    </div>
  `;
  }
  function taskHasUnreadUpdate(task) {
    if (!task || task.local_pending) return false;
    if (String(task.task_id) === String(state20.selectedTaskId)) return false;
    if (!task.viewed_at) return false;
    if (!taskHasViewableUpdate(task)) return false;
    const viewedAt = timestampMs2(task.viewed_at);
    const updatedAt = timestampMs2(task.updated_at || task.completed_at || task.started_at || task.created_at);
    return viewedAt !== null && updatedAt !== null && updatedAt > viewedAt;
  }
  function taskHasViewableUpdate(task) {
    const status = String(task?.status || "");
    return ["completed", "failed", "partial_failed"].includes(status) || taskOutputUrls(task).length > 0;
  }
  function taskHistoryGroups(tasks, query) {
    if (query) {
      return [{
        key: "search",
        label: "\u641C\u7D22\u7ED3\u679C",
        tasks,
        collapsible: false,
        defaultCollapsed: false
      }];
    }
    const groups = [];
    const assignedTaskIds = /* @__PURE__ */ new Set();
    const addGroup = (key, label, groupTasks, options = {}) => {
      if (!groupTasks.length) return;
      groups.push({
        key,
        label,
        tasks: groupTasks,
        collapsible: Boolean(options.collapsible),
        defaultCollapsed: Boolean(options.defaultCollapsed)
      });
      groupTasks.forEach((task) => assignedTaskIds.add(String(task.task_id)));
    };
    const historicalTasks = tasks.filter((task) => !isAlwaysVisibleTask(task));
    const unassignedTasks = () => historicalTasks.filter((task) => !assignedTaskIds.has(String(task.task_id)));
    addGroup(
      "today",
      "\u4ECA\u5929",
      unassignedTasks().filter((task) => taskDateBucket(task) === "today"),
      { collapsible: true, defaultCollapsed: false }
    );
    [
      ["yesterday", "\u6628\u5929"],
      ["last7", "\u6700\u8FD1 7 \u5929"],
      ["older", "\u66F4\u65E9"]
    ].forEach(([key, label]) => {
      addGroup(
        key,
        label,
        unassignedTasks().filter((task) => taskDateBucket(task) === key),
        { collapsible: true, defaultCollapsed: true }
      );
    });
    return groups;
  }
  function isAlwaysVisibleTask(task) {
    const status = String(task?.status || "");
    return Boolean(task?.local_pending || ["submitting", "queued", "running"].includes(status));
  }
  function queueTaskIdsBySection() {
    const runningIds = (state20.queue.running || []).map((task) => String(task.task_id || ""));
    const waitingIds = (state20.queue.waiting || []).map((task) => String(task.task_id || ""));
    const cacheKey = `${runningIds.join("|")}::${waitingIds.join("|")}`;
    if (queueTaskIdsCache && queueTaskIdsCacheKey === cacheKey) return queueTaskIdsCache;
    queueTaskIdsCacheKey = cacheKey;
    queueTaskIdsCache = {
      running: new Map((state20.queue.running || []).map((task, index) => [String(task.task_id), index])),
      waiting: new Map((state20.queue.waiting || []).map((task, index) => [String(task.task_id), index]))
    };
    return queueTaskIdsCache;
  }
  function activeTaskOrderIndex(task, sectionIds = queueTaskIdsBySection()) {
    const taskId = String(task?.task_id || "");
    if (sectionIds.running.has(taskId)) return sectionIds.running.get(taskId) || 0;
    if (String(task?.status || "") === "running") return 1e3;
    if (sectionIds.waiting.has(taskId)) return 2e3 + (sectionIds.waiting.get(taskId) || 0);
    if (task?.local_pending || String(task?.status || "") === "submitting") return 3e3;
    if (String(task?.status || "") === "queued") return 4e3;
    return 5e3;
  }
  function activeTasksForGroup(tasks) {
    const sectionIds = queueTaskIdsBySection();
    return tasks.filter((task) => isAlwaysVisibleTask(task)).slice().sort((left, right) => activeTaskOrderIndex(left, sectionIds) - activeTaskOrderIndex(right, sectionIds));
  }
  function taskDateBucket(task) {
    const timestamp = timestampMs2(task?.created_at || task?.updated_at || task?.started_at);
    if (timestamp === null) return "older";
    const now = /* @__PURE__ */ new Date();
    const taskDate = new Date(timestamp);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const taskDayStart = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate()).getTime();
    const dayDiff = Math.floor((todayStart - taskDayStart) / 864e5);
    if (dayDiff <= 0) return "today";
    if (dayDiff === 1) return "yesterday";
    if (dayDiff <= 6) return "last7";
    return "older";
  }
  function taskListRenderKey(tasks, query, layout = {}, filters = {}, activeGroup = null) {
    return JSON.stringify({
      query,
      filters,
      activeQueue: activeQueueTaskListRenderKey(),
      activeGroup: activeGroup ? [activeGroup.key, activeGroup.label, activeGroup.tasks.length] : null,
      batchMode: state20.batchMode,
      batchSelectedTaskIds: state20.batchSelectedTaskIds.map(String).sort(),
      archivedTaskIds: state20.tasks.filter(taskArchived).map((task) => String(task.task_id)).sort(),
      expandedTaskGroupKey: state20.expandedTaskGroupKey,
      queryMode: Boolean(layout.queryMode),
      expandedGroup: layout.expandedGroup ? [layout.expandedGroup.key, layout.expandedGroup.label, layout.expandedGroup.tasks.length] : null,
      anchorGroups: [
        (layout.top || []).map((group) => [group.key, group.tasks.length]),
        (layout.bottom || []).map((group) => [group.key, group.tasks.length])
      ],
      tasks: tasks.map((task) => [
        task.task_id,
        task.status,
        task.prompt,
        task.mode,
        task.backend,
        task.requested_backend,
        task.api_provider_id,
        task.api_provider_name,
        task.params?.api_provider_id,
        task.params?.api_provider_name,
        task.request?.webui_api_provider_id,
        task.request?.webui_api_provider_name,
        task.params?.size,
        task.output_url,
        Array.isArray(task.output_urls) ? task.output_urls.join("|") : "",
        Array.isArray(task.input_thumbnail_urls) ? task.input_thumbnail_urls.join("|") : "",
        Array.isArray(task.thumbnail_urls) ? task.thumbnail_urls.join("|") : "",
        task.preview_url,
        task.last_error || task.error || "",
        task.attempts,
        task.max_attempts,
        Array.isArray(task.retrying_failed_slots) ? task.retrying_failed_slots.join(",") : "",
        task.generated_count,
        task.failed_count,
        task.total_count,
        Array.isArray(task.input_sources) ? task.input_sources.map((item) => [item?.kind, item?.image_url, item?.thumbnail_url].join(":")).join("|") : "",
        Array.isArray(task.outputs) ? task.outputs.map((item) => [item?.index, item?.status, item?.url, item?.thumbnail_url, item?.error].join(":")).join("|") : ""
      ])
    });
  }
  function activeQueueTaskListRenderKey() {
    return {
      running: (state20.queue.running || []).map((task) => String(task.task_id || "")),
      waiting: (state20.queue.waiting || []).map((task) => String(task.task_id || ""))
    };
  }
  function taskThumbShowsLoading(task) {
    const status = String(task?.status || "");
    return Boolean(task?.local_pending || ["submitting", "queued", "running"].includes(status));
  }
  function taskThumbHtml(task, className = "task-thumb") {
    const outputUrl = taskOutputUrls(task)[0];
    const outputThumbnailUrl = taskThumbnailUrls(task)[0];
    const inputPreviewUrl = taskInputPreviewUrls(task)[0];
    const imageUrl = outputThumbnailUrl || outputUrl || task.preview_url || inputPreviewUrl;
    const safeClassName = escapeHtml14(className);
    if (imageUrl && inputPreviewUrl) {
      const loadingSpinner = taskThumbShowsLoading(task) ? '<span class="task-thumb-stack-spinner" aria-hidden="true"></span>' : "";
      return `
      <div class="${safeClassName} task-thumb-stack" aria-label="\u56FE\u751F\u56FE\u4EFB\u52A1\u7F29\u7565\u56FE">
        <img class="task-thumb-reference" src="${escapeHtml14(inputPreviewUrl)}" alt="" loading="lazy" decoding="async">
        <img class="task-thumb-output" src="${escapeHtml14(imageUrl)}" alt="" loading="lazy" decoding="async">
        ${loadingSpinner}
      </div>
    `;
    }
    if (imageUrl) {
      return `
      <div class="${safeClassName} task-thumb-single" aria-label="\u6587\u751F\u56FE\u4EFB\u52A1\u7F29\u7565\u56FE">
        <img class="task-thumb-single-image" src="${escapeHtml14(imageUrl)}" alt="" loading="lazy" decoding="async">
        <span class="task-thumb-mode-badge" aria-hidden="true">\u6587</span>
      </div>
    `;
    }
    if (task.status === "failed") {
      return `<div class="${safeClassName} failed-thumb" aria-label="\u4EFB\u52A1\u5931\u8D25"><span>!</span></div>`;
    }
    return `<div class="${safeClassName} running-thumb"><span></span></div>`;
  }
  function taskStatusLightHtml(task) {
    const tone = taskStatusTone(task);
    const label = escapeHtml14(formatTaskStatus2(task) || "\u672A\u77E5\u72B6\u6001");
    const taskId = escapeHtml14(task?.task_id || "");
    return `
    <span class="task-status-light ${tone}" aria-hidden="true"></span>
    <span class="task-status-label" data-task-status-id="${taskId}">${label}</span>
  `;
  }
  function taskStatusTone(task) {
    const status = String(task?.status || "");
    if (["failed", "partial_failed"].includes(status)) return "failed";
    if (status === "completed") return "completed";
    if (status === "running") return "running";
    if (status === "queued" || status === "submitting") return "queued";
    return "unknown";
  }
  function taskStatusAccessibleLabel2(task) {
    return [formatTaskStatus2(task) || "\u672A\u77E5\u72B6\u6001", taskImageSummaryText(task), taskMetaDetailsText(task)].filter(Boolean).join(" \xB7 ");
  }
  function taskMetaDetailsText(task) {
    const failure = taskFailureMessage(task);
    const retryText = taskRetryStateText2(task);
    const size = task.output_size || task.params?.size || "";
    const backend = taskBackendLabel2(task);
    return [failure, retryText, size, backend].filter(Boolean).join(" \xB7 ");
  }
  function taskImageBlocksHtml(task) {
    const states = taskImageBlockStates(task);
    const visibleStates = compressTaskImageBlockStates(states);
    const total = states.length;
    const visibleCount = Math.min(total, 12);
    const compressedClass = states.length > visibleStates.length ? " compressed" : "";
    const blocks = visibleStates.map((blockState) => `<span class="task-image-block ${blockState}" aria-hidden="true"></span>`).join("");
    return `<div class="task-image-progress${compressedClass}" style="--task-block-count: ${visibleCount}" aria-hidden="true">${blocks}</div>`;
  }
  function taskImageSummaryText(task) {
    const states = taskImageBlockStates(task);
    const counts = taskImageStatusCounts(states);
    const parts = [`${states.length} \u5F20`, `\u6210\u529F ${counts.completed}`, `\u5931\u8D25 ${counts.failed}`];
    if (counts.running) parts.push(`\u751F\u6210\u4E2D ${counts.running}`);
    if (counts.queued || counts.waiting) parts.push(`\u7B49\u5F85 ${counts.queued + counts.waiting}`);
    return parts.join(" \xB7 ");
  }
  function taskMetaText2(task) {
    const failure = taskFailureMessage(task);
    const status = failure ? `${formatTaskStatus2(task)} \xB7 ${failure}` : formatTaskStatus2(task);
    const size = task.output_size || task.params?.size || "";
    const backend = taskBackendLabel2(task);
    return [status, size, backend].filter(Boolean).join(" \xB7 ");
  }
  function initTaskListRenderFeature() {
    Object.assign(getLegacyBridge().methods, {
      renderTasks: renderTasks2,
      taskSearchQuery,
      taskFilterValues,
      taskMatchesSearch,
      taskMatchesFilters,
      filteredVisibleTasks,
      taskAnchorLayout,
      renderExpandedTaskGroupShellHtml,
      scheduleExpandedTaskGroupItemsRender,
      expandedTaskGroupHtml,
      activeTaskGroupHtml,
      activeTaskSections,
      activeTaskOrderIndex,
      revealActiveTaskGroup,
      taskGroupHtml,
      taskGroupButtonLabel,
      taskCardHtml,
      taskHasUnreadUpdate,
      taskHasViewableUpdate,
      taskHistoryGroups,
      isAlwaysVisibleTask,
      taskDateBucket,
      taskListRenderKey,
      taskCardElement,
      updateTaskSelectionVisuals,
      taskThumbHtml,
      taskStatusLightHtml,
      taskStatusTone,
      taskStatusAccessibleLabel: taskStatusAccessibleLabel2,
      taskMetaDetailsText,
      taskImageBlocksHtml,
      taskImageSummaryText,
      taskMetaText: taskMetaText2
    });
  }

  // codex_image/webui/frontend/src/task-history-anchors.ts
  var bridge27 = getLegacyBridge();
  var state21 = bridge27.state;
  var els30 = bridge27.els;
  var taskHistoryAnchorInsetObserver = null;
  var TASK_HISTORY_LAYOUT_EASING = "ease";
  var TASK_HISTORY_LAYOUT_DURATION_MS = 180;
  var TASK_GROUP_ORDER = ["active", "today", "yesterday", "last7", "older", "search"];
  var TASK_HISTORY_ALL_COLLAPSED_SENTINEL = "__all_collapsed__";
  function legacyMethod31(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function escapeHtml15(...args) {
    return legacyMethod31("escapeHtml", ...args);
  }
  function element(node) {
    return node instanceof HTMLElement ? node : null;
  }
  function isAllCollapsedExpandedTaskGroupKey(groupKey) {
    return String(groupKey || "") === TASK_HISTORY_ALL_COLLAPSED_SENTINEL;
  }
  function normalizedExpandedTaskGroupKey(groupKey) {
    const key = String(groupKey || "");
    if (!key) return TASK_HISTORY_ALL_COLLAPSED_SENTINEL;
    return key;
  }
  function restoreExpandedTaskGroupKey() {
    try {
      const stored = localStorage.getItem(TASK_HISTORY_EXPANDED_GROUP_STORAGE_KEY) || "";
      state21.expandedTaskGroupKey = stored || null;
    } catch {
      state21.expandedTaskGroupKey = null;
    }
  }
  function persistExpandedTaskGroupKey() {
    try {
      if (state21.expandedTaskGroupKey) {
        localStorage.setItem(TASK_HISTORY_EXPANDED_GROUP_STORAGE_KEY, state21.expandedTaskGroupKey);
      } else {
        localStorage.removeItem(TASK_HISTORY_EXPANDED_GROUP_STORAGE_KEY);
      }
    } catch {
    }
  }
  function syncTaskHistoryAnchorInset() {
    const shell = element(els30.taskHistoryShell);
    const sidebarContent = element(els30.sidebarContent);
    if (!shell || !sidebarContent) return;
    const scrollbarInset = Math.max(0, sidebarContent.offsetWidth - sidebarContent.clientWidth);
    shell.style.setProperty("--task-history-scrollbar-offset", `${scrollbarInset}px`);
  }
  function nearestVisibleGroupKey(groups, currentKey) {
    const visibleKeys = groups.map((group) => String(group.key));
    const currentIndex = TASK_GROUP_ORDER.indexOf(String(currentKey || ""));
    if (currentIndex < 0) return visibleKeys[0] || null;
    for (let index = currentIndex + 1; index < TASK_GROUP_ORDER.length; index += 1) {
      const nextKey = TASK_GROUP_ORDER[index];
      if (nextKey && visibleKeys.includes(nextKey)) return nextKey;
    }
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const previousKey = TASK_GROUP_ORDER[index];
      if (previousKey && visibleKeys.includes(previousKey)) return previousKey;
    }
    return visibleKeys[0] || null;
  }
  function ensureExpandedTaskGroupKey2(groups) {
    const visible = groups.filter((group) => Array.isArray(group?.tasks) && group.tasks.length);
    if (!visible.length) {
      state21.expandedTaskGroupKey = null;
      persistExpandedTaskGroupKey();
      return null;
    }
    if (isAllCollapsedExpandedTaskGroupKey(state21.expandedTaskGroupKey)) {
      return null;
    }
    const existing = visible.find((group) => String(group.key) === String(state21.expandedTaskGroupKey));
    if (existing) return existing;
    const fallbackKey = nearestVisibleGroupKey(visible, state21.expandedTaskGroupKey);
    const fallback = visible.find((group) => String(group.key) === String(fallbackKey)) || visible[0] || null;
    state21.expandedTaskGroupKey = fallback?.key || null;
    persistExpandedTaskGroupKey();
    return fallback;
  }
  function applyImmediateAnchorSelection(groupKey) {
    document.querySelectorAll("[data-task-group-anchor-key]").forEach((node) => {
      node.classList.toggle(
        "active",
        String(node.dataset.taskGroupAnchorKey || "") === String(groupKey || "")
      );
    });
  }
  function setExpandedTaskGroupKey(groupKey, { immediate = false } = {}) {
    const key = normalizedExpandedTaskGroupKey(groupKey);
    if (state21.expandedTaskGroupKey === key) {
      if (immediate) applyImmediateAnchorSelection(isAllCollapsedExpandedTaskGroupKey(key) ? "" : key);
      return false;
    }
    state21.expandedTaskGroupKey = key;
    persistExpandedTaskGroupKey();
    if (immediate) applyImmediateAnchorSelection(isAllCollapsedExpandedTaskGroupKey(key) ? "" : key);
    state21.tasksRenderKey = null;
    return true;
  }
  function scrollExpandedTaskGroupToTop2(behavior = "smooth") {
    const sidebarContent = element(els30.sidebarContent);
    if (!sidebarContent) return;
    sidebarContent.scrollTo({ top: 0, behavior });
  }
  function anchorRowHtml(group) {
    const key = escapeHtml15(group.key);
    return `
    <button
      class="task-history-anchor-row"
      type="button"
      data-task-group-anchor-key="${key}"
      data-task-group-toggle-key="${key}"
      aria-expanded="false"
      aria-label="\u5C55\u5F00 ${escapeHtml15(group.label)}"
    >
      <span class="task-history-anchor-label">
        <span class="task-group-title">
          <span class="task-group-label">${escapeHtml15(group.label)}</span>
          <span class="task-group-count-separator" aria-hidden="true"> \xB7 </span>
          <span class="task-group-count">${group.tasks.length}</span>
        </span>
      </span>
      <span
        class="task-history-anchor-arrow"
        aria-hidden="true"
      >
        <span class="task-group-toggle" aria-hidden="true">
          <svg class="task-group-toggle-icon" viewBox="0 0 12 12" focusable="false">
            <path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
          </svg>
        </span>
      </span>
    </button>
  `;
  }
  function renderTaskHistoryAnchors2(layout) {
    const topAnchors = element(els30.taskHistoryTopAnchors);
    const bottomAnchors = element(els30.taskHistoryBottomAnchors);
    if (!topAnchors || !bottomAnchors) return;
    syncTaskHistoryAnchorInset();
    topAnchors.innerHTML = layout.top.map((group) => anchorRowHtml(group)).join("");
    bottomAnchors.innerHTML = layout.bottom.map((group) => anchorRowHtml(group)).join("");
    topAnchors.classList.toggle("hidden", !layout.top.length);
    bottomAnchors.classList.toggle("hidden", !layout.bottom.length);
    applyImmediateAnchorSelection(layout.expandedKey || "");
  }
  function taskHistoryLayoutElements() {
    const shell = element(els30.taskHistoryShell);
    if (!shell) return [];
    return Array.from(
      shell.querySelectorAll(".task-history-anchor-row, .task-group-header-split")
    ).map((node) => {
      const key = String(
        node.dataset.taskGroupAnchorKey || node.dataset.taskGroupToggleKey || ""
      );
      if (!key) return null;
      const rect = node.getBoundingClientRect();
      return {
        key,
        kind: node.classList.contains("task-history-anchor-row") ? "anchor" : "expanded",
        node,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      };
    }).filter(Boolean);
  }
  function captureTaskHistoryLayout2() {
    return taskHistoryLayoutElements().reduce((snapshot, item) => {
      snapshot[item.key] = {
        kind: item.kind,
        rect: item.rect
      };
      return snapshot;
    }, {});
  }
  function animateTaskHistoryLayout2(previousLayout = {}) {
    requestAnimationFrame(() => {
      taskHistoryLayoutElements().forEach((item) => {
        const previous = previousLayout[item.key];
        if (previous) {
          const dx = previous.rect.left - item.rect.left;
          const dy = previous.rect.top - item.rect.top;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            item.node.animate(
              [
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: "translate(0px, 0px)" }
              ],
              {
                duration: TASK_HISTORY_LAYOUT_DURATION_MS,
                easing: TASK_HISTORY_LAYOUT_EASING
              }
            );
          }
          if (previous.kind !== item.kind) {
            const toggle = item.node.querySelector(".task-group-toggle");
            const fromAngle = previous.kind === "expanded" ? 90 : 0;
            const toAngle = item.kind === "expanded" ? 90 : 0;
            if (toggle && fromAngle !== toAngle) {
              toggle.animate(
                [
                  { transform: `rotate(${fromAngle}deg)` },
                  { transform: `rotate(${toAngle}deg)` }
                ],
                {
                  duration: TASK_HISTORY_LAYOUT_DURATION_MS,
                  easing: TASK_HISTORY_LAYOUT_EASING
                }
              );
            }
          }
        }
      });
    });
  }
  function initTaskHistoryAnchorsFeature() {
    if (typeof ResizeObserver === "function" && !taskHistoryAnchorInsetObserver && element(els30.sidebarContent)) {
      taskHistoryAnchorInsetObserver = new ResizeObserver(() => syncTaskHistoryAnchorInset());
      taskHistoryAnchorInsetObserver.observe(element(els30.sidebarContent));
    }
    syncTaskHistoryAnchorInset();
    Object.assign(getLegacyBridge().methods, {
      restoreExpandedTaskGroupKey,
      ensureExpandedTaskGroupKey: ensureExpandedTaskGroupKey2,
      setExpandedTaskGroupKey,
      scrollExpandedTaskGroupToTop: scrollExpandedTaskGroupToTop2,
      renderTaskHistoryAnchors: renderTaskHistoryAnchors2,
      captureTaskHistoryLayout: captureTaskHistoryLayout2,
      animateTaskHistoryLayout: animateTaskHistoryLayout2
    });
  }

  // codex_image/webui/frontend/src/task-archive-controls.ts
  var bridge28 = getLegacyBridge();
  var state22 = bridge28.state;
  var els31 = bridge28.els;
  function legacyMethod32(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var ARCHIVED_TASKS_STORAGE_KEY = "codex-image-archived-task-ids";
  function errorMessage(error, fallback) {
    return error instanceof Error ? error.message || fallback : fallback;
  }
  function setStatus15(...args) {
    return legacyMethod32("setStatus", ...args);
  }
  function renderTasks3(...args) {
    return legacyMethod32("renderTasks", ...args);
  }
  function closePromptPopover4(...args) {
    return legacyMethod32("closePromptPopover", ...args);
  }
  function taskThumbHtml2(...args) {
    return legacyMethod32("taskThumbHtml", ...args);
  }
  function escapeHtml16(...args) {
    return legacyMethod32("escapeHtml", ...args);
  }
  function formatTaskStatus3(...args) {
    return legacyMethod32("formatTaskStatus", ...args);
  }
  function openTaskDeleteConfirm(...args) {
    return legacyMethod32("openTaskDeleteConfirm", ...args);
  }
  function taskArchived2(task) {
    return Boolean(task?.archived_at);
  }
  function restoreLegacyArchivedTasks() {
    try {
      const stored = JSON.parse(localStorage.getItem(ARCHIVED_TASKS_STORAGE_KEY) || "[]");
      state22.legacyArchivedTaskIds = Array.isArray(stored) ? stored.filter(Boolean).map(String) : [];
    } catch {
      state22.legacyArchivedTaskIds = [];
    }
  }
  function clearLegacyArchivedTasks() {
    try {
      localStorage.removeItem(ARCHIVED_TASKS_STORAGE_KEY);
    } catch {
    }
    state22.legacyArchivedTaskIds = [];
  }
  function isTaskArchived2(taskId) {
    const id = String(taskId);
    const task = state22.tasks.find((item) => String(item.task_id) === id);
    return taskArchived2(task) || state22.legacyArchivedTaskIds.includes(id);
  }
  function firstVisibleTaskId() {
    return state22.tasks.find((task) => !isTaskArchived2(task.task_id))?.task_id || null;
  }
  function replaceTask(updatedTask) {
    if (!updatedTask?.task_id) return;
    state22.tasks = state22.tasks.map((task) => String(task.task_id) === String(updatedTask.task_id) ? updatedTask : task);
  }
  function cleanupSessionSelections() {
    const taskIds = new Set(state22.tasks.map((task) => String(task.task_id)));
    state22.batchSelectedTaskIds = state22.batchSelectedTaskIds.filter((taskId) => {
      return taskIds.has(String(taskId)) && !isTaskArchived2(taskId);
    });
  }
  async function setTaskArchiveState(taskId, archived) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || (archived ? "\u5F52\u6863\u5931\u8D25" : "\u6062\u590D\u5931\u8D25"));
    return data.task;
  }
  async function migrateLegacyArchivedTasks() {
    const ids = state22.legacyArchivedTaskIds.filter((taskId) => {
      const task = state22.tasks.find((item) => String(item.task_id) === String(taskId));
      return task && !taskArchived2(task);
    });
    if (!ids.length) {
      clearLegacyArchivedTasks();
      return;
    }
    const results = await Promise.allSettled(ids.map((taskId) => setTaskArchiveState(taskId, true)));
    let hasFailure = false;
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        replaceTask(result.value);
      } else {
        hasFailure = true;
      }
    });
    if (!hasFailure) {
      clearLegacyArchivedTasks();
    }
  }
  function renderArchiveButton() {
    if (!els31.archiveButton) return;
    const count = state22.tasks.filter((task) => isTaskArchived2(task.task_id)).length;
    els31.archiveButton.textContent = count ? `\u4F1A\u8BDD\u5F52\u6863 ${count}` : "\u4F1A\u8BDD\u5F52\u6863";
  }
  async function restoreArchivedTask(taskId) {
    try {
      const updatedTask = await setTaskArchiveState(taskId, false);
      replaceTask(updatedTask);
      renderTasks3();
      renderArchiveButton();
      renderArchiveModal();
      setStatus15("\u4F1A\u8BDD\u5DF2\u6062\u590D", "ok");
    } catch (error) {
      setStatus15(errorMessage(error, "\u6062\u590D\u5931\u8D25"), "error");
    }
  }
  function openArchiveModal() {
    closePromptPopover4();
    renderArchiveModal();
    els31.archiveModal?.classList.remove("hidden");
    els31.archiveModal?.setAttribute("aria-hidden", "false");
  }
  function closeArchiveModal() {
    els31.archiveModal?.classList.add("hidden");
    els31.archiveModal?.setAttribute("aria-hidden", "true");
  }
  function renderArchiveModal() {
    if (!els31.archiveList || !els31.archiveCount) return;
    const archivedTasks = state22.tasks.filter((task) => isTaskArchived2(task.task_id));
    els31.archiveCount.textContent = archivedTasks.length ? `${archivedTasks.length} \u4E2A\u5F52\u6863\u4F1A\u8BDD` : "\u6682\u65E0\u5F52\u6863\u4F1A\u8BDD";
    if (!archivedTasks.length) {
      els31.archiveList.innerHTML = `<div class="archive-empty">\u6682\u65E0\u5F52\u6863\u4F1A\u8BDD</div>`;
      return;
    }
    els31.archiveList.innerHTML = archivedTasks.map((task) => {
      const image = taskThumbHtml2(task, "archive-thumb");
      const title = escapeHtml16(task.prompt || task.mode || "Untitled");
      const status = escapeHtml16(formatTaskStatus3(task));
      const size = escapeHtml16(task.output_size || task.params?.size || "");
      const taskId = escapeHtml16(task.task_id);
      return `
      <article class="archive-card" data-archive-select-task-id="${taskId}">
        ${image}
        <div class="archive-info">
          <strong>${title}</strong>
          <span>${status} \xB7 ${size}</span>
        </div>
        <div class="archive-card-actions">
          <button class="ghost-button text-sm" type="button" data-restore-archive-task-id="${taskId}">\u6062\u590D</button>
          <button class="ghost-button text-sm danger-button" type="button" data-delete-archive-task-id="${taskId}">\u5220\u9664</button>
        </div>
      </article>
    `;
    }).join("");
    els31.archiveList.querySelectorAll("[data-archive-select-task-id]").forEach((card) => {
      card.addEventListener("click", () => {
        legacyMethod32("selectTask", card.dataset.archiveSelectTaskId);
        closeArchiveModal();
      });
    });
    els31.archiveList.querySelectorAll("[data-restore-archive-task-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        restoreArchivedTask(button.dataset.restoreArchiveTaskId);
      });
    });
    els31.archiveList.querySelectorAll("[data-delete-archive-task-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openTaskDeleteConfirm(button, button.dataset.deleteArchiveTaskId);
      });
    });
  }
  function initTaskArchiveControlsFeature() {
    Object.assign(getLegacyBridge().methods, {
      taskArchived: taskArchived2,
      restoreLegacyArchivedTasks,
      clearLegacyArchivedTasks,
      isTaskArchived: isTaskArchived2,
      firstVisibleTaskId,
      replaceTask,
      cleanupSessionSelections,
      setTaskArchiveState,
      migrateLegacyArchivedTasks,
      renderArchiveButton,
      restoreArchivedTask,
      openArchiveModal,
      closeArchiveModal,
      renderArchiveModal
    });
  }

  // codex_image/webui/frontend/src/task-batch-controls.ts
  var bridge29 = getLegacyBridge();
  var state23 = bridge29.state;
  var els32 = bridge29.els;
  function legacyMethod33(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var TASK_CARD_SELECTOR = ".task-card[data-task-id]";
  function errorMessage2(error, fallback) {
    return error instanceof Error ? error.message || fallback : fallback;
  }
  function setStatus16(...args) {
    return legacyMethod33("setStatus", ...args);
  }
  function isTaskArchived3(...args) {
    return legacyMethod33("isTaskArchived", ...args);
  }
  function renderTasks4(...args) {
    return legacyMethod33("renderTasks", ...args);
  }
  function setTaskArchiveState2(...args) {
    return legacyMethod33("setTaskArchiveState", ...args);
  }
  function replaceTask2(...args) {
    return legacyMethod33("replaceTask", ...args);
  }
  function firstVisibleTaskId2(...args) {
    return legacyMethod33("firstVisibleTaskId", ...args);
  }
  function renderArchiveButton2(...args) {
    return legacyMethod33("renderArchiveButton", ...args);
  }
  function renderArchiveModal2(...args) {
    return legacyMethod33("renderArchiveModal", ...args);
  }
  function renderPreview2(...args) {
    return legacyMethod33("renderPreview", ...args);
  }
  function openConfirmPopover4(...args) {
    return legacyMethod33("openConfirmPopover", ...args);
  }
  function deleteTaskById(...args) {
    return legacyMethod33("deleteTaskById", ...args);
  }
  function toggleBatchMode(force) {
    state23.batchMode = typeof force === "boolean" ? force : !state23.batchMode;
    if (!state23.batchMode) {
      state23.batchSelectedTaskIds = [];
      finishBatchMarqueeSelection();
    }
    renderTasks4();
    renderBatchToolbar2();
  }
  function toggleBatchTaskSelection(taskId) {
    const id = String(taskId || "");
    if (!id || isTaskArchived3(id)) return;
    if (state23.batchSelectedTaskIds.includes(id)) {
      removeBatchSelectedTaskId(id);
    } else {
      state23.batchSelectedTaskIds.push(id);
    }
    renderTasks4();
  }
  function removeBatchSelectedTaskId(taskId) {
    const id = String(taskId || "");
    state23.batchSelectedTaskIds = state23.batchSelectedTaskIds.filter((item) => item !== id);
  }
  function renderBatchToolbar2() {
    if (!els32.batchToolbar) return;
    els32.batchToolbar.classList.toggle("hidden", !state23.batchMode);
    els32.taskList?.classList.toggle("batch-marquee-enabled", state23.batchMode);
    els32.batchManageButton?.classList.toggle("active", state23.batchMode);
    const count = state23.batchSelectedTaskIds.length;
    if (els32.batchSelectedCount) {
      els32.batchSelectedCount.textContent = `\u5DF2\u9009\u62E9 ${count} \u4E2A`;
    }
    [els32.batchArchiveButton, els32.batchDeleteButton].forEach((button) => {
      if (button) button.disabled = count === 0;
    });
  }
  async function archiveSelectedTasks() {
    const ids = state23.batchSelectedTaskIds.slice();
    if (!ids.length) return;
    const updatedTasks = [];
    try {
      for (const taskId of ids) {
        const updatedTask = await setTaskArchiveState2(taskId, true);
        updatedTasks.push(updatedTask);
      }
      updatedTasks.forEach(replaceTask2);
      if (ids.includes(String(state23.selectedTaskId))) {
        state23.selectedTaskId = firstVisibleTaskId2();
      }
      state23.batchSelectedTaskIds = [];
      state23.batchMode = false;
      renderTasks4();
      renderArchiveButton2();
      renderArchiveModal2();
      renderPreview2();
      setStatus16(`\u5DF2\u5F52\u6863 ${ids.length} \u4E2A\u4F1A\u8BDD`, "ok");
    } catch (error) {
      updatedTasks.forEach(replaceTask2);
      renderTasks4();
      renderArchiveButton2();
      renderArchiveModal2();
      renderPreview2();
      setStatus16(errorMessage2(error, "\u6279\u91CF\u5F52\u6863\u5931\u8D25"), "error");
    }
  }
  function openBatchDeleteConfirm() {
    const selectedTasks = state23.batchSelectedTaskIds.map((taskId) => state23.tasks.find((task) => String(task.task_id) === String(taskId))).filter(Boolean);
    const deletableTasks = selectedTasks.filter((task) => task.status !== "running" && !task.local_pending);
    const skippedCount = selectedTasks.length - deletableTasks.length;
    if (!deletableTasks.length) {
      setStatus16("\u9009\u4E2D\u7684\u4F1A\u8BDD\u6B63\u5728\u8FD0\u884C\uFF0C\u4E0D\u80FD\u5220\u9664", "error");
      return;
    }
    openConfirmPopover4(els32.batchDeleteButton, {
      title: `\u5220\u9664 ${deletableTasks.length} \u4E2A\u4F1A\u8BDD\uFF1F`,
      message: "\u4F1A\u540C\u65F6\u5220\u9664\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002",
      detail: skippedCount ? `${skippedCount} \u4E2A\u8FD0\u884C\u4E2D\u4EFB\u52A1\u4F1A\u4FDD\u7559` : "",
      confirmText: "\u5220\u9664",
      onConfirm: async () => {
        await deleteSelectedTasks(deletableTasks, skippedCount);
      }
    });
  }
  async function deleteSelectedTasks(deletableTasks, skippedCount = 0) {
    try {
      for (const task of deletableTasks) {
        await deleteTaskById(task.task_id);
      }
      state23.batchSelectedTaskIds = [];
      state23.batchMode = false;
      renderTasks4();
      renderArchiveButton2();
      renderArchiveModal2();
      renderPreview2();
      const skippedText = skippedCount ? `\uFF0C${skippedCount} \u4E2A\u8FD0\u884C\u4E2D\u672A\u5220\u9664` : "";
      setStatus16(`\u5DF2\u5220\u9664 ${deletableTasks.length} \u4E2A\u4F1A\u8BDD${skippedText}`, "ok");
    } catch (error) {
      renderTasks4();
      renderArchiveButton2();
      renderArchiveModal2();
      renderPreview2();
      setStatus16(errorMessage2(error, "\u6279\u91CF\u5220\u9664\u5931\u8D25"), "error");
    }
  }
  function handleTaskListPointerDown(event) {
    if (!state23.batchMode || !els32.taskList || event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, a")) return;
    if (!event.target.closest(".task-card[data-task-id]") && event.target !== els32.taskList) return;
    state23.batchSelectionDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      active: false,
      originSelectedTaskIds: state23.batchSelectedTaskIds.slice(),
      marquee: null
    };
    window.addEventListener("pointermove", handleTaskListPointerMove);
    window.addEventListener("pointerup", handleTaskListPointerUp);
    window.addEventListener("pointercancel", handleTaskListPointerUp);
  }
  function handleTaskListPointerMove(event) {
    const drag = state23.batchSelectionDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    if (!drag.active) {
      const distance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
      if (distance < 6) return;
      drag.active = true;
      state23.suppressTaskClickAfterDrag = true;
      els32.taskList?.classList.add("batch-marquee-active");
      drag.marquee = document.createElement("div");
      drag.marquee.className = "batch-selection-marquee";
      document.body.appendChild(drag.marquee);
    }
    event.preventDefault();
    updateBatchMarqueeSelection();
  }
  function handleTaskListPointerUp(event) {
    const drag = state23.batchSelectionDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.active) {
      event.preventDefault();
      updateBatchMarqueeSelection();
    }
    finishBatchMarqueeSelection();
  }
  function updateBatchMarqueeSelection() {
    const drag = state23.batchSelectionDrag;
    if (!drag?.active) return;
    const selectionRect = normalizeSelectionRect(drag.startX, drag.startY, drag.currentX, drag.currentY);
    if (drag.marquee) {
      drag.marquee.style.left = `${selectionRect.left}px`;
      drag.marquee.style.top = `${selectionRect.top}px`;
      drag.marquee.style.width = `${selectionRect.width}px`;
      drag.marquee.style.height = `${selectionRect.height}px`;
    }
    const nextSelectedIds = new Set(drag.originSelectedTaskIds.map(String));
    els32.taskList.querySelectorAll(TASK_CARD_SELECTOR).forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      if (rectsIntersect(selectionRect, cardRect)) {
        nextSelectedIds.add(String(card.dataset.taskId));
      }
    });
    applyBatchSelectionPreview([...nextSelectedIds]);
  }
  function applyBatchSelectionPreview(taskIds) {
    const nextIds = taskIds.map(String).filter((id) => id && !isTaskArchived3(id));
    const nextSet = new Set(nextIds);
    const previous = state23.batchSelectedTaskIds.map(String).sort().join("|");
    const next = nextIds.slice().sort().join("|");
    if (previous === next) return;
    state23.batchSelectedTaskIds = nextIds;
    els32.taskList.querySelectorAll(TASK_CARD_SELECTOR).forEach((card) => {
      const selected = nextSet.has(String(card.dataset.taskId));
      card.classList.toggle("batch-selected", selected);
      const selectButton = card.querySelector("[data-batch-select-task-id]");
      if (selectButton) selectButton.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    renderBatchToolbar2();
  }
  function normalizeSelectionRect(startX, startY, currentX, currentY) {
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const right = Math.max(startX, currentX);
    const bottom = Math.max(startY, currentY);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }
  function rectsIntersect(selectionRect, cardRect) {
    return selectionRect.left <= cardRect.right && selectionRect.right >= cardRect.left && selectionRect.top <= cardRect.bottom && selectionRect.bottom >= cardRect.top;
  }
  function finishBatchMarqueeSelection() {
    const drag = state23.batchSelectionDrag;
    if (drag?.marquee) {
      drag.marquee.remove();
    }
    state23.batchSelectionDrag = null;
    els32.taskList?.classList.remove("batch-marquee-active");
    window.removeEventListener("pointermove", handleTaskListPointerMove);
    window.removeEventListener("pointerup", handleTaskListPointerUp);
    window.removeEventListener("pointercancel", handleTaskListPointerUp);
  }
  function initTaskBatchControlsFeature() {
    Object.assign(getLegacyBridge().methods, {
      toggleBatchMode,
      toggleBatchTaskSelection,
      removeBatchSelectedTaskId,
      renderBatchToolbar: renderBatchToolbar2,
      archiveSelectedTasks,
      openBatchDeleteConfirm,
      deleteSelectedTasks,
      handleTaskListPointerDown,
      handleTaskListPointerMove,
      handleTaskListPointerUp,
      updateBatchMarqueeSelection,
      applyBatchSelectionPreview,
      normalizeSelectionRect,
      rectsIntersect,
      finishBatchMarqueeSelection
    });
  }

  // codex_image/webui/frontend/src/task-actions.ts
  var bridge30 = getLegacyBridge();
  var state24 = bridge30.state;
  var els33 = bridge30.els;
  function legacyMethod34(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function errorMessage3(error, fallback) {
    return error instanceof Error ? error.message || fallback : fallback;
  }
  var TaskActionHttpError = class extends Error {
    constructor(message, status) {
      super(message);
      __publicField(this, "status");
      this.name = "TaskActionHttpError";
      this.status = status;
    }
  };
  function isTaskActionConflict(error) {
    return error instanceof TaskActionHttpError && error.status === 409;
  }
  function setStatus17(...args) {
    return legacyMethod34("setStatus", ...args);
  }
  function closePromptPopover5(...args) {
    return legacyMethod34("closePromptPopover", ...args);
  }
  function setTaskArchiveState3(...args) {
    return legacyMethod34("setTaskArchiveState", ...args);
  }
  function replaceTask3(...args) {
    return legacyMethod34("replaceTask", ...args);
  }
  function removeBatchSelectedTaskId2(...args) {
    return legacyMethod34("removeBatchSelectedTaskId", ...args);
  }
  function firstVisibleTaskId3(...args) {
    return legacyMethod34("firstVisibleTaskId", ...args);
  }
  function renderTasks5(...args) {
    return legacyMethod34("renderTasks", ...args);
  }
  function updateTaskSelectionVisuals2(...args) {
    return legacyMethod34("updateTaskSelectionVisuals", ...args);
  }
  function renderArchiveButton3(...args) {
    return legacyMethod34("renderArchiveButton", ...args);
  }
  function renderArchiveModal3(...args) {
    return legacyMethod34("renderArchiveModal", ...args);
  }
  function renderPreview3(...args) {
    return legacyMethod34("renderPreview", ...args);
  }
  function openConfirmPopover5(...args) {
    return legacyMethod34("openConfirmPopover", ...args);
  }
  function canRetryFailedTask(...args) {
    return legacyMethod34("canRetryFailedTask", ...args);
  }
  function canAcceptTaskSuccesses(...args) {
    return legacyMethod34("canAcceptTaskSuccesses", ...args);
  }
  function currentApiProviderId2(...args) {
    return legacyMethod34("currentApiProviderId", ...args);
  }
  function updateTaskInState2(...args) {
    return legacyMethod34("updateTaskInState", ...args);
  }
  async function refreshTaskAfterActionConflict(taskId) {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return false;
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(normalizedTaskId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) return false;
      const updatedTask = data.task;
      updateTaskInState2(updatedTask);
      state24.selectedTaskId = updatedTask.task_id;
      renderTasks5();
      renderArchiveButton3();
      renderArchiveModal3();
      renderPreview3(updatedTask);
      setStatus17("\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0", "ok");
      return true;
    } catch (error) {
      console.warn(error);
      return false;
    }
  }
  async function archiveTask(taskId) {
    const task = state24.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task) return;
    try {
      const updatedTask = await setTaskArchiveState3(taskId, true);
      replaceTask3(updatedTask);
      removeBatchSelectedTaskId2(taskId);
      if (String(state24.selectedTaskId) === String(taskId)) {
        state24.selectedTaskId = firstVisibleTaskId3();
      }
      renderTasks5();
      renderArchiveButton3();
      renderArchiveModal3();
      renderPreview3();
      setStatus17("\u4F1A\u8BDD\u5DF2\u5F52\u6863", "ok");
    } catch (error) {
      setStatus17(errorMessage3(error, "\u5F52\u6863\u5931\u8D25"), "error");
    }
  }
  async function deleteTask(taskId) {
    closePromptPopover5();
    try {
      await deleteTaskById2(taskId);
      renderTasks5();
      renderArchiveButton3();
      renderArchiveModal3();
      renderPreview3();
      setStatus17("\u4EFB\u52A1\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      setStatus17(errorMessage3(error, "\u5220\u9664\u5931\u8D25"), "error");
    }
  }
  async function deleteTaskById2(taskId) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "\u5220\u9664\u5931\u8D25");
    }
    state24.tasks = state24.tasks.filter((item) => String(item.task_id) !== String(taskId));
    removeBatchSelectedTaskId2(taskId);
    if (String(state24.selectedTaskId) === String(taskId)) {
      state24.selectedTaskId = firstVisibleTaskId3();
    }
  }
  async function retryFailedTask(taskId) {
    closePromptPopover5();
    const task = state24.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task || !canRetryFailedTask(task)) {
      if (await refreshTaskAfterActionConflict(taskId)) return;
      setStatus17("\u8FD9\u4E2A\u4EFB\u52A1\u6CA1\u6709\u53EF\u91CD\u8BD5\u7684\u5931\u8D25\u56FE\u7247", "error");
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/retry-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_provider_id: currentApiProviderId2() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new TaskActionHttpError(data.detail || "\u91CD\u8BD5\u5931\u8D25\u56FE\u7247\u5931\u8D25", response.status);
      const updatedTask = data.task;
      state24.tasks = [updatedTask, ...state24.tasks.filter((item) => String(item.task_id) !== String(taskId))];
      state24.selectedTaskId = updatedTask.task_id;
      renderTasks5();
      renderPreview3(updatedTask);
      await window.refreshQueue?.();
      setStatus17("\u5DF2\u91CD\u65B0\u5165\u961F\u5931\u8D25\u56FE\u7247", "ok");
    } catch (error) {
      if (isTaskActionConflict(error) && await refreshTaskAfterActionConflict(taskId)) return;
      setStatus17(errorMessage3(error, "\u91CD\u8BD5\u5931\u8D25\u56FE\u7247\u5931\u8D25"), "error");
    }
  }
  async function acceptTaskSuccesses(taskId) {
    closePromptPopover5();
    const task = state24.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task || !canAcceptTaskSuccesses(task)) {
      if (await refreshTaskAfterActionConflict(taskId)) return;
      setStatus17("\u8FD9\u4E2A\u4EFB\u52A1\u6CA1\u6709\u53EF\u63A5\u53D7\u7684\u6210\u529F\u56FE\u7247", "error");
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/accept-successes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new TaskActionHttpError(data.detail || "\u63A5\u53D7\u6210\u529F\u7ED3\u679C\u5931\u8D25", response.status);
      const updatedTask = data.task;
      updateTaskInState2(updatedTask);
      state24.selectedTaskId = updatedTask.task_id;
      renderTasks5();
      renderArchiveButton3();
      renderArchiveModal3();
      renderPreview3(updatedTask);
      setStatus17("\u5DF2\u63A5\u53D7\u6210\u529F\u7ED3\u679C", "ok");
    } catch (error) {
      if (isTaskActionConflict(error) && await refreshTaskAfterActionConflict(taskId)) return;
      setStatus17(errorMessage3(error, "\u63A5\u53D7\u6210\u529F\u7ED3\u679C\u5931\u8D25"), "error");
    }
  }
  async function markTaskViewed(taskId) {
    if (!taskId || state24.taskViewedRequestIds.has(String(taskId))) return;
    const task = state24.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task || task.local_pending) return;
    state24.taskViewedRequestIds.add(String(taskId));
    const viewedAt = (/* @__PURE__ */ new Date()).toISOString();
    task.viewed_at = viewedAt;
    updateTaskSelectionVisuals2(taskId);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/viewed`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u5DF2\u8BFB\u72B6\u6001\u66F4\u65B0\u5931\u8D25");
      if (data.task) updateTaskInState2(data.task);
      updateTaskSelectionVisuals2(taskId);
    } catch (error) {
      console.warn(error);
    } finally {
      state24.taskViewedRequestIds.delete(String(taskId));
    }
  }
  function openTaskDeleteConfirm2(deleteButton, taskId) {
    closePromptPopover5();
    const task = state24.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task) return;
    if (task.status === "running" || task.local_pending) {
      setStatus17("\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u4E0D\u80FD\u5220\u9664", "error");
      return;
    }
    const title = task.prompt || task.mode || taskId;
    openConfirmPopover5(deleteButton, {
      title: "\u5220\u9664\u4EFB\u52A1\uFF1F",
      message: "\u4F1A\u540C\u65F6\u5220\u9664\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002",
      detail: title,
      confirmText: "\u5220\u9664",
      onConfirm: async () => {
        await deleteTask(taskId);
      }
    });
  }
  function initTaskActionsFeature() {
    Object.assign(getLegacyBridge().methods, {
      archiveTask,
      deleteTask,
      deleteTaskById: deleteTaskById2,
      retryFailedTask,
      acceptTaskSuccesses,
      markTaskViewed,
      openTaskDeleteConfirm: openTaskDeleteConfirm2
    });
  }

  // codex_image/webui/frontend/src/task-submit.ts
  var bridge31 = getLegacyBridge();
  var state25 = bridge31.state;
  var els34 = bridge31.els;
  function legacyMethod35(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var SUBMIT_TASK_TIMEOUT_MS = 45e3;
  function errorMessage4(error, fallback) {
    return error instanceof Error ? error.message || fallback : fallback;
  }
  function setStatus18(...args) {
    return legacyMethod35("setStatus", ...args);
  }
  function setMode5(...args) {
    return legacyMethod35("setMode", ...args);
  }
  function setPromptWithGalleryRefs2(...args) {
    return legacyMethod35("setPromptWithGalleryRefs", ...args);
  }
  function persistMainModel2(...args) {
    return legacyMethod35("persistMainModel", ...args);
  }
  function normalizeApiSettings2(...args) {
    return legacyMethod35("normalizeApiSettings", ...args);
  }
  function normalizeApiImagesConcurrency2(...args) {
    return legacyMethod35("normalizeApiImagesConcurrency", ...args);
  }
  function persistApiSettings2(...args) {
    return legacyMethod35("persistApiSettings", ...args);
  }
  function populateApiSettingsForm2(...args) {
    return legacyMethod35("populateApiSettingsForm", ...args);
  }
  function syncSizeControlsFromSize2(...args) {
    return legacyMethod35("syncSizeControlsFromSize", ...args);
  }
  function updatePromptCount6(...args) {
    return legacyMethod35("updatePromptCount", ...args);
  }
  function updateQuantity2(...args) {
    return legacyMethod35("updateQuantity", ...args);
  }
  function syncRadioButtons2(...args) {
    return legacyMethod35("syncRadioButtons", ...args);
  }
  function updateCompression2(...args) {
    return legacyMethod35("updateCompression", ...args);
  }
  function updateCustomSize2(...args) {
    return legacyMethod35("updateCustomSize", ...args);
  }
  function updateRequestPreview11(...args) {
    return legacyMethod35("updateRequestPreview", ...args);
  }
  function currentTaskParams2(...args) {
    return legacyMethod35("currentTaskParams", ...args);
  }
  function uploadInputs3(...args) {
    return legacyMethod35("uploadInputs", ...args);
  }
  function galleryInputs4(...args) {
    return legacyMethod35("galleryInputs", ...args);
  }
  function referenceAssetInputs3(...args) {
    return legacyMethod35("referenceAssetInputs", ...args);
  }
  function currentAuthSource3(...args) {
    return legacyMethod35("currentAuthSource", ...args);
  }
  function backendForAuthSource2(...args) {
    return legacyMethod35("backendForAuthSource", ...args);
  }
  function currentApiMode4(...args) {
    return legacyMethod35("currentApiMode", ...args);
  }
  function getPromptText9(...args) {
    return legacyMethod35("getPromptText", ...args);
  }
  function currentPromptForModel2(...args) {
    return legacyMethod35("currentPromptForModel", ...args);
  }
  function currentPromptFidelity3(...args) {
    return legacyMethod35("currentPromptFidelity", ...args);
  }
  function currentApiProviderId3(...args) {
    return legacyMethod35("currentApiProviderId", ...args);
  }
  function currentApiProviderLabel3(...args) {
    return legacyMethod35("currentApiProviderLabel", ...args);
  }
  function currentApiImagesConcurrency2(...args) {
    return legacyMethod35("currentApiImagesConcurrency", ...args);
  }
  function currentMainModel2(...args) {
    return legacyMethod35("currentMainModel", ...args);
  }
  function sourcePreviewUrl3(...args) {
    return legacyMethod35("sourcePreviewUrl", ...args);
  }
  function syncPromptFromEditor6(...args) {
    return legacyMethod35("syncPromptFromEditor", ...args);
  }
  function syncGalleryInputsFromPrompt3(...args) {
    return legacyMethod35("syncGalleryInputsFromPrompt", ...args);
  }
  function missingGalleryInputs2(...args) {
    return legacyMethod35("missingGalleryInputs", ...args);
  }
  function missingReferenceAssetInputs2(...args) {
    return legacyMethod35("missingReferenceAssetInputs", ...args);
  }
  function customSizeValidationMessage2(...args) {
    return legacyMethod35("customSizeValidationMessage", ...args);
  }
  function updatePixelPreview2(...args) {
    return legacyMethod35("updatePixelPreview", ...args);
  }
  function addPendingTask2(...args) {
    return legacyMethod35("addPendingTask", ...args);
  }
  function replacePendingTask2(...args) {
    return legacyMethod35("replacePendingTask", ...args);
  }
  function startRunFeedback2(...args) {
    return legacyMethod35("startRunFeedback", ...args);
  }
  function stopRunFeedback2(...args) {
    return legacyMethod35("stopRunFeedback", ...args);
  }
  function markPendingTaskFailed2(...args) {
    return legacyMethod35("markPendingTaskFailed", ...args);
  }
  function refreshRecentAssets2(...args) {
    return legacyMethod35("refreshRecentAssets", ...args);
  }
  function renderPreview4(...args) {
    return legacyMethod35("renderPreview", ...args);
  }
  function applyTaskToForm(task) {
    const params = task.params || {};
    setMode5(task.mode || "generate");
    setPromptWithGalleryRefs2(task.prompt || "", task.gallery_refs || []);
    const mainModel = params.main_model || task.request?.model;
    if (mainModel && els34.mainModel) {
      els34.mainModel.value = mainModel;
      persistMainModel2();
    }
    if (params.api_mode) {
      state25.apiSettings = normalizeApiSettings2(state25.apiSettings);
      if (params.api_provider_id && state25.apiSettings.providers.some((provider) => provider.id === params.api_provider_id)) {
        state25.apiSettings.active_provider_id = params.api_provider_id;
      }
      state25.apiSettings.providers = state25.apiSettings.providers.map((provider) => provider.id === state25.apiSettings.active_provider_id ? {
        ...provider,
        api_mode: params.api_mode,
        images_concurrency: params.api_images_concurrency ? normalizeApiImagesConcurrency2(params.api_images_concurrency) : provider.images_concurrency
      } : provider);
      persistApiSettings2();
      populateApiSettingsForm2();
    }
    if (els34.promptFidelity) {
      const fidelity = ["strict", "original", "off"].includes(params.prompt_fidelity) ? params.prompt_fidelity : "strict";
      els34.promptFidelity.value = fidelity;
      els34.promptFidelity.dispatchEvent(new Event("change"));
    }
    if (params.model) els34.model.value = params.model;
    if (params.size) syncSizeControlsFromSize2(params.size);
    if (params.n && els34.nInput) {
      els34.nInput.value = String(params.n);
    }
    if (params.quality) els34.quality.value = params.quality;
    if (params.output_format) els34.outputFormat.value = params.output_format;
    if (params.moderation) els34.moderation.value = params.moderation;
    if (params.output_compression !== null && params.output_compression !== void 0) {
      els34.compression.value = params.output_compression;
    }
    [els34.quality, els34.outputFormat, els34.moderation].forEach((element2) => {
      element2.dispatchEvent(new Event("change"));
    });
    updatePromptCount6();
    updateQuantity2();
    syncRadioButtons2(els34.nInput);
    updateCompression2();
    updateCustomSize2();
    updateRequestPreview11();
  }
  function buildPreviewRequest2() {
    const params = currentTaskParams2();
    const uploads = uploadInputs3();
    const galleries = galleryInputs4();
    const assets = referenceAssetInputs3();
    const authSource = currentAuthSource3();
    const isApi = authSource === "api";
    const requestedBackend = backendForAuthSource2(authSource, isApi ? currentApiMode4() : null);
    const payload = {
      mode: state25.mode,
      auth_source: authSource,
      requested_backend: requestedBackend,
      prompt: getPromptText9(),
      prompt_for_model: currentPromptForModel2(),
      model: params.model,
      size: params.size,
      quality: params.quality,
      output_format: params.output_format,
      moderation: params.moderation,
      output_compression: params.output_compression,
      prompt_fidelity: currentPromptFidelity3(),
      n: params.n,
      images: uploads.map((source) => source.name),
      gallery_image_ids: galleries.map((source) => source.id),
      reference_asset_ids: assets.map((source) => source.id)
    };
    if (isApi) {
      const apiMode = currentApiMode4();
      const action = state25.mode === "edit" || uploads.length || assets.length || galleries.length ? "edit" : "generate";
      payload.api_provider_id = currentApiProviderId3();
      payload.api_provider_name = currentApiProviderLabel3();
      payload.webui_api_provider_id = payload.api_provider_id;
      payload.webui_api_provider_name = payload.api_provider_name;
      payload.api_mode = apiMode;
      payload.api_images_concurrency = currentApiImagesConcurrency2();
      if (apiMode === "responses") {
        payload.endpoint = "/responses";
        payload.model = params.main_model;
        payload.tools = [{
          type: "image_generation",
          action,
          model: params.model,
          size: params.size,
          quality: params.quality,
          output_format: params.output_format,
          moderation: params.moderation
        }];
        if (params.output_compression !== null && params.output_compression !== void 0) {
          payload.tools[0].output_compression = params.output_compression;
        }
      } else {
        payload.endpoint = action === "edit" ? "/images/edits" : "/images/generations";
      }
    } else {
      payload.main_model = params.main_model;
    }
    return payload;
  }
  function createPendingTask() {
    const taskId = `pending-${Date.now()}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const localInputFiles = state25.images.slice();
    const previewSource = localInputFiles[0];
    const request = buildPreviewRequest2();
    return {
      task_id: taskId,
      local_pending: true,
      created_at: now,
      updated_at: now,
      started_at: now,
      mode: state25.mode,
      status: "submitting",
      prompt: getPromptText9(),
      prompt_for_model: currentPromptForModel2(),
      requested_backend: request.requested_backend,
      api_provider_id: request.api_provider_id,
      api_provider_name: request.api_provider_name,
      params: currentTaskParams2(),
      input_files: localInputFiles.filter((source) => source.kind === "upload").map((source) => source.name),
      gallery_refs: localInputFiles.filter((source) => source.kind === "gallery"),
      input_sources: localInputFiles,
      local_input_files: localInputFiles,
      preview_url: sourcePreviewUrl3(previewSource),
      request
    };
  }
  function addQueuedTask(task) {
    replacePendingTask2(state25.pendingTaskId || task.task_id, task);
  }
  async function runTask() {
    syncPromptFromEditor6();
    syncGalleryInputsFromPrompt3();
    const prompt = getPromptText9();
    const promptForModel = currentPromptForModel2();
    const uploads = uploadInputs3();
    const galleries = galleryInputs4();
    const assets = referenceAssetInputs3();
    if (missingGalleryInputs2().length) {
      setStatus18("\u6709\u56FE\u5E93\u53C2\u8003\u56FE\u5DF2\u5220\u9664\uFF0C\u8BF7\u79FB\u9664\u540E\u518D\u751F\u6210", "error");
      return;
    }
    if (missingReferenceAssetInputs2().length) {
      setStatus18("\u6709\u6700\u8FD1\u4E0A\u4F20\u53C2\u8003\u56FE\u5DF2\u5220\u9664\uFF0C\u8BF7\u79FB\u9664\u540E\u518D\u751F\u6210", "error");
      return;
    }
    if (!prompt) {
      setStatus18("\u8BF7\u8F93\u5165\u63D0\u793A\u8BCD", "error");
      return;
    }
    if (state25.mode === "edit" && !uploads.length && !assets.length && !galleries.length) {
      setStatus18("\u7F16\u8F91\u6A21\u5F0F\u81F3\u5C11\u9700\u8981 1 \u5F20\u56FE\u7247", "error");
      return;
    }
    const customSizeError = els34.size?.value === "custom" ? customSizeValidationMessage2() : "";
    if (customSizeError) {
      updateCustomSize2();
      updatePixelPreview2("custom");
      setStatus18(customSizeError, "error");
      return;
    }
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("prompt_for_model", promptForModel);
    const params = currentTaskParams2();
    form.append("main_model", currentMainModel2());
    form.append("model", params.model);
    form.append("size", params.size);
    form.append("quality", params.quality);
    form.append("output_format", params.output_format);
    form.append("moderation", params.moderation);
    form.append("n", String(params.n));
    form.append("prompt_fidelity", currentPromptFidelity3());
    if (currentAuthSource3() === "api") {
      form.append("api_provider_id", currentApiProviderId3());
      form.append("api_mode", currentApiMode4());
    }
    if (els34.outputFormat.value !== "png") {
      form.append("output_compression", String(params.output_compression));
    }
    galleries.forEach((source) => form.append("gallery_image_ids", source.id));
    assets.forEach((source) => form.append("reference_asset_ids", source.id));
    if (state25.mode === "generate") {
      uploads.forEach((source) => form.append("reference_images", source.file));
    } else {
      uploads.forEach((source) => form.append("images", source.file));
    }
    const pendingTask = createPendingTask();
    addPendingTask2(pendingTask);
    if (els34.requestJson) {
      els34.requestJson.textContent = JSON.stringify(pendingTask.request, null, 2);
    }
    startRunFeedback2(pendingTask, "\u63D0\u4EA4\u4E2D");
    els34.runButton.disabled = true;
    const controller = new AbortController();
    const submitTimeoutId = window.setTimeout(() => controller.abort(), SUBMIT_TASK_TIMEOUT_MS);
    try {
      const response = await fetch(state25.mode === "edit" ? "/api/edit" : "/api/generate", {
        method: "POST",
        body: form,
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "\u8BF7\u6C42\u5931\u8D25");
      }
      addQueuedTask(data.task);
      if (els34.requestJson) {
        els34.requestJson.textContent = JSON.stringify(data.request || {}, null, 2);
      }
      stopRunFeedback2();
      setStatus18("\u4EFB\u52A1\u5DF2\u52A0\u5165\u961F\u5217", "ok");
      await window.refreshQueue?.();
      await refreshRecentAssets2();
      renderPreview4(data.task);
    } catch (error) {
      stopRunFeedback2();
      const message = error instanceof DOMException && error.name === "AbortError" ? "\u63D0\u4EA4\u4EFB\u52A1\u8D85\u65F6\uFF0C\u540E\u7AEF\u6CA1\u6709\u53CA\u65F6\u8FD4\u56DE\u3002\u8BF7\u5237\u65B0\u961F\u5217\u540E\u786E\u8BA4\u662F\u5426\u5DF2\u5165\u961F\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u8BD5\u3002" : errorMessage4(error, "\u4EFB\u52A1\u63D0\u4EA4\u5931\u8D25");
      markPendingTaskFailed2(pendingTask.task_id, message);
      setStatus18(message, "error");
    } finally {
      window.clearTimeout(submitTimeoutId);
      stopRunFeedback2();
      els34.runButton.disabled = !state25.authAvailable;
    }
  }
  function initTaskSubmitFeature() {
    Object.assign(getLegacyBridge().methods, {
      applyTaskToForm,
      buildPreviewRequest: buildPreviewRequest2,
      createPendingTask,
      addQueuedTask,
      runTask
    });
  }

  // codex_image/webui/frontend/src/task-list-controls.ts
  var bridge32 = getLegacyBridge();
  var state26 = bridge32.state;
  var els35 = bridge32.els;
  function legacyMethod36(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var renderTasks6 = () => legacyMethod36("renderTasks");
  var setExpandedTaskGroupKey2 = (...args) => legacyMethod36("setExpandedTaskGroupKey", ...args);
  var scrollExpandedTaskGroupToTop3 = (...args) => legacyMethod36("scrollExpandedTaskGroupToTop", ...args);
  var captureTaskHistoryLayout3 = (...args) => legacyMethod36("captureTaskHistoryLayout", ...args);
  var animateTaskHistoryLayout3 = (...args) => legacyMethod36("animateTaskHistoryLayout", ...args);
  var archiveTask2 = (...args) => legacyMethod36("archiveTask", ...args);
  var openTaskDeleteConfirm3 = (...args) => legacyMethod36("openTaskDeleteConfirm", ...args);
  var toggleBatchMode2 = (...args) => legacyMethod36("toggleBatchMode", ...args);
  var toggleBatchTaskSelection2 = (...args) => legacyMethod36("toggleBatchTaskSelection", ...args);
  var archiveSelectedTasks2 = (...args) => legacyMethod36("archiveSelectedTasks", ...args);
  var openBatchDeleteConfirm2 = (...args) => legacyMethod36("openBatchDeleteConfirm", ...args);
  var handleTaskListPointerDown2 = (...args) => legacyMethod36("handleTaskListPointerDown", ...args);
  var openArchiveModal2 = (...args) => legacyMethod36("openArchiveModal", ...args);
  var closeArchiveModal2 = (...args) => legacyMethod36("closeArchiveModal", ...args);
  var taskListControlsInitialized = false;
  var taskListControlEventsBound = false;
  function bindTaskListControlEvents() {
    if (taskListControlEventsBound) return;
    taskListControlEventsBound = true;
    els35.archiveButton?.addEventListener("click", openArchiveModal2);
    els35.archiveModalClose?.addEventListener("click", closeArchiveModal2);
    els35.archiveModal?.addEventListener("click", (event) => {
      if (event.target === els35.archiveModal) closeArchiveModal2();
    });
    els35.batchManageButton?.addEventListener("click", () => toggleBatchMode2());
    els35.batchArchiveButton?.addEventListener("click", archiveSelectedTasks2);
    els35.batchDeleteButton?.addEventListener("click", openBatchDeleteConfirm2);
    els35.batchCancelButton?.addEventListener("click", () => toggleBatchMode2(false));
    els35.taskSearch.addEventListener("input", renderTasks6);
    [els35.taskRatioFilter, els35.taskOrientationFilter, els35.taskPromptFidelityFilter, els35.taskResolutionFilter].filter(Boolean).forEach((element2) => {
      element2.addEventListener("change", renderTasks6);
    });
    bindTaskListEvents();
  }
  function bindTaskListEvents() {
    const interactiveRoot = els35.taskHistoryShell || els35.sidebarContent || els35.taskList;
    interactiveRoot?.addEventListener("click", handleTaskListClick);
    interactiveRoot?.addEventListener("keydown", handleTaskListKeydown);
    els35.taskList?.addEventListener("pointerdown", handleTaskListPointerDown2);
  }
  function taskHistoryInteractiveRoot() {
    return els35.taskHistoryShell || els35.sidebarContent || els35.taskList;
  }
  function commitExpandedTaskGroupKey(nextKey, behavior = null) {
    const previousLayout = captureTaskHistoryLayout3();
    const changed = nextKey === null ? setExpandedTaskGroupKey2(null, { immediate: true }) : setExpandedTaskGroupKey2(nextKey, { immediate: true });
    if (changed) {
      renderTasks6();
      animateTaskHistoryLayout3(previousLayout);
    }
    if (nextKey && behavior) {
      scrollExpandedTaskGroupToTop3(behavior);
    }
  }
  function collapseExpandedTaskGroup(nextKey) {
    commitExpandedTaskGroupKey(nextKey);
  }
  function handleTaskListClick(event) {
    if (state26.suppressTaskClickAfterDrag) {
      state26.suppressTaskClickAfterDrag = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const toggleButton = event.target.closest("[data-task-group-toggle-key]");
    if (toggleButton) {
      event.stopPropagation();
      const key = String(toggleButton.dataset.taskGroupToggleKey || "");
      if (toggleButton.classList.contains("task-group-header-split")) {
        collapseExpandedTaskGroup(null);
      } else {
        commitExpandedTaskGroupKey(key, "auto");
      }
      return;
    }
    const archiveButton = event.target.closest("[data-archive-task-id]");
    if (archiveButton) {
      event.stopPropagation();
      archiveTask2(archiveButton.dataset.archiveTaskId);
      return;
    }
    const batchButton = event.target.closest("[data-batch-select-task-id]");
    if (batchButton) {
      event.stopPropagation();
      toggleBatchTaskSelection2(batchButton.dataset.batchSelectTaskId);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-task-id]");
    if (deleteButton) {
      event.stopPropagation();
      openTaskDeleteConfirm3(deleteButton, deleteButton.dataset.deleteTaskId);
      return;
    }
    const card = event.target.closest(".task-card[data-task-id]");
    const root = taskHistoryInteractiveRoot();
    if (!card || !root?.contains(card)) return;
    if (state26.batchMode) {
      toggleBatchTaskSelection2(card.dataset.taskId);
      return;
    }
    legacyMethod36("selectTask", card.dataset.taskId);
  }
  function handleTaskListKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".task-card[data-task-id]");
    const root = taskHistoryInteractiveRoot();
    if (!card || !root?.contains(card) || event.target.closest("button")) return;
    event.preventDefault();
    if (state26.batchMode) {
      toggleBatchTaskSelection2(card.dataset.taskId);
    } else {
      legacyMethod36("selectTask", card.dataset.taskId);
    }
  }
  function initTaskListControlsFeature() {
    if (taskListControlsInitialized) return;
    taskListControlsInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      bindTaskListControlEvents,
      bindTaskListEvents,
      handleTaskListClick,
      handleTaskListKeydown
    });
  }

  // codex_image/webui/frontend/src/queue.ts
  var REALTIME_EVENTS_URL = "/api/events?stream=1";
  var QUEUE_DISPATCH_RESYNC_DELAY_MS = 1500;
  var queueFeatureInitialized = false;
  function initializeQueueFeature() {
    if (queueFeatureInitialized) return;
    queueFeatureInitialized = true;
    exposeQueueWindowApi();
    bindQueueControls();
  }
  function exposeQueueWindowApi() {
    window.startRealtimeUpdates = startRealtimeUpdates;
    window.closeRealtimeUpdates = closeRealtimeUpdates;
    window.refreshQueue = refreshQueue;
    window.applyQueueState = applyQueueState;
    window.applyQueueTasks = applyQueueTasks;
    window.updateQueueElapsedDisplays = updateQueueElapsedDisplays;
  }
  function bindQueueControls() {
    const els43 = getEls();
    els43.queueButton?.addEventListener("click", jumpToActiveTaskGroup);
  }
  function startRealtimeUpdates({ migrateLegacyArchives = false } = {}) {
    const state33 = getState();
    if (!window.EventSource) return false;
    closeRealtimeUpdates();
    state33.realtimeSnapshotNeedsArchiveMigration = migrateLegacyArchives;
    const source = new EventSource(REALTIME_EVENTS_URL);
    state33.realtimeSource = source;
    source.onmessage = (event) => {
      handleRealtimeMessage(event).catch((error) => {
        console.error(error);
        getLegacyBridge().methods.setStatus(errorMessage5(error, "\u5B9E\u65F6\u72B6\u6001\u66F4\u65B0\u5931\u8D25"), "error");
      });
    };
    source.onerror = () => {
      if (state33.realtimeSource !== source) return;
      const shouldMigrateArchives = state33.realtimeSnapshotNeedsArchiveMigration;
      closeRealtimeUpdates();
      state33.realtimeSnapshotNeedsArchiveMigration = false;
      void refreshQueue();
      void getLegacyBridge().methods.refreshTasks({ migrateLegacyArchives: shouldMigrateArchives });
      getLegacyBridge().methods.setStatus("\u5B9E\u65F6\u72B6\u6001\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u5237\u65B0\u9875\u9762\u53EF\u6062\u590D", "error");
    };
    return true;
  }
  function closeRealtimeUpdates() {
    const state33 = getState();
    if (!state33.realtimeSource) return;
    state33.realtimeSource.close();
    state33.realtimeSource = null;
  }
  async function handleRealtimeMessage(event) {
    if (!event.data) return;
    const payload = JSON.parse(String(event.data));
    await handleRealtimePayload(payload);
  }
  async function handleRealtimePayload(payload) {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    if (payload?.type === "snapshot") {
      applyQueueState(payload.queue);
      await bridge40.methods.applyTasksSnapshot(payload.tasks || [], {
        migrateLegacyArchives: state33.realtimeSnapshotNeedsArchiveMigration
      });
      state33.realtimeSnapshotNeedsArchiveMigration = false;
      return;
    }
    if (payload?.type === "queue") {
      applyQueueState(payload.queue);
      applyQueueTasks(payload.queue);
      return;
    }
    if (payload?.type === "task") {
      const previousTask = state33.tasks.find((item) => String(item.task_id) === String(payload.task?.task_id));
      bridge40.methods.notifyTaskUpdate?.(previousTask, payload.task);
      bridge40.methods.applyTaskUpdate(payload.task);
    }
  }
  async function refreshQueue() {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    const requestSeq = ++state33.queueRequestSeq;
    try {
      const response = await fetch("/api/queue");
      const data = await response.json();
      if (requestSeq !== state33.queueRequestSeq) return;
      if (!response.ok) {
        throw new Error(data.detail || "\u961F\u5217\u8BFB\u53D6\u5931\u8D25");
      }
      state33.queue = normalizeQueueState(data);
      renderQueue();
    } catch (error) {
      bridge40.methods.setStatus(errorMessage5(error, "\u961F\u5217\u8BFB\u53D6\u5931\u8D25"), "error");
    }
  }
  function defaultQueueState() {
    return { waiting: [], running: [], summary: { waiting_count: 0, running_count: 0, channel_count: 0 } };
  }
  function normalizeQueueState(queue) {
    const fallback = defaultQueueState();
    return {
      waiting: Array.isArray(queue?.waiting) ? queue.waiting : fallback.waiting,
      running: Array.isArray(queue?.running) ? queue.running : fallback.running,
      summary: queue?.summary || fallback.summary
    };
  }
  function invalidateQueueRequests() {
    getState().queueRequestSeq += 1;
  }
  function applyQueueState(queue) {
    const state33 = getState();
    invalidateQueueRequests();
    state33.queue = normalizeQueueState(queue);
    renderQueue();
  }
  function renderQueue() {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    const summary = state33.queue.summary || {};
    const waitingCount = Number(summary.waiting_count ?? state33.queue.waiting.length ?? 0);
    const runningCount = Number(summary.running_count ?? state33.queue.running.length ?? 0);
    const channelCount = Number(summary.channel_count ?? 0);
    const usableChannelCount = Number(summary.usable_channel_count ?? channelCount);
    const dispatchPending = isQueueDispatchPending();
    renderQueueStatusChip({
      waitingCount,
      runningCount,
      channelCount,
      usableChannelCount,
      dispatchPending
    });
    bridge40.methods.updateDocumentTitle();
    if (dispatchPending) {
      scheduleQueueDispatchSync();
    } else {
      clearQueueDispatchSync();
    }
    const nextRenderKey = queueListRenderKey();
    if (state33.queueRenderKey === nextRenderKey) {
      updateQueueElapsedDisplays();
      return;
    }
    state33.queueRenderKey = nextRenderKey;
    renderActiveTaskGroupForQueueChange();
  }
  function renderActiveTaskGroupForQueueChange() {
    const bridge40 = getLegacyBridge();
    bridge40.methods.renderTasks?.();
  }
  function renderQueueStatusChip({
    waitingCount,
    runningCount,
    channelCount,
    usableChannelCount,
    dispatchPending
  }) {
    const els43 = getEls();
    const total = waitingCount + runningCount;
    const channelText = usableChannelCount === channelCount ? `\u901A\u9053 ${channelCount}` : `\u53EF\u7528\u901A\u9053 ${usableChannelCount}/${channelCount}`;
    const text = dispatchPending ? `\u8C03\u5EA6\u4E2D \xB7 \u7B49\u5F85 ${waitingCount}` : total ? `\u8FD0\u884C ${runningCount} \xB7 \u7B49\u5F85 ${waitingCount}` : "\u6682\u65E0\u6392\u961F";
    const label = total ? `\u961F\u5217\u72B6\u6001\uFF1A${text} \xB7 ${channelText}\u3002\u70B9\u51FB\u8DF3\u8F6C\u5230\u8FDB\u884C\u4E2D\u4EFB\u52A1` : "\u961F\u5217\u72B6\u6001\uFF1A\u6682\u65E0\u6392\u961F";
    if (els43.queueStatusText) els43.queueStatusText.textContent = text;
    if (els43.queueButton) {
      els43.queueButton.setAttribute("aria-label", label);
      els43.queueButton.title = total ? "\u8DF3\u8F6C\u5230\u8FDB\u884C\u4E2D\u4EFB\u52A1" : "\u6682\u65E0\u6392\u961F\u4EFB\u52A1";
      els43.queueButton.classList.toggle("has-queue", total > 0 || dispatchPending);
    }
  }
  function jumpToActiveTaskGroup() {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    const hasActiveTasks = Boolean((state33.queue.running || []).length || (state33.queue.waiting || []).length);
    if (!hasActiveTasks) return;
    bridge40.methods.revealActiveTaskGroup?.();
  }
  function isQueueDispatchPending() {
    const state33 = getState();
    const summary = state33.queue.summary || {};
    const waitingCount = Number(summary.waiting_count ?? state33.queue.waiting.length ?? 0);
    const runningCount = Number(summary.running_count ?? state33.queue.running.length ?? 0);
    const channelCount = Number(summary.channel_count ?? 0);
    const usableChannelCount = Number(summary.usable_channel_count ?? channelCount);
    return waitingCount > 0 && runningCount === 0 && usableChannelCount > 0;
  }
  function scheduleQueueDispatchSync() {
    const state33 = getState();
    if (state33.queueDispatchSyncTimerId) return;
    state33.queueDispatchSyncTimerId = window.setTimeout(() => {
      state33.queueDispatchSyncTimerId = null;
      if (isQueueDispatchPending()) {
        void refreshQueue();
      }
    }, QUEUE_DISPATCH_RESYNC_DELAY_MS);
  }
  function clearQueueDispatchSync() {
    const state33 = getState();
    if (!state33.queueDispatchSyncTimerId) return;
    window.clearTimeout(state33.queueDispatchSyncTimerId);
    state33.queueDispatchSyncTimerId = null;
  }
  function queueListRenderKey() {
    const state33 = getState();
    return JSON.stringify({
      summary: state33.queue.summary || {},
      running: (state33.queue.running || []).map((task) => [
        task.task_id,
        task.status,
        task.viewed_at,
        task.prompt,
        task.channel_id,
        task.account_id,
        task.started_at,
        task.attempts
      ]),
      waiting: (state33.queue.waiting || []).map((task) => [
        task.task_id,
        task.status,
        task.prompt,
        task.params?.size,
        task.queue_position
      ])
    });
  }
  function queueItemTitleText(task, position = null) {
    const bridge40 = getLegacyBridge();
    const queueTask = task;
    const prefix = position ? `#${position}` : bridge40.methods.formatTaskStatus(task) || "\u4EFB\u52A1";
    const mode = taskModeLabel(task);
    const count = `${bridge40.methods.taskTotalCount(task)} \u5F20`;
    const size = queueTask.output_size || task.params?.size || "";
    return [prefix, mode, count, size].filter(Boolean).join(" \xB7 ");
  }
  function taskModeLabel(task) {
    if (task.mode === "edit") return "\u7F16\u8F91";
    if (task.mode === "generate") return "\u751F\u6210";
    return "";
  }
  async function promoteQueueTask(taskId) {
    const bridge40 = getLegacyBridge();
    if (!taskId) return;
    invalidateQueueRequests();
    try {
      const response = await fetch(`/api/queue/${encodeURIComponent(taskId)}/promote`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u7F6E\u9876\u5931\u8D25");
      applyQueueState(data);
      await bridge40.methods.refreshTasks();
    } catch (error) {
      bridge40.methods.setStatus(errorMessage5(error, "\u7F6E\u9876\u5931\u8D25"), "error");
    }
  }
  function moveQueueTask(taskId, direction) {
    if (!taskId) return;
    const ids = (getState().queue.waiting || []).map((task) => task.task_id);
    const currentIndex = ids.indexOf(taskId);
    if (currentIndex < 0) return;
    const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const nextIndex = currentIndex + offset;
    if (offset === 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const nextIds = ids.slice();
    const [moved] = nextIds.splice(currentIndex, 1);
    if (!moved) return;
    nextIds.splice(nextIndex, 0, moved);
    void reorderQueue(nextIds);
  }
  function deleteQueuedTask(button, taskId) {
    const bridge40 = getLegacyBridge();
    if (!taskId) return;
    const task = bridge40.state.queue.waiting.find((item) => item.task_id === taskId);
    const title = task ? queueItemTitleText(task, task.queue_position || null) : taskId;
    bridge40.methods.openConfirmPopover(button, {
      title: "\u5220\u9664\u7B49\u5F85\u4EFB\u52A1\uFF1F",
      message: "\u4F1A\u4ECE\u961F\u5217\u548C\u5386\u53F2\u5217\u8868\u4E2D\u79FB\u9664\u3002",
      detail: title,
      confirmText: "\u5220\u9664",
      onConfirm: async () => {
        await performDeleteQueuedTask(taskId);
      }
    });
  }
  async function performDeleteQueuedTask(taskId) {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    invalidateQueueRequests();
    try {
      const response = await fetch(`/api/queue/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u5220\u9664\u961F\u5217\u4EFB\u52A1\u5931\u8D25");
      state33.tasks = state33.tasks.filter((item) => item.task_id !== taskId);
      if (state33.selectedTaskId === taskId) {
        state33.selectedTaskId = state33.tasks[0]?.task_id || null;
      }
      applyQueueState({
        ...state33.queue,
        waiting: state33.queue.waiting.filter((item) => item.task_id !== taskId),
        summary: {
          ...state33.queue.summary || {},
          waiting_count: Math.max(0, Number(state33.queue.summary?.waiting_count || 0) - 1)
        }
      });
      await refreshQueue();
      await bridge40.methods.refreshTasks();
      bridge40.methods.renderPreview();
      bridge40.methods.setStatus("\u961F\u5217\u4EFB\u52A1\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      bridge40.methods.setStatus(errorMessage5(error, "\u5220\u9664\u961F\u5217\u4EFB\u52A1\u5931\u8D25"), "error");
    }
  }
  function cancelRunningTask(button, taskId) {
    const bridge40 = getLegacyBridge();
    if (!taskId) return;
    const task = bridge40.state.queue.running.find((item) => item.task_id === taskId);
    const title = task ? queueItemTitleText(task) : taskId;
    bridge40.methods.openConfirmPopover(button, {
      title: "\u53D6\u6D88\u8FD0\u884C\u4EFB\u52A1\uFF1F",
      message: "\u5F53\u524D\u4EFB\u52A1\u4F1A\u505C\u6B62\uFF0C\u5386\u53F2\u8BB0\u5F55\u4F1A\u4FDD\u7559\u3002",
      detail: title,
      confirmText: "\u53D6\u6D88\u4EFB\u52A1",
      onConfirm: async () => {
        await performCancelRunningTask(taskId);
      }
    });
  }
  async function performCancelRunningTask(taskId) {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    invalidateQueueRequests();
    try {
      const response = await fetch(`/api/queue/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u53D6\u6D88\u4EFB\u52A1\u5931\u8D25");
      applyQueueState({
        ...state33.queue,
        running: state33.queue.running.filter((item) => item.task_id !== taskId),
        summary: {
          ...state33.queue.summary || {},
          running_count: Math.max(0, Number(state33.queue.summary?.running_count || 0) - 1)
        }
      });
      await refreshQueue();
      await bridge40.methods.refreshTasks();
      bridge40.methods.renderPreview();
      bridge40.methods.setStatus("\u4EFB\u52A1\u5DF2\u53D6\u6D88", "ok");
    } catch (error) {
      bridge40.methods.setStatus(errorMessage5(error, "\u53D6\u6D88\u4EFB\u52A1\u5931\u8D25"), "error");
    }
  }
  async function reorderQueue(taskIds) {
    const bridge40 = getLegacyBridge();
    invalidateQueueRequests();
    try {
      const response = await fetch(`/api/queue/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: taskIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u961F\u5217\u6392\u5E8F\u5931\u8D25");
      applyQueueState(data);
      await bridge40.methods.refreshTasks();
    } catch (error) {
      bridge40.methods.setStatus(errorMessage5(error, "\u961F\u5217\u6392\u5E8F\u5931\u8D25"), "error");
      await refreshQueue();
    }
  }
  function handleQueueDragStart(event) {
    const target = eventTargetElement(event);
    const item = event.currentTarget instanceof HTMLElement && event.currentTarget.dataset.queueTaskId ? event.currentTarget : target?.closest("[data-queue-task-id]");
    if (!(item instanceof HTMLElement)) return;
    const draggedId = item.dataset.queueTaskId || null;
    getState().queueDragTaskId = draggedId;
    item.classList.add("dragging");
    if (event.dataTransfer && draggedId) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedId);
    }
  }
  function handleQueueDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }
  function handleQueueDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const state33 = getState();
    const draggedId = state33.queueDragTaskId;
    if (!draggedId) return;
    const ids = (state33.queue.waiting || []).map((task) => task.task_id);
    const nextIds = ids.filter((id) => id !== draggedId);
    const targetItem = eventTargetElement(event)?.closest("[data-queue-task-id]");
    const targetId = targetItem instanceof HTMLElement ? targetItem.dataset.queueTaskId : void 0;
    if (targetId === draggedId) return;
    if (!targetId) {
      nextIds.push(draggedId);
      void reorderQueue(nextIds);
      return;
    }
    const targetIndex = nextIds.indexOf(targetId);
    if (targetIndex < 0 || !(targetItem instanceof HTMLElement)) return;
    const targetRect = targetItem.getBoundingClientRect();
    const insertAfter = event.clientY > targetRect.top + targetRect.height / 2;
    nextIds.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, draggedId);
    void reorderQueue(nextIds);
  }
  function handleQueueDragEnd(event) {
    const target = eventTargetElement(event);
    const item = event.currentTarget instanceof HTMLElement && event.currentTarget.dataset.queueTaskId ? event.currentTarget : target?.closest("[data-queue-task-id]");
    item?.classList.remove("dragging");
    getState().queueDragTaskId = null;
  }
  function applyQueueTasks(queue) {
    const bridge40 = getLegacyBridge();
    const tasks = [
      ...Array.isArray(queue?.waiting) ? queue.waiting : [],
      ...Array.isArray(queue?.running) ? queue.running : []
    ];
    const queueTaskIds = new Set(tasks.map((task) => String(task.task_id)));
    if (!tasks.length) {
      if (selectedTaskNeedsQueueReconcile(queueTaskIds)) {
        void bridge40.methods.refreshTasks();
      }
      return;
    }
    let changed = false;
    tasks.forEach((task) => {
      const previousTask = bridge40.state.tasks.find((item) => String(item.task_id) === String(task.task_id));
      bridge40.methods.notifyTaskUpdate?.(previousTask, task);
      changed = bridge40.methods.updateTaskInState(task) || changed;
      if (String(task.task_id) === String(bridge40.state.selectedTaskId) && bridge40.methods.taskHasViewableUpdate(task)) {
        void bridge40.methods.markTaskViewed(task.task_id);
      }
    });
    if (!changed) return;
    bridge40.methods.cleanupSessionSelections();
    bridge40.methods.renderTasks();
    bridge40.methods.renderArchiveButton();
    bridge40.methods.renderArchiveModal();
    bridge40.methods.renderPreview();
    if (selectedTaskNeedsQueueReconcile(queueTaskIds)) {
      void bridge40.methods.refreshTasks();
    }
  }
  function selectedTaskNeedsQueueReconcile(queueTaskIds) {
    const bridge40 = getLegacyBridge();
    const selectedTaskId = String(bridge40.state.selectedTaskId || "");
    if (!selectedTaskId || queueTaskIds.has(selectedTaskId)) return false;
    const selectedTask = bridge40.state.tasks.find((task) => String(task.task_id) === selectedTaskId);
    if (!selectedTask || selectedTask.local_pending) return false;
    const status = String(selectedTask.status || "");
    return ["submitting", "queued", "running"].includes(status);
  }
  function updateQueueElapsedDisplays() {
    getLegacyBridge().methods.updateTaskElapsedDisplays?.();
  }
  function eventTargetElement(event) {
    return event.target instanceof Element ? event.target : null;
  }
  function errorMessage5(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  // codex_image/webui/frontend/src/task-list-queue-controls.ts
  var bridge33 = getLegacyBridge();
  var state27 = bridge33.state;
  var els36 = bridge33.els;
  var taskListQueueControlsInitialized = false;
  var taskListQueueControlsBound = false;
  function eventTargetElement2(event) {
    return event.target instanceof Element ? event.target : null;
  }
  function stopQueueControlEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function stopQueueDragEvent(event) {
    event.stopPropagation();
  }
  function taskListQueueControlRoots() {
    return [els36.taskActiveList, els36.taskList].filter((root) => root instanceof HTMLElement);
  }
  function bindTaskListQueueControls() {
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
  function handleTaskListQueueClick(event) {
    const target = eventTargetElement2(event);
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
  function waitingDropTarget(event) {
    return eventTargetElement2(event)?.closest('[data-active-task-section="waiting"]') || null;
  }
  function handleTaskListQueueDragStart(event) {
    const handle = eventTargetElement2(event)?.closest("[data-task-queue-drag-handle-id]");
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
  function handleTaskListQueueDragOver(event) {
    if (!state27.queueDragTaskId || !waitingDropTarget(event)) return;
    handleQueueDragOver(event);
  }
  function handleTaskListQueueDrop(event) {
    if (!state27.queueDragTaskId || !waitingDropTarget(event)) return;
    handleQueueDrop(event);
  }
  function handleTaskListQueueDragEnd(event) {
    if (!state27.queueDragTaskId) return;
    handleQueueDragEnd(event);
    taskListQueueControlRoots().forEach((root) => {
      root.querySelectorAll(".queue-dragging").forEach((element2) => {
        element2.classList.remove("queue-dragging");
      });
    });
  }
  function initTaskListQueueControlsFeature() {
    if (taskListQueueControlsInitialized) return;
    taskListQueueControlsInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      bindTaskListQueueControls,
      handleTaskListQueueClick,
      handleTaskListQueueDragStart,
      handleTaskListQueueDragOver,
      handleTaskListQueueDrop,
      handleTaskListQueueDragEnd
    });
    bindTaskListQueueControls();
  }

  // codex_image/webui/frontend/src/task-context-menu.ts
  var bridge34 = getLegacyBridge();
  var state28 = bridge34.state;
  var els37 = bridge34.els;
  var taskContextMenuInitialized = false;
  var taskContextMenuEventsBound = false;
  var taskContextMenuEl = null;
  var taskListMutationObserver = null;
  function legacyMethod37(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function escapeHtml17(...args) {
    return legacyMethod37("escapeHtml", ...args);
  }
  function setStatus19(...args) {
    return legacyMethod37("setStatus", ...args);
  }
  function closePromptPopover6(...args) {
    return legacyMethod37("closePromptPopover", ...args);
  }
  function selectTask(...args) {
    return legacyMethod37("selectTask", ...args);
  }
  function applyTaskToForm2(...args) {
    return legacyMethod37("applyTaskToForm", ...args);
  }
  function archiveTask3(...args) {
    return legacyMethod37("archiveTask", ...args);
  }
  function openTaskDeleteConfirm4(...args) {
    return legacyMethod37("openTaskDeleteConfirm", ...args);
  }
  function bindTaskContextMenuEvents() {
    if (taskContextMenuEventsBound) return;
    taskContextMenuEventsBound = true;
    els37.taskList.addEventListener("contextmenu", handleTaskListContextMenu);
    els37.taskList.addEventListener("keydown", handleTaskListContextMenuKeydown);
    document.addEventListener("click", handleTaskContextDocumentClick, true);
    document.addEventListener("keydown", handleTaskContextDocumentKeydown);
    document.addEventListener("scroll", closeTaskContextMenu, true);
    window.addEventListener("resize", closeTaskContextMenu);
    if ("MutationObserver" in window) {
      taskListMutationObserver = new MutationObserver(closeTaskContextMenu);
      taskListMutationObserver.observe(els37.taskList, { childList: true });
    }
  }
  function handleTaskListContextMenu(event) {
    const target = eventTargetElement3(event);
    const card = target?.closest(".task-card[data-task-id]");
    if (!card || !els37.taskList.contains(card)) return;
    event.preventDefault();
    event.stopPropagation();
    openTaskContextMenu(card, event.clientX, event.clientY);
  }
  function handleTaskListContextMenuKeydown(event) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    const target = eventTargetElement3(event);
    const card = target?.closest(".task-card[data-task-id]");
    if (!card || !els37.taskList.contains(card)) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    openTaskContextMenu(card, rect.left + 18, rect.top + 18);
  }
  function handleTaskContextDocumentClick(event) {
    if (!taskContextMenuEl || taskContextMenuEl.classList.contains("hidden")) return;
    const target = eventTargetElement3(event);
    if (target && taskContextMenuEl.contains(target)) return;
    closeTaskContextMenu();
  }
  function handleTaskContextDocumentKeydown(event) {
    if (event.key === "Escape") closeTaskContextMenu();
  }
  function openTaskContextMenu(card, clientX, clientY) {
    const taskId = String(card.dataset.taskId || "");
    const task = taskById(taskId);
    if (!task) return;
    closePromptPopover6();
    const menu = ensureTaskContextMenu();
    menu.dataset.taskContextTaskId = taskId;
    menu.innerHTML = taskContextMenuHtml(task);
    menu.classList.remove("hidden");
    bindTaskContextMenuActionEvents(menu);
    positionTaskContextMenu(menu, clientX, clientY);
    const firstButton = menu.querySelector(".task-context-menu-button:not(:disabled)");
    firstButton?.focus({ preventScroll: true });
  }
  function closeTaskContextMenu() {
    if (!taskContextMenuEl) return;
    taskContextMenuEl.classList.add("hidden");
    taskContextMenuEl.removeAttribute("data-task-context-task-id");
  }
  function ensureTaskContextMenu() {
    if (taskContextMenuEl) return taskContextMenuEl;
    taskContextMenuEl = document.createElement("div");
    taskContextMenuEl.className = "task-context-menu hidden";
    taskContextMenuEl.setAttribute("role", "menu");
    taskContextMenuEl.setAttribute("aria-label", "\u4EFB\u52A1\u53F3\u952E\u83DC\u5355");
    document.body.appendChild(taskContextMenuEl);
    return taskContextMenuEl;
  }
  function taskContextMenuHtml(task) {
    const hasOutput = taskHasOutput(task);
    const blocked = Boolean(task.local_pending || task.status === "running" || task.status === "submitting" || task.status === "queued");
    return `
    <div class="task-context-menu-section">
      ${taskContextButton("view", "\u67E5\u770B\u4EFB\u52A1")}
      ${taskContextButton("restore", "\u6062\u590D\u5230\u8868\u5355")}
    </div>
    <div class="task-context-menu-section">
      ${taskContextButton("copy-id", "\u590D\u5236\u4EFB\u52A1 ID")}
      ${taskContextButton("copy-prompt", "\u590D\u5236\u63D0\u793A\u8BCD", !taskPromptText(task))}
      ${taskContextButton("reveal-output", "\u6253\u5F00\u8F93\u51FA\u76EE\u5F55", !hasOutput)}
    </div>
    <div class="task-context-menu-section">
      ${taskContextButton("archive", "\u5F52\u6863\u4EFB\u52A1")}
      ${taskContextButton("delete", "\u5220\u9664\u4EFB\u52A1", blocked, true)}
    </div>
  `;
  }
  function taskContextButton(action, label, disabled = false, danger = false) {
    const disabledAttr = disabled ? " disabled" : "";
    const dangerClass = danger ? " danger" : "";
    return `<button class="task-context-menu-button${dangerClass}" type="button" role="menuitem" data-task-context-action="${action}"${disabledAttr}>${escapeHtml17(label)}</button>`;
  }
  function bindTaskContextMenuActionEvents(menu) {
    menu.querySelectorAll("[data-task-context-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        void handleTaskContextMenuAction(button);
      });
    });
  }
  async function handleTaskContextMenuAction(button) {
    const action = String(button.dataset.taskContextAction || "");
    const taskId = String(taskContextMenuEl?.dataset.taskContextTaskId || "");
    const task = taskById(taskId);
    if (!task) {
      closeTaskContextMenu();
      return;
    }
    if (action === "delete") {
      openTaskDeleteConfirm4(button, taskId);
      closeTaskContextMenu();
      return;
    }
    closeTaskContextMenu();
    try {
      if (action === "view") {
        await selectTask(taskId);
      } else if (action === "restore") {
        applyTaskToForm2(task);
        setStatus19("\u5DF2\u6062\u590D\u4EFB\u52A1\u53C2\u6570", "ok");
      } else if (action === "copy-id") {
        await copyText(taskId);
        setStatus19("\u4EFB\u52A1 ID \u5DF2\u590D\u5236", "ok");
      } else if (action === "copy-prompt") {
        await copyText(taskPromptText(task));
        setStatus19("\u63D0\u793A\u8BCD\u5DF2\u590D\u5236", "ok");
      } else if (action === "reveal-output") {
        await revealTaskOutputDirectory(taskId);
      } else if (action === "archive") {
        await archiveTask3(taskId);
      }
    } catch (error) {
      setStatus19(errorMessage6(error, "\u4EFB\u52A1\u64CD\u4F5C\u5931\u8D25"), "error");
    }
  }
  async function revealTaskOutputDirectory(taskId) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/reveal-output`, {
      method: "POST",
      headers: { "X-Requested-With": "codex-image-webui" }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "\u6253\u5F00\u8F93\u51FA\u76EE\u5F55\u5931\u8D25");
    setStatus19("\u5DF2\u6253\u5F00\u8F93\u51FA\u76EE\u5F55", "ok");
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  function taskById(taskId) {
    return state28.tasks.find((item) => String(item.task_id) === String(taskId));
  }
  function taskPromptText(task) {
    return String(task?.prompt || task?.prompt_for_model || "").trim();
  }
  function taskHasOutput(task) {
    if (task?.output_url) return true;
    if (Array.isArray(task?.output_urls) && task.output_urls.length) return true;
    if (Array.isArray(task?.output_files) && task.output_files.length) return true;
    if (!Array.isArray(task?.outputs)) return false;
    return task.outputs.some((record) => record?.status === "completed" && (record.url || record.file));
  }
  function positionTaskContextMenu(menu, clientX, clientY) {
    const margin = 8;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = clamp2(clientX, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = clamp2(clientY, margin, Math.max(margin, window.innerHeight - height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function clamp2(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function eventTargetElement3(event) {
    return event.target instanceof Element ? event.target : null;
  }
  function errorMessage6(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  function initTaskContextMenuFeature() {
    if (taskContextMenuInitialized) return;
    taskContextMenuInitialized = true;
    bindTaskContextMenuEvents();
    Object.assign(getLegacyBridge().methods, {
      openTaskContextMenu,
      closeTaskContextMenu
    });
  }

  // codex_image/webui/frontend/src/task-notifications.ts
  var TASK_NOTIFICATION_SETTINGS_KEY = "codex-image-task-notification-settings";
  var TASK_NOTIFICATION_SEEN_KEY = "codex-image-task-notification-seen";
  var MAX_TASK_NOTIFICATIONS = 30;
  var MAX_SEEN_TASK_NOTIFICATION_KEYS = 400;
  var TASK_NOTIFICATION_TOAST_MS = 5200;
  var taskNotificationsFeatureInitialized = false;
  function initTaskNotificationsFeature() {
    if (taskNotificationsFeatureInitialized) return;
    taskNotificationsFeatureInitialized = true;
    restoreTaskNotificationSettings();
    restoreTaskNotificationSeenKeys();
    bindTaskNotificationEvents();
    renderTaskNotifications();
    Object.assign(getLegacyBridge().methods, {
      notifyTaskUpdate,
      openTaskNotificationCenter,
      renderTaskNotifications,
      requestSystemNotificationPermission
    });
  }
  function notifyTaskUpdate(previousTask, nextTask) {
    const status = terminalTaskStatus(nextTask?.status);
    if (!nextTask || !status || !shouldNotifyTerminalTask(previousTask, nextTask)) return;
    const notification = buildTaskNotification(nextTask, status);
    rememberTaskNotification(nextTask, status);
    if (getLegacyBridge().state.taskNotificationSettings.inApp) {
      addTaskNotification(notification);
      showTaskNotificationToast(notification);
    }
    sendSystemTaskNotification(notification);
  }
  function shouldNotifyTerminalTask(previousTask, nextTask) {
    const status = terminalTaskStatus(nextTask?.status);
    if (!previousTask || !nextTask?.task_id || !status) return false;
    if (terminalTaskStatus(previousTask.status)) return false;
    return !getLegacyBridge().state.taskNotificationSeenKeys.has(taskNotificationSeenKey(nextTask, status));
  }
  function openTaskNotificationCenter() {
    const state33 = getLegacyBridge().state;
    state33.taskNotificationCenterOpen = true;
    state33.taskNotifications = state33.taskNotifications.map((notification) => ({
      ...notification,
      unread: false
    }));
    renderTaskNotifications();
  }
  function closeTaskNotificationCenter() {
    const state33 = getLegacyBridge().state;
    if (!state33.taskNotificationCenterOpen) return;
    state33.taskNotificationCenterOpen = false;
    renderTaskNotifications();
  }
  function toggleTaskNotificationCenter() {
    if (getLegacyBridge().state.taskNotificationCenterOpen) {
      closeTaskNotificationCenter();
      return;
    }
    openTaskNotificationCenter();
  }
  function renderTaskNotifications() {
    const bridge40 = getLegacyBridge();
    const state33 = bridge40.state;
    const els43 = bridge40.els;
    const unreadCount = state33.taskNotifications.filter((notification) => notification.unread).length;
    state33.taskNotificationUnreadCount = unreadCount;
    const unreadLabel = unreadCount > 0 ? `\u4EFB\u52A1\u901A\u77E5\uFF0C${unreadCount} \u6761\u672A\u8BFB` : "\u4EFB\u52A1\u901A\u77E5";
    if (els43.taskNotificationBadge) {
      els43.taskNotificationBadge.textContent = "";
      els43.taskNotificationBadge.setAttribute("aria-hidden", "true");
      els43.taskNotificationBadge.classList.toggle("hidden", unreadCount === 0);
    }
    if (els43.taskNotificationButton) {
      els43.taskNotificationButton.classList.toggle("has-unread", unreadCount > 0);
      els43.taskNotificationButton.setAttribute("aria-label", unreadLabel);
      els43.taskNotificationButton.title = unreadLabel;
      els43.taskNotificationButton.setAttribute("aria-expanded", state33.taskNotificationCenterOpen ? "true" : "false");
    }
    if (els43.taskNotificationUnreadSummary) {
      els43.taskNotificationUnreadSummary.textContent = `${unreadCount} \u672A\u8BFB`;
      els43.taskNotificationUnreadSummary.classList.toggle("hidden", unreadCount === 0);
    }
    if (els43.taskNotificationCenter) {
      els43.taskNotificationCenter.classList.toggle("hidden", !state33.taskNotificationCenterOpen);
      els43.taskNotificationCenter.setAttribute("aria-hidden", state33.taskNotificationCenterOpen ? "false" : "true");
    }
    if (!els43.taskNotificationList) return;
    if (!state33.taskNotifications.length) {
      els43.taskNotificationList.innerHTML = `<div class="task-notification-empty">\u6682\u65E0\u4EFB\u52A1\u901A\u77E5</div>`;
      return;
    }
    els43.taskNotificationList.innerHTML = state33.taskNotifications.map((notification) => taskNotificationItemHtml(notification)).join("");
  }
  async function requestSystemNotificationPermission() {
    if (typeof Notification === "undefined") {
      setStatus20("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u7CFB\u7EDF\u901A\u77E5", "error");
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      setStatus20("\u7CFB\u7EDF\u901A\u77E5\u5DF2\u88AB\u6D4F\u89C8\u5668\u963B\u6B62\uFF0C\u9700\u8981\u5728\u6D4F\u89C8\u5668\u8BBE\u7F6E\u91CC\u5F00\u542F", "error");
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus20("\u7CFB\u7EDF\u901A\u77E5\u672A\u5F00\u542F", "error");
      return false;
    }
    setStatus20("\u7CFB\u7EDF\u901A\u77E5\u5DF2\u5F00\u542F", "ok");
    return true;
  }
  function bindTaskNotificationEvents() {
    const els43 = getLegacyBridge().els;
    els43.taskNotificationButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTaskNotificationCenter();
    });
    els43.taskNotificationClearButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      clearTaskNotifications();
    });
    els43.taskNotificationList?.addEventListener("click", (event) => {
      const item = eventTargetElement4(event)?.closest("[data-task-notification-id]");
      if (!(item instanceof HTMLElement)) return;
      const notification = notificationById(item.dataset.taskNotificationId);
      if (notification) void openNotificationTask(notification);
    });
    els43.taskNotificationInApp?.addEventListener("change", handleTaskNotificationInAppChange);
    els43.taskNotificationSystem?.addEventListener("change", (event) => {
      void handleTaskNotificationSystemChange(event);
    });
    document.addEventListener("click", handleTaskNotificationDocumentClick);
    document.addEventListener("keydown", handleTaskNotificationKeydown);
  }
  function handleTaskNotificationInAppChange(event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const state33 = getLegacyBridge().state;
    state33.taskNotificationSettings = {
      ...state33.taskNotificationSettings,
      inApp: input.checked
    };
    persistTaskNotificationSettings();
  }
  async function handleTaskNotificationSystemChange(event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const state33 = getLegacyBridge().state;
    if (!input.checked) {
      state33.taskNotificationSettings = { ...state33.taskNotificationSettings, system: false };
      persistTaskNotificationSettings();
      return;
    }
    const granted = await requestSystemNotificationPermission();
    state33.taskNotificationSettings = { ...state33.taskNotificationSettings, system: granted };
    input.checked = granted;
    persistTaskNotificationSettings();
  }
  function handleTaskNotificationDocumentClick(event) {
    const target = event.target;
    const els43 = getLegacyBridge().els;
    if (!(target instanceof Node)) return;
    if (els43.taskNotificationCenter?.contains(target) || els43.taskNotificationButton?.contains(target)) return;
    closeTaskNotificationCenter();
  }
  function handleTaskNotificationKeydown(event) {
    if (event.key === "Escape") closeTaskNotificationCenter();
  }
  function addTaskNotification(notification) {
    const state33 = getLegacyBridge().state;
    state33.taskNotifications = [notification, ...state33.taskNotifications].slice(0, MAX_TASK_NOTIFICATIONS);
    renderTaskNotifications();
  }
  function clearTaskNotifications() {
    const state33 = getLegacyBridge().state;
    state33.taskNotifications = [];
    renderTaskNotifications();
  }
  function showTaskNotificationToast(notification) {
    const bridge40 = getLegacyBridge();
    const region = bridge40.els.taskNotificationToastRegion;
    if (!region) return;
    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "task-notification-item task-notification-toast";
    toast.dataset.taskNotificationId = notification.id;
    toast.innerHTML = taskNotificationInnerHtml(notification);
    toast.addEventListener("click", () => {
      toast.remove();
      void openNotificationTask(notification);
    });
    region.prepend(toast);
    const timerId = window.setTimeout(() => {
      toast.remove();
      bridge40.state.taskNotificationToastTimerIds = bridge40.state.taskNotificationToastTimerIds.filter((id) => id !== timerId);
    }, TASK_NOTIFICATION_TOAST_MS);
    bridge40.state.taskNotificationToastTimerIds.push(timerId);
  }
  function sendSystemTaskNotification(notification) {
    const settings = getLegacyBridge().state.taskNotificationSettings;
    if (!settings.system || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const options = { body: notification.message };
    if (notification.thumbnail_url) options.icon = notification.thumbnail_url;
    const systemNotification = new Notification(notification.title, options);
    systemNotification.onclick = () => {
      window.focus();
      void openNotificationTask(notification);
      systemNotification.close();
    };
  }
  async function openNotificationTask(notification) {
    const bridge40 = getLegacyBridge();
    const task = bridge40.state.tasks.find((item) => String(item.task_id) === String(notification.task_id));
    markTaskNotificationRead(notification.id);
    closeTaskNotificationCenter();
    if (!task) {
      setStatus20("\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u5DF2\u5220\u9664", "error");
      return;
    }
    window.focus();
    try {
      const selectTask3 = bridge40.methods.selectTask;
      if (typeof selectTask3 !== "function") throw new Error("selectTask is unavailable");
      await selectTask3(task.task_id);
    } catch {
      setStatus20("\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u5DF2\u5220\u9664", "error");
    }
  }
  function markTaskNotificationRead(notificationId) {
    const state33 = getLegacyBridge().state;
    state33.taskNotifications = state33.taskNotifications.map((notification) => notification.id === notificationId ? { ...notification, unread: false } : notification);
    renderTaskNotifications();
  }
  function notificationById(notificationId) {
    if (!notificationId) return null;
    return getLegacyBridge().state.taskNotifications.find((notification) => notification.id === notificationId) || null;
  }
  function buildTaskNotification(task, status) {
    const thumbnailUrl = firstTaskThumbnailUrl(task);
    return {
      id: taskNotificationSeenKey(task, status),
      task_id: task.task_id,
      status,
      title: taskNotificationTitle(status),
      message: taskNotificationMessage(task, status),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {},
      unread: true
    };
  }
  function taskNotificationTitle(status) {
    if (status === "failed") return "\u4EFB\u52A1\u5931\u8D25";
    if (status === "partial_failed") return "\u4EFB\u52A1\u90E8\u5206\u5B8C\u6210";
    return "\u4EFB\u52A1\u5DF2\u5B8C\u6210";
  }
  function taskNotificationMessage(task, status) {
    if (status === "failed") return String(task.last_error || task.error || "\u751F\u6210\u5931\u8D25");
    const count = completedOutputCount(task);
    const failedCount = positiveNumber(task.failed_count);
    const prompt = promptSnippet(task.prompt || task.prompt_for_model || "");
    const countText = count ? `${count} \u5F20\u6210\u529F` : "\u6709\u7ED3\u679C\u53EF\u67E5\u770B";
    const failureText = status === "partial_failed" && failedCount ? `\uFF0C${failedCount} \u5F20\u5931\u8D25` : "";
    return [countText + failureText, prompt].filter(Boolean).join(" \xB7 ");
  }
  function firstTaskThumbnailUrl(task) {
    const bridge40 = getLegacyBridge();
    const urls = bridge40.methods.taskThumbnailUrls?.(task);
    if (Array.isArray(urls) && urls[0]) return String(urls[0]);
    if (Array.isArray(task.thumbnail_urls) && task.thumbnail_urls[0]) return String(task.thumbnail_urls[0]);
    const output = Array.isArray(task.outputs) ? task.outputs.find((record) => record?.status === "completed") : null;
    if (output?.thumbnail_url) return String(output.thumbnail_url);
    if (output?.thumbnail_file) return outputFileUrl(output.thumbnail_file);
    if (output?.url || output?.file) {
      const index = positiveNumber(output.index) || 1;
      return `/api/tasks/${encodeURIComponent(task.task_id)}/outputs/${index}/thumbnail`;
    }
    if (Array.isArray(task.output_urls) && task.output_urls.some(Boolean)) {
      return `/api/tasks/${encodeURIComponent(task.task_id)}/outputs/1/thumbnail`;
    }
    return void 0;
  }
  function taskNotificationItemHtml(notification) {
    const unreadClass = notification.unread ? " unread" : "";
    return `<button class="task-notification-item${unreadClass}" type="button" data-task-notification-id="${escapeHtml18(notification.id)}">
    ${taskNotificationInnerHtml(notification)}
  </button>`;
  }
  function taskNotificationInnerHtml(notification) {
    const thumbnail = notification.thumbnail_url ? `<img class="task-notification-thumb" src="${escapeHtml18(notification.thumbnail_url)}" alt="">` : `<span class="task-notification-thumb task-notification-thumb-placeholder" aria-hidden="true">${escapeHtml18(statusGlyph(notification.status))}</span>`;
    return `${thumbnail}
    <span class="task-notification-body">
      <span class="task-notification-title">${escapeHtml18(notification.title)}</span>
      <span class="task-notification-message">${escapeHtml18(notification.message)}</span>
      <span class="task-notification-time">${escapeHtml18(formatNotificationTime(notification.created_at))}</span>
    </span>`;
  }
  function statusGlyph(status) {
    if (status === "failed") return "!";
    if (status === "partial_failed") return "~";
    return "\u2713";
  }
  function formatNotificationTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function terminalTaskStatus(status) {
    if (status === "completed" || status === "failed" || status === "partial_failed") return status;
    return null;
  }
  function taskNotificationSeenKey(task, status) {
    const revision = task.completed_at || task.updated_at || task.last_error || task.error || "";
    return `${task.task_id}:${status}:${revision}`;
  }
  function rememberTaskNotification(task, status) {
    const state33 = getLegacyBridge().state;
    state33.taskNotificationSeenKeys.add(taskNotificationSeenKey(task, status));
    while (state33.taskNotificationSeenKeys.size > MAX_SEEN_TASK_NOTIFICATION_KEYS) {
      const firstKey = state33.taskNotificationSeenKeys.values().next().value;
      if (typeof firstKey !== "string") break;
      state33.taskNotificationSeenKeys.delete(firstKey);
    }
    persistTaskNotificationSeenKeys();
  }
  function restoreTaskNotificationSettings() {
    const state33 = getLegacyBridge().state;
    state33.taskNotificationSettings = defaultTaskNotificationSettings();
    try {
      const stored = JSON.parse(localStorage.getItem(TASK_NOTIFICATION_SETTINGS_KEY) || "{}");
      state33.taskNotificationSettings = {
        inApp: stored.inApp !== false,
        system: stored.system === true && typeof Notification !== "undefined" && Notification.permission === "granted"
      };
    } catch {
      state33.taskNotificationSettings = defaultTaskNotificationSettings();
    }
    persistTaskNotificationSettings();
    syncTaskNotificationSettingsInputs();
  }
  function defaultTaskNotificationSettings() {
    return { inApp: true, system: false };
  }
  function persistTaskNotificationSettings() {
    try {
      localStorage.setItem(TASK_NOTIFICATION_SETTINGS_KEY, JSON.stringify(getLegacyBridge().state.taskNotificationSettings));
    } catch {
    }
    syncTaskNotificationSettingsInputs();
  }
  function syncTaskNotificationSettingsInputs() {
    const bridge40 = getLegacyBridge();
    const settings = bridge40.state.taskNotificationSettings;
    if (bridge40.els.taskNotificationInApp instanceof HTMLInputElement) {
      bridge40.els.taskNotificationInApp.checked = settings.inApp;
    }
    if (bridge40.els.taskNotificationSystem instanceof HTMLInputElement) {
      bridge40.els.taskNotificationSystem.checked = settings.system;
    }
  }
  function restoreTaskNotificationSeenKeys() {
    const state33 = getLegacyBridge().state;
    try {
      const stored = JSON.parse(localStorage.getItem(TASK_NOTIFICATION_SEEN_KEY) || "[]");
      state33.taskNotificationSeenKeys = new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
    } catch {
      state33.taskNotificationSeenKeys = /* @__PURE__ */ new Set();
    }
  }
  function persistTaskNotificationSeenKeys() {
    try {
      const keys = Array.from(getLegacyBridge().state.taskNotificationSeenKeys).slice(-MAX_SEEN_TASK_NOTIFICATION_KEYS);
      localStorage.setItem(TASK_NOTIFICATION_SEEN_KEY, JSON.stringify(keys));
    } catch {
    }
  }
  function outputFileUrl(filename) {
    if (filename.startsWith("/outputs/")) return filename;
    const clean = filename.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return clean ? `/outputs/${clean}` : "";
  }
  function completedOutputCount(task) {
    if (Array.isArray(task.outputs)) {
      return task.outputs.filter((record) => record?.status === "completed").length;
    }
    if (Array.isArray(task.output_urls)) return task.output_urls.filter(Boolean).length;
    return positiveNumber(task.generated_count);
  }
  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }
  function promptSnippet(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > 48 ? `${text.slice(0, 48)}...` : text;
  }
  function escapeHtml18(value) {
    return getLegacyBridge().methods.escapeHtml(value);
  }
  function setStatus20(message, type) {
    getLegacyBridge().methods.setStatus(message, type);
  }
  function eventTargetElement4(event) {
    return event.target instanceof Element ? event.target : null;
  }

  // codex_image/webui/frontend/src/task-derived.ts
  var RATIO_ORIENTATION2 = {
    "1:1": "square",
    "4:5": "portrait",
    "5:4": "landscape",
    "3:4": "portrait",
    "4:3": "landscape",
    "2:3": "portrait",
    "3:2": "landscape",
    "9:16": "portrait",
    "16:9": "landscape",
    "9:21": "portrait",
    "21:9": "landscape"
  };
  var GPT_IMAGE_2_SIZE_PRESETS2 = {
    standard: {
      "1:1": [1024, 1024],
      "4:5": [1024, 1280],
      "5:4": [1280, 1024],
      "3:4": [1152, 1536],
      "4:3": [1536, 1152],
      "2:3": [1024, 1536],
      "3:2": [1536, 1024],
      "9:16": [864, 1536],
      "16:9": [1536, 864],
      "9:21": [672, 1568],
      "21:9": [1568, 672]
    },
    "2k": {
      "1:1": [2048, 2048],
      "4:5": [1600, 2e3],
      "5:4": [2e3, 1600],
      "3:4": [1536, 2048],
      "4:3": [2048, 1536],
      "2:3": [1344, 2016],
      "3:2": [2016, 1344],
      "9:16": [1152, 2048],
      "16:9": [2048, 1152],
      "9:21": [1152, 2688],
      "21:9": [2688, 1152]
    },
    "4k": {
      "1:1": [2880, 2880],
      "4:5": [2560, 3200],
      "5:4": [3200, 2560],
      "3:4": [2448, 3264],
      "4:3": [3264, 2448],
      "2:3": [2336, 3504],
      "3:2": [3504, 2336],
      "9:16": [2160, 3840],
      "16:9": [3840, 2160],
      "9:21": [1632, 3808],
      "21:9": [3808, 1632]
    }
  };
  function legacyMethod38(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function escapeHtml19(...args) {
    return legacyMethod38("escapeHtml", ...args);
  }
  function taskRatio2(task) {
    const dimensions = taskSizeDimensions(task);
    if (!dimensions) return "";
    const [width, height] = dimensions;
    for (const ratios of Object.values(GPT_IMAGE_2_SIZE_PRESETS2)) {
      for (const [ratio, presetDimensions2] of Object.entries(ratios)) {
        if (presetDimensions2[0] === width && presetDimensions2[1] === height) return ratio;
      }
    }
    const divisor = greatestCommonDivisor(width, height);
    const normalized = `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
    if (normalized === "3:7") return "9:21";
    if (normalized === "7:3") return "21:9";
    return normalized;
  }
  function taskOrientation2(task) {
    const ratio = taskRatio2(task);
    if (RATIO_ORIENTATION2[ratio]) return RATIO_ORIENTATION2[ratio];
    const dimensions = taskSizeDimensions(task);
    if (!dimensions) return "";
    const [width, height] = dimensions;
    if (width === height) return "square";
    return width > height ? "landscape" : "portrait";
  }
  function taskPromptFidelity2(task) {
    const value = String(task?.params?.prompt_fidelity || task?.request?.prompt_fidelity || "strict");
    return ["original", "strict", "off"].includes(value) ? value : "strict";
  }
  function taskResolution2(task) {
    const dimensions = taskSizeDimensions(task);
    if (!dimensions) return "";
    const [width, height] = dimensions;
    for (const [resolution, ratios] of Object.entries(GPT_IMAGE_2_SIZE_PRESETS2)) {
      const matchesPreset = Object.values(ratios).some((presetDimensions2) => {
        return presetDimensions2[0] === width && presetDimensions2[1] === height;
      });
      if (matchesPreset) return resolution;
    }
    return "";
  }
  function taskSizeDimensions(task) {
    const size = String(task?.output_size || task?.params?.size || task?.request?.size || "");
    const match = size.match(/^(\d{2,5})x(\d{2,5})$/i);
    if (!match) return null;
    const width = Number.parseInt(match[1] || "", 10);
    const height = Number.parseInt(match[2] || "", 10);
    if (!width || !height) return null;
    return [width, height];
  }
  function greatestCommonDivisor(left, right) {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a || 1;
  }
  function taskInputUrls(task) {
    if (Array.isArray(task.input_urls) && task.input_urls.length) {
      return task.input_urls;
    }
    if (!Array.isArray(task.input_files) || !task.task_id) {
      return [];
    }
    return task.input_files.map((filename) => `/inputs/${encodeURIComponent(filename)}`);
  }
  function taskInputThumbnailRoute(task, index) {
    const inputIndex = positiveInt(index);
    if (!task?.task_id || inputIndex === null) return "";
    return `/api/tasks/${encodeURIComponent(task.task_id)}/inputs/${inputIndex}/thumbnail`;
  }
  function taskInputThumbnailUrls(task) {
    if (!task) return [];
    if (Array.isArray(task.input_thumbnail_urls) && task.input_thumbnail_urls.length) {
      return task.input_thumbnail_urls.filter(Boolean);
    }
    return taskInputUrls(task).map((_, index) => taskInputThumbnailRoute(task, index + 1)).filter(Boolean);
  }
  function isLegacyOutputInputUrl(url) {
    return typeof url === "string" && /^\/outputs\/[^/]+\/inputs\//.test(url);
  }
  function taskInputPreviewUrls2(task) {
    const thumbnailUrls = taskInputThumbnailUrls(task);
    if (Array.isArray(task?.input_sources) && task.input_sources.length) {
      const inputUrls = taskInputUrls(task);
      let uploadInputIndex = 0;
      return task.input_sources.map((source) => {
        if (source?.kind !== "upload") return source?.image_url;
        const fallbackUrl = inputUrls[uploadInputIndex];
        const thumbnailUrl = source.thumbnail_url || thumbnailUrls[uploadInputIndex];
        uploadInputIndex += 1;
        if (thumbnailUrl) return thumbnailUrl;
        if (fallbackUrl && isLegacyOutputInputUrl(source.image_url)) return fallbackUrl;
        return source.image_url || fallbackUrl;
      }).filter(Boolean);
    }
    return thumbnailUrls.length ? thumbnailUrls : taskInputUrls(task);
  }
  function outputFileUrl2(filename) {
    const clean = String(filename || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
    return clean ? `/outputs/${clean}` : "";
  }
  function taskThumbnailRoute(task, index) {
    const outputIndex = positiveInt(index);
    if (!task?.task_id || outputIndex === null) return "";
    return `/api/tasks/${encodeURIComponent(task.task_id)}/outputs/${outputIndex}/thumbnail`;
  }
  function taskThumbnailUrls2(task) {
    if (!task) return [];
    const deletedIndexes = taskDeletedOutputIndexes(task);
    const urls = [];
    const pushUrl = (url, index) => {
      const clean = String(url || "").trim();
      const outputIndex = positiveInt(index);
      if (!clean || outputIndex !== null && deletedIndexes.has(outputIndex) || urls.includes(clean)) return;
      urls.push(clean);
    };
    if (Array.isArray(task.thumbnail_urls) && task.thumbnail_urls.length) {
      task.thumbnail_urls.forEach((url, fallbackIndex) => {
        pushUrl(url, taskOutputIndexFromUrl(url) || fallbackIndex + 1);
      });
      if (urls.length) return urls;
    }
    if (Array.isArray(task?.outputs)) {
      task.outputs.forEach((record, fallbackIndex) => {
        if (!record || typeof record !== "object" || taskOutputRecordIsDeleted(record)) return;
        const index = positiveInt(record.index) || fallbackIndex + 1;
        if (deletedIndexes.has(index) || record.status !== "completed") return;
        const recordUrl = record.thumbnail_url || outputFileUrl2(record.thumbnail_file) || (record.url || record.file ? taskThumbnailRoute(task, index) : "");
        pushUrl(recordUrl, index);
      });
      if (urls.length) return urls;
    }
    taskOutputUrls2(task).forEach((url, fallbackIndex) => {
      const index = taskOutputIndexFromUrl(url) || fallbackIndex + 1;
      pushUrl(taskThumbnailRoute(task, index), index);
    });
    return urls;
  }
  function taskOutputUrls2(task) {
    if (!task) return [];
    const deletedIndexes = taskDeletedOutputIndexes(task);
    if (Array.isArray(task.output_urls) && task.output_urls.length) {
      return task.output_urls.filter((url, fallbackIndex) => {
        const record = Array.isArray(task?.outputs) ? task.outputs.find((item) => taskOutputRecordMatchesUrl(item, url)) : null;
        const index = positiveInt(record?.index) || taskOutputIndexFromUrl(url) || fallbackIndex + 1;
        return !deletedIndexes.has(index) && !taskOutputRecordIsDeleted(record);
      });
    }
    const singleIndex = taskOutputIndexFromUrl(task.output_url) || 1;
    if (task.output_url && !deletedIndexes.has(singleIndex)) return [task.output_url];
    return [];
  }
  function taskDeletedOutputIndexes(task) {
    const indexes = /* @__PURE__ */ new Set();
    if (Array.isArray(task?.deleted_output_indexes)) {
      task.deleted_output_indexes.forEach((value) => {
        const index = positiveInt(value);
        if (index !== null) indexes.add(index);
      });
    }
    if (Array.isArray(task?.outputs)) {
      task.outputs.forEach((record, fallbackIndex) => {
        if (!taskOutputRecordIsDeleted(record)) return;
        const index = positiveInt(record?.index) || fallbackIndex + 1;
        indexes.add(index);
      });
    }
    return indexes;
  }
  function taskSelectedOutputIndexes(task) {
    const deletedIndexes = taskDeletedOutputIndexes(task);
    const indexes = [];
    if (!Array.isArray(task?.selected_output_indexes)) return indexes;
    task.selected_output_indexes.forEach((value) => {
      const index = positiveInt(value);
      if (index === null || deletedIndexes.has(index) || indexes.includes(index)) return;
      indexes.push(index);
    });
    return indexes.sort((left, right) => left - right);
  }
  function taskOutputSelected(task, outputIndex) {
    const index = positiveInt(outputIndex);
    if (index === null) return false;
    return taskSelectedOutputIndexes(task).includes(index);
  }
  function taskOutputRecordIsDeleted(record) {
    if (!record || typeof record !== "object") return false;
    return Boolean(record.deleted) || record.status === "deleted";
  }
  function taskOutputRecordMatchesUrl(record, url) {
    if (!record || typeof record !== "object") return false;
    if (record.url && String(record.url) === String(url)) return true;
    const recordIndex = positiveInt(record.index);
    const urlIndex = taskOutputIndexFromUrl(url);
    return recordIndex !== null && urlIndex !== null && recordIndex === urlIndex;
  }
  function taskImageBlockStates2(task) {
    const total = taskTotalCount(task);
    const records = taskOutputRecordsByIndex(task);
    const status = String(task?.status || "");
    const states = [];
    let runningAssigned = false;
    const hasExplicitRunningRecords = Array.from(records.values()).some((record) => record?.status === "running");
    for (let index = 1; index <= total; index += 1) {
      const record = records.get(index);
      if (record?.status === "completed") {
        states.push(taskOutputRecordHasDisplayableImage(record) ? "completed" : "waiting");
      } else if (record?.status === "failed") {
        states.push("failed");
      } else if (record?.status === "running") {
        states.push("running");
      } else if (record?.status === "queued" || record?.status === "waiting") {
        states.push(record.status);
      } else if (status === "running" && !hasExplicitRunningRecords && !runningAssigned) {
        states.push("running");
        runningAssigned = true;
      } else if (status === "queued" || status === "submitting") {
        states.push("queued");
      } else if (status === "failed" || status === "partial_failed") {
        states.push("failed");
      } else if (status === "completed") {
        states.push("completed");
      } else {
        states.push("waiting");
      }
    }
    return states;
  }
  function taskVisibleCompletedCount(task) {
    if (!task) return 0;
    const completedRecords = [...taskOutputRecordsByIndex(task).values()].filter((record) => record?.status === "completed" && taskOutputRecordHasDisplayableImage(record)).length;
    return Math.max(completedRecords, taskOutputUrls2(task).length);
  }
  function taskOutputRecordHasDisplayableImage(record) {
    return Boolean(record?.url);
  }
  function taskOutputRecordsByIndex(task) {
    const records = /* @__PURE__ */ new Map();
    const outputUrls = taskOutputUrls2(task);
    const structuredOutputs = Array.isArray(task?.outputs) ? task.outputs : [];
    if (!structuredOutputs.length) {
      outputUrls.forEach((url, index) => {
        records.set(index + 1, { index: index + 1, status: "completed", url });
      });
      return records;
    }
    structuredOutputs.forEach((record, fallbackIndex) => {
      if (!record || typeof record !== "object") return;
      if (taskOutputRecordIsDeleted(record)) return;
      const index = positiveInt(record.index) || fallbackIndex + 1;
      if (taskDeletedOutputIndexes(task).has(index)) return;
      const previous = records.get(index) || {};
      records.set(index, { ...previous, ...record, url: record.url || previous.url });
    });
    outputUrls.forEach((url, fallbackIndex) => {
      if (!url) return;
      const duplicateUrl = [...records.values()].some((record) => record?.url === url);
      if (duplicateUrl) return;
      const index = taskOutputIndexFromUrl(url) || fallbackIndex + 1;
      const previous = records.get(index);
      if (previous) {
        records.set(index, { ...previous, status: previous.status || "completed", url: previous.url || url });
      } else {
        records.set(index, { index, status: "completed", url });
      }
    });
    return records;
  }
  function taskOutputIndexFromUrl(url) {
    const match = String(url || "").match(/-image-(\d+)(?=\.[a-z0-9]+(?:[?#].*)?$|$)/i);
    return positiveInt(match?.[1]);
  }
  function compressTaskImageBlockStates2(states) {
    if (states.length <= 12) return states;
    const compressed = [];
    for (let index = 0; index < 12; index += 1) {
      const start = Math.floor(index * states.length / 12);
      const end = Math.max(start + 1, Math.floor((index + 1) * states.length / 12));
      compressed.push(compressedTaskImageState(states.slice(start, end)));
    }
    return compressed;
  }
  function compressedTaskImageState(states) {
    if (states.includes("failed")) return "failed";
    if (states.includes("running")) return "running";
    if (states.length && states.every((state33) => state33 === "completed")) return "completed";
    if (states.includes("queued")) return "queued";
    return "waiting";
  }
  function taskImageStatusCounts2(states) {
    return states.reduce((counts, state33) => {
      counts[state33] = (counts[state33] || 0) + 1;
      return counts;
    }, { completed: 0, failed: 0, running: 0, queued: 0, waiting: 0 });
  }
  function positiveInt(value) {
    const parsed = Number.parseInt(value ?? "", 10);
    return !Number.isNaN(parsed) && parsed > 0 ? parsed : null;
  }
  function taskFailureMessage2(task) {
    if (!task || task.status !== "failed" && task.status !== "partial_failed") return "";
    return String(task.error || task.last_error || "").trim();
  }
  function canRetryFailedTask2(task) {
    if (!task || task.local_pending) return false;
    if (!["failed", "partial_failed"].includes(task.status)) return false;
    if (taskHasNonRetryableError(task)) return false;
    const states = taskImageBlockStates2(task);
    return states.includes("failed");
  }
  function canAcceptTaskSuccesses2(task) {
    if (!task || task.local_pending) return false;
    if (!["failed", "partial_failed"].includes(task.status)) return false;
    return taskOutputUrls2(task).length > 0;
  }
  function taskRetryReasonText(task) {
    const message = String(task?.last_error || task?.error || "").toLowerCase();
    if (message.includes("usage limit") || message.includes("quota") || message.includes("rate limit")) {
      return "\u8D26\u53F7\u989D\u5EA6\u53D7\u9650";
    }
    if (message.includes("incompleteread") || message.includes("timeout") || message.includes("network")) {
      return "\u8FDE\u63A5\u4E2D\u65AD";
    }
    return "\u4E0A\u6B21\u5931\u8D25";
  }
  function taskRetryStateText3(task) {
    if (!task) return "";
    const attempts = positiveInt(task.attempts) || 0;
    const maxAttempts = positiveInt(task.max_attempts) || 0;
    const retryingSlots = Array.isArray(task.retrying_failed_slots) ? task.retrying_failed_slots : [];
    const manualRetryRequested = Boolean(task.retry_requested_at || retryingSlots.length);
    const hasRetryContext = Boolean(task.last_error || task.error || manualRetryRequested);
    if (!hasRetryContext || !maxAttempts) return "";
    const reason = taskRetryReasonText(task);
    if (task.status === "queued" && attempts < maxAttempts) {
      return `${reason}\uFF0C\u7B49\u5F85\u91CD\u8BD5\uFF08\u7B2C ${attempts + 1}/${maxAttempts} \u6B21\u5C1D\u8BD5\uFF09`;
    }
    if (task.status === "running") {
      if (attempts <= 1 && !manualRetryRequested) return "";
      return `${reason}\uFF0C\u91CD\u8BD5\u4E2D\uFF08\u7B2C ${Math.max(1, attempts)}/${maxAttempts} \u6B21\u5C1D\u8BD5\uFF09`;
    }
    if (["failed", "partial_failed"].includes(task.status)) {
      if (taskHasNonRetryableError(task)) {
        return `\u7B2C ${Math.max(1, attempts)}/${maxAttempts} \u6B21\uFF0C\u4E0D\u53EF\u91CD\u8BD5`;
      }
      if (attempts > 0) {
        return "\u5DF2\u505C\u6B62\uFF0C\u53EF\u624B\u52A8\u91CD\u8BD5\u5931\u8D25\u56FE\u7247";
      }
    }
    return "";
  }
  function taskHasNonRetryableError(task) {
    const message = String(task?.error || task?.last_error || "").toLowerCase();
    if (!message) return false;
    if (!message.includes("http 400")) return false;
    return [
      "invalid_request_error",
      "invalid_value",
      "expected a base64-encoded data url",
      "unsupported mime type"
    ].some((token) => message.includes(token));
  }
  function taskRuntimeText3(task) {
    if (!task || !["completed", "failed", "partial_failed"].includes(task.status)) return "";
    const startedAt = timestampMs3(task.started_at || task.created_at);
    const endedAt = timestampMs3(task.completed_at || task.updated_at);
    if (startedAt === null || endedAt === null || endedAt < startedAt) return "";
    const seconds = Math.floor((endedAt - startedAt) / 1e3);
    const completion = taskCompletionTimestampText(task);
    return completion ? `\u8017\u65F6 ${formatDuration2(seconds)} \xB7 \u5B8C\u6210 ${completion.shortText}` : `\u8017\u65F6 ${formatDuration2(seconds)}`;
  }
  function taskCompletionTimestampText(task) {
    const completedAt = taskCompletionTimestampMs(task);
    if (completedAt === null) return null;
    return { shortText: formatLocalTimestamp(completedAt, false) };
  }
  function taskCompletionTimestampTitle2(task) {
    const completedAt = taskCompletionTimestampMs(task);
    if (completedAt === null) return "";
    return `\u5B8C\u6210 ${formatLocalTimestamp(completedAt, true)}`;
  }
  function taskCompletionTimestampMs(task) {
    if (!task || !["completed", "failed", "partial_failed"].includes(task.status)) return null;
    return timestampMs3(task.completed_at || task.updated_at);
  }
  function formatLocalTimestamp(timestamp, includeSeconds) {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");
    return includeSeconds ? `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` : `${month}-${day} ${hours}:${minutes}`;
  }
  function timestampMs3(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  function elapsedSecondsSince2(value) {
    const startedAt = timestampMs3(value);
    if (startedAt === null) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1e3));
  }
  function elapsedMillisecondsSince2(value) {
    const startedAt = timestampMs3(value);
    if (startedAt === null) return 0;
    return Math.max(0, Date.now() - startedAt);
  }
  function formatDuration2(totalSeconds) {
    const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function formatDurationParts2(totalMilliseconds) {
    const safeMilliseconds = Number.isFinite(totalMilliseconds) && totalMilliseconds > 0 ? totalMilliseconds : 0;
    const minutes = Math.floor(safeMilliseconds / 6e4);
    const seconds = Math.floor(safeMilliseconds % 6e4 / 1e3);
    const deciseconds = Math.floor(safeMilliseconds % 1e3 / 100);
    const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const fraction = `.${deciseconds}`;
    return { clock, fraction, text: `${clock}${fraction}` };
  }
  function formatDurationTenths2(totalMilliseconds) {
    return formatDurationParts2(totalMilliseconds).text;
  }
  function elapsedWheelMarkup(char) {
    const safeChar = escapeHtml19(char);
    if (/^\d$/.test(char)) {
      const digitStrip = "0123456789".split("").map((digit) => `<span>${digit}</span>`).join("");
      return `<span class="elapsed-wheel" aria-hidden="true" data-elapsed-char="${safeChar}" data-elapsed-char-value="${safeChar}" style="--digit-offset: ${safeChar};"><span class="elapsed-wheel-strip">${digitStrip}</span></span>`;
    }
    return `<span class="elapsed-separator" aria-hidden="true" data-elapsed-char="${safeChar}" data-elapsed-char-value="${safeChar}">${safeChar}</span>`;
  }
  function elapsedPartMarkup2(text) {
    return Array.from(text).map((char) => elapsedWheelMarkup(char)).join("");
  }
  function elapsedTimerMarkup2(totalMilliseconds) {
    const elapsed = formatDurationParts2(totalMilliseconds);
    return `<span class="elapsed-main">${elapsedPartMarkup2(elapsed.clock)}</span><span class="elapsed-ms">${elapsedPartMarkup2(elapsed.fraction)}</span>`;
  }
  function elapsedTimerSpan(kind, startValue) {
    const elapsedMs = elapsedMillisecondsSince2(startValue);
    const elapsed = formatDurationTenths2(elapsedMs);
    return `<span class="elapsed-timer" aria-label="${elapsed}" data-preview-elapsed="${escapeHtml19(kind)}" data-preview-start="${escapeHtml19(startValue || "")}">${elapsedTimerMarkup2(elapsedMs)}</span>`;
  }
  function taskGeneratedCount(task, fallback = 0) {
    const visibleCompleted = taskVisibleCompletedCount(task);
    if (visibleCompleted || Array.isArray(task?.outputs) || Array.isArray(task?.output_urls) || task?.output_url) {
      return visibleCompleted;
    }
    const value = Number.parseInt(task?.generated_count ?? "", 10);
    if (!Number.isNaN(value)) return value;
    return fallback;
  }
  function taskTotalCount(task) {
    const value = Number.parseInt(task?.total_count ?? task?.params?.n ?? "", 10);
    if (!Number.isNaN(value) && value > 0) return value;
    return 1;
  }
  function taskOutputIndex(task, url, visibleIndex) {
    const output = Array.isArray(task?.outputs) ? task.outputs.find((item) => item?.status === "completed" && item?.url === url) : null;
    const value = Number.parseInt(output?.index ?? "", 10);
    if (!Number.isNaN(value) && value > 0) return value;
    return visibleIndex + 1;
  }
  function taskProgressStartValue2(task) {
    if (!task) return "";
    if (task.status === "running" && taskRetryStateText3(task)) {
      return task?.attempt_started_at || task?.updated_at || task?.retry_requested_at || task?.queued_at || task?.started_at || task?.created_at || "";
    }
    return task?.attempt_started_at || task?.started_at || task?.queued_at || task?.created_at || "";
  }
  function initTaskDerivedFeature() {
    Object.assign(getLegacyBridge().methods, {
      taskRatio: taskRatio2,
      taskOrientation: taskOrientation2,
      taskPromptFidelity: taskPromptFidelity2,
      taskResolution: taskResolution2,
      taskSizeDimensions,
      greatestCommonDivisor,
      taskInputUrls,
      taskInputThumbnailUrls,
      taskInputThumbnailRoute,
      taskInputPreviewUrls: taskInputPreviewUrls2,
      taskThumbnailUrls: taskThumbnailUrls2,
      taskThumbnailRoute,
      taskOutputUrls: taskOutputUrls2,
      taskDeletedOutputIndexes,
      taskSelectedOutputIndexes,
      taskOutputSelected,
      taskImageBlockStates: taskImageBlockStates2,
      taskVisibleCompletedCount,
      taskOutputRecordIsDeleted,
      taskOutputRecordMatchesUrl,
      taskOutputRecordHasDisplayableImage,
      taskOutputRecordsByIndex,
      taskOutputIndexFromUrl,
      compressTaskImageBlockStates: compressTaskImageBlockStates2,
      compressedTaskImageState,
      taskImageStatusCounts: taskImageStatusCounts2,
      positiveInt,
      taskFailureMessage: taskFailureMessage2,
      canRetryFailedTask: canRetryFailedTask2,
      canAcceptTaskSuccesses: canAcceptTaskSuccesses2,
      taskRetryReasonText,
      taskRetryStateText: taskRetryStateText3,
      taskHasNonRetryableError,
      taskRuntimeText: taskRuntimeText3,
      taskCompletionTimestampText,
      taskCompletionTimestampTitle: taskCompletionTimestampTitle2,
      timestampMs: timestampMs3,
      elapsedSecondsSince: elapsedSecondsSince2,
      elapsedMillisecondsSince: elapsedMillisecondsSince2,
      formatDuration: formatDuration2,
      formatDurationParts: formatDurationParts2,
      formatDurationTenths: formatDurationTenths2,
      elapsedWheelMarkup,
      elapsedPartMarkup: elapsedPartMarkup2,
      elapsedTimerMarkup: elapsedTimerMarkup2,
      elapsedTimerSpan,
      taskGeneratedCount,
      taskTotalCount,
      taskOutputIndex,
      taskProgressStartValue: taskProgressStartValue2
    });
  }

  // codex_image/webui/frontend/src/task-preview.ts
  var bridge35 = getLegacyBridge();
  var state29 = bridge35.state;
  var els38 = bridge35.els;
  var previewGridEventsBound = false;
  var pendingPreviewRenderToken = 0;
  function legacyMethod39(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function escapeHtml20(...args) {
    return legacyMethod39("escapeHtml", ...args);
  }
  function isTaskArchived4(...args) {
    return legacyMethod39("isTaskArchived", ...args);
  }
  function updatePreviewElapsedDisplay2(...args) {
    return legacyMethod39("updatePreviewElapsedDisplay", ...args);
  }
  function closePromptPopover7(...args) {
    return legacyMethod39("closePromptPopover", ...args);
  }
  function currentSize2(...args) {
    return legacyMethod39("currentSize", ...args);
  }
  function syncActiveLightboxUrls2(...args) {
    return legacyMethod39("syncActiveLightboxUrls", ...args);
  }
  function collectReferenceOutput2(...args) {
    return legacyMethod39("collectReferenceOutput", ...args);
  }
  function openPromptPopover(...args) {
    return legacyMethod39("openPromptPopover", ...args);
  }
  function retryFailedTask2(...args) {
    return legacyMethod39("retryFailedTask", ...args);
  }
  function acceptTaskSuccesses2(...args) {
    return legacyMethod39("acceptTaskSuccesses", ...args);
  }
  function openConfirmPopover6(...args) {
    return legacyMethod39("openConfirmPopover", ...args);
  }
  function setStatus21(...args) {
    return legacyMethod39("setStatus", ...args);
  }
  function updateTaskInState3(...args) {
    return legacyMethod39("updateTaskInState", ...args);
  }
  function renderTasks7(...args) {
    return legacyMethod39("renderTasks", ...args);
  }
  function taskApiProviderId2(...args) {
    return legacyMethod39("taskApiProviderId", ...args);
  }
  function taskApiProviderLabel2(...args) {
    return legacyMethod39("taskApiProviderLabel", ...args);
  }
  var taskOutputUrls3 = (...args) => legacyMethod39("taskOutputUrls", ...args);
  var taskSelectedOutputIndexes2 = (...args) => legacyMethod39("taskSelectedOutputIndexes", ...args);
  var taskOutputSelected2 = (...args) => legacyMethod39("taskOutputSelected", ...args);
  var positiveInt2 = (...args) => legacyMethod39("positiveInt", ...args);
  var taskFailureMessage3 = (...args) => legacyMethod39("taskFailureMessage", ...args);
  var canRetryFailedTask3 = (...args) => legacyMethod39("canRetryFailedTask", ...args);
  var canAcceptTaskSuccesses3 = (...args) => legacyMethod39("canAcceptTaskSuccesses", ...args);
  var taskRetryStateText4 = (...args) => legacyMethod39("taskRetryStateText", ...args);
  var elapsedTimerSpan2 = (...args) => legacyMethod39("elapsedTimerSpan", ...args);
  var taskGeneratedCount2 = (...args) => legacyMethod39("taskGeneratedCount", ...args);
  var taskTotalCount2 = (...args) => legacyMethod39("taskTotalCount", ...args);
  var taskOutputIndex2 = (...args) => legacyMethod39("taskOutputIndex", ...args);
  var taskProgressStartValue3 = (...args) => legacyMethod39("taskProgressStartValue", ...args);
  function taskRequestPreviewPayload(task) {
    if (!task?.request) return null;
    const request = { ...task.request };
    const providerId = taskApiProviderId2(task);
    const providerLabel = taskApiProviderLabel2(task);
    if (providerId && !request.webui_api_provider_id) {
      request.webui_api_provider_id = providerId;
    }
    if (providerLabel && !request.webui_api_provider_name) {
      request.webui_api_provider_name = providerLabel;
    }
    return request;
  }
  function renderPreview5(task = null) {
    const selectedTask = state29.tasks.find((item) => String(item.task_id) === String(state29.selectedTaskId));
    const visibleSelectedTask = selectedTask && !isTaskArchived4(selectedTask.task_id) ? selectedTask : null;
    const selected = task || visibleSelectedTask || state29.tasks.find((item) => !isTaskArchived4(item.task_id)) || selectedTask || state29.tasks[0];
    updatePreviewDownloadActions(selected);
    const nextPreviewKey = previewStructureKey(selected);
    if (state29.previewRenderKey === nextPreviewKey) {
      return updatePreviewElapsedDisplay2();
    }
    state29.previewRenderKey = nextPreviewKey;
    if (selected?.status === "running") {
      if (taskOutputUrls3(selected).length) {
        renderOutputPreview(selected, { running: true });
        return;
      }
      closePromptPopover7();
      cancelDeferredPreviewRender();
      renderRunningPreview(selected);
      return;
    }
    if (selected?.status === "submitting" || selected?.status === "queued") {
      if (selected.status === "queued" && taskOutputUrls3(selected).length) {
        renderOutputPreview(selected, { waiting: true });
        return;
      }
      closePromptPopover7();
      cancelDeferredPreviewRender();
      renderWaitingPreview(selected);
      return;
    }
    if (selected?.status === "failed" || selected?.status === "partial_failed") {
      if (taskOutputUrls3(selected).length) {
        renderOutputPreview(selected, { failure: true });
        return;
      }
      closePromptPopover7();
      cancelDeferredPreviewRender();
      clearPreviewGridLayout();
      els38.previewGrid.innerHTML = `
      <div class="empty-preview error-preview">
        <p>${escapeHtml20(taskFailureMessage3(selected) || "\u4EFB\u52A1\u5931\u8D25")}</p>
        ${retryFailureSummaryButton(selected)}
      </div>
    `;
      bindPreviewRetryButtons();
      return;
    }
    const outputUrls = taskOutputUrls3(selected);
    if (!selected || !outputUrls.length) {
      closePromptPopover7();
      cancelDeferredPreviewRender();
      clearPreviewGridLayout();
      els38.previewGrid.innerHTML = `<div class="empty-preview">\u6682\u65E0\u56FE\u7247</div>`;
      return;
    }
    renderOutputPreview(selected);
  }
  function previewStructureKey(task) {
    if (!task) return "empty:none";
    const taskId = String(task.task_id || "");
    const status = String(task.status || "");
    const outputUrls = taskOutputUrls3(task).join("|");
    const selectedIndexes = taskSelectedOutputIndexes2(task).join(",");
    const size = task.params?.size || task.output_size || currentSize2();
    if (status === "failed" || status === "partial_failed") {
      return ["failed", taskId, status, outputUrls, selectedIndexes, taskFailureMessage3(task), taskRetryStateText4(task), canRetryFailedTask3(task), canAcceptTaskSuccesses3(task)].join("|");
    }
    if (status === "submitting" || status === "queued") {
      return ["waiting", taskId, status, outputUrls, selectedIndexes, taskGeneratedCount2(task, 0), taskTotalCount2(task), size, task.last_error || task.error || "", taskRetryStateText4(task)].join("|");
    }
    if (status === "running") {
      return ["running", taskId, outputUrls, selectedIndexes, taskGeneratedCount2(task, 0), taskTotalCount2(task), size, task.mode || "", taskRetryStateText4(task), taskRunningFailureKey(task)].join("|");
    }
    if (outputUrls) {
      return ["output", taskId, status, outputUrls, selectedIndexes, previewPromptKey(task)].join("|");
    }
    return ["empty", taskId, status].join("|");
  }
  function previewPromptKey(task) {
    const revisedPrompts = Array.isArray(task?.revised_prompts) ? task.revised_prompts.join("") : "";
    return [task?.prompt_for_model || task?.prompt || "", task?.revised_prompt || "", revisedPrompts].join("");
  }
  function taskRunningFailureKey(task) {
    return taskFailedOutputRecords(task).map((failure) => `${failure.index}:${failure.error}`).join("");
  }
  function taskFirstFailedOutput(task) {
    return taskFailedOutputRecords(task)[0] || null;
  }
  function taskFailedOutputRecords(task) {
    if (!Array.isArray(task?.outputs)) return [];
    return task.outputs.map((record, outputPosition) => {
      if (!record || record.status !== "failed") return null;
      const error = String(record.error || record.message || record.failure_reason || "").trim();
      if (!error) return null;
      return {
        index: positiveInt2(record.index) || outputPosition + 1,
        error
      };
    }).filter(Boolean).sort((left, right) => left.index - right.index);
  }
  function runningFailureNotice(task) {
    const failure = taskFirstFailedOutput(task);
    if (!failure) return "";
    return `
    <div class="running-failure-notice" data-preview-running-failure role="status">
      <strong>\u7B2C ${failure.index} \u5F20\u5931\u8D25</strong>
      <p>${escapeHtml20(failure.error)}</p>
    </div>
  `;
  }
  function scheduleDeferredPreviewRender(task, { running, failure, waiting, outputUrls, totalCount, itemCount }) {
    const renderToken = ++pendingPreviewRenderToken;
    void (async () => {
      const allImagesLoaded = await preloadPreviewImages(outputUrls);
      if (renderToken !== pendingPreviewRenderToken) return;
      commitOutputPreviewRender(task, {
        running,
        failure,
        waiting,
        outputUrls,
        totalCount,
        itemCount,
        preservePreviousImages: false,
        imageAlreadyLoaded: allImagesLoaded
      });
    })();
  }
  function cancelDeferredPreviewRender() {
    pendingPreviewRenderToken += 1;
  }
  function renderOutputPreview(task, { running = false, failure = false, waiting = false } = {}) {
    const outputUrls = taskOutputUrls3(task);
    const hasStatusCard = running || failure || waiting;
    const totalCount = hasStatusCard ? taskTotalCount2(task) : outputUrls.length;
    const itemCount = outputUrls.length + (hasStatusCard ? 1 : 0);
    const previousOutputCount = currentPreviewOutputCardCount();
    const preservePreviousImages = previousOutputCount === outputUrls.length;
    const shouldDeferLayoutSwitch = !preservePreviousImages && outputUrls.length > 0;
    if (shouldDeferLayoutSwitch) {
      scheduleDeferredPreviewRender(task, { running, failure, waiting, outputUrls, totalCount, itemCount });
      return;
    }
    pendingPreviewRenderToken += 1;
    commitOutputPreviewRender(task, { running, failure, waiting, outputUrls, totalCount, itemCount, preservePreviousImages });
  }
  function commitOutputPreviewRender(task, { running = false, failure = false, waiting = false, outputUrls, totalCount, itemCount, preservePreviousImages = true, imageAlreadyLoaded = false }) {
    applyPreviewGridLayout(totalCount, itemCount);
    state29.previewTask = task || null;
    state29.previewOutputUrls = outputUrls.slice();
    bindPreviewGridEvents();
    reconcilePreviewOutputCards(task, outputUrls, totalCount, { preservePreviousImages, imageAlreadyLoaded });
    reconcilePreviewStatusCard(task, { running, failure, waiting }, outputUrls.length);
    syncActiveLightboxUrls2(outputUrls);
    window.requestAnimationFrame(syncPreviewImageOrientation);
  }
  function reconcilePreviewOutputCards(task, outputUrls, totalCount, { preservePreviousImages = true, imageAlreadyLoaded = false } = {}) {
    if (!els38.previewGrid) return;
    const desiredKeys = new Set(outputUrls.map((url, index) => previewOutputCardKey(task, url, index)));
    removeStalePreviewNodes(desiredKeys);
    outputUrls.forEach((url, index) => {
      const key = previewOutputCardKey(task, url, index);
      const card = ensurePreviewOutputCard(key);
      if (els38.previewGrid.children[index] !== card) {
        els38.previewGrid.insertBefore(card, els38.previewGrid.children[index] || null);
      }
      updatePreviewOutputCard(card, task, url, index, totalCount, { preservePreviousImage: preservePreviousImages, imageAlreadyLoaded });
    });
  }
  function currentPreviewOutputCardCount() {
    if (!els38.previewGrid) return 0;
    return els38.previewGrid.querySelectorAll(".preview-card[data-preview-card-key]").length;
  }
  function removeStalePreviewNodes(desiredKeys) {
    [...els38.previewGrid.children].forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      const key = child.dataset.previewCardKey;
      if (key) {
        if (!desiredKeys.has(key)) child.remove();
        return;
      }
      if (child.dataset.previewStatusCard === "true") return;
      child.remove();
    });
  }
  function previewOutputCardKey(task, url, index) {
    return `slot-${taskOutputIndex2(task, url, index) || index + 1}`;
  }
  function ensurePreviewOutputCard(key) {
    const existing = [...els38.previewGrid.querySelectorAll(".preview-card[data-preview-card-key]")].find((card2) => {
      return card2 instanceof HTMLElement && card2.dataset.previewCardKey === key;
    });
    if (existing instanceof HTMLElement) return existing;
    const card = document.createElement("div");
    card.className = "preview-card";
    card.setAttribute("data-preview-card-key", key);
    card.innerHTML = `
    <span class="preview-index hidden"></span>
    <button type="button" class="preview-select-button" data-preview-select-output-index="" aria-pressed="false" aria-label="\u52A0\u5165\u7CBE\u9009" title="\u52A0\u5165\u7CBE\u9009" hidden disabled>
      <svg class="preview-select-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.3-4.2 6-.9L12 3.5z" />
      </svg>
      <span class="preview-select-label" data-preview-select-label>\u7CBE\u9009</span>
    </button>
    <img alt="" data-lightbox-url="">
    <div class="preview-overlay">
       <div class="prompt-action-row">
         <button type="button" class="add-to-input-btn" data-add-input-url="" aria-label="\u52A0\u5165\u53C2\u8003\u56FE">\u52A0\u5165\u53C2\u8003\u56FE</button>
         <button type="button" class="collect-input-btn" data-collect-input-url="" data-collect-output-index="" data-collect-output-name="" aria-label="\u6682\u5B58\u5230\u5F85\u52A0\u5165\u53C2\u8003\u56FE" title="\u6682\u5B58\u5230\u5F85\u52A0\u5165\u53C2\u8003\u56FE">\u6682\u5B58</button>
         <button type="button" class="prompt-popover-button" data-prompt-popover-index="">\u63D0\u793A\u8BCD</button>
         <a class="preview-download-link" href="#" download="" data-download-output-url="" title="\u4E0B\u8F7D\u8BE5\u56FE\u7247" aria-label="\u4E0B\u8F7D\u8BE5\u56FE\u7247">\u4E0B\u8F7D</a>
       </div>
    </div>
  `;
    const image = card.querySelector("img");
    image?.addEventListener("load", syncPreviewImageOrientation);
    return card;
  }
  function updatePreviewOutputCard(card, task, url, index, totalCount, { preservePreviousImage = true, imageAlreadyLoaded = false } = {}) {
    const outputIndex = taskOutputIndex2(task, url, index);
    const outputUrl = String(url || "");
    const downloadName = outputDownloadFilename(task, url, index);
    card.setAttribute("data-preview-card-key", previewOutputCardKey(task, url, index));
    card.setAttribute("data-preview-output-url", outputUrl);
    card.dataset.previewTaskId = String(task?.task_id || "");
    updatePreviewIndexLabel(card, outputIndex, totalCount);
    updatePreviewImage(card, outputUrl, { preservePreviousImage, imageAlreadyLoaded });
    const addButton = card.querySelector("[data-add-input-url]");
    const collectButton = card.querySelector("[data-collect-input-url]");
    const promptButton = card.querySelector("[data-prompt-popover-index]");
    const downloadLink = card.querySelector("[data-download-output-url]");
    const selectButton = card.querySelector("[data-preview-select-output-index]");
    if (addButton) addButton.dataset.addInputUrl = outputUrl;
    if (collectButton) {
      collectButton.dataset.collectInputUrl = outputUrl;
      collectButton.dataset.collectOutputIndex = String(outputIndex);
      collectButton.dataset.collectOutputName = downloadName;
    }
    if (promptButton) promptButton.dataset.promptPopoverIndex = String(index);
    if (downloadLink) {
      downloadLink.href = outputUrl;
      downloadLink.download = downloadName;
      downloadLink.dataset.downloadOutputUrl = outputUrl;
    }
    if (selectButton) {
      const selectable = Number(totalCount) > 1;
      const selected = taskOutputSelected2(task, outputIndex);
      selectButton.hidden = !selectable;
      selectButton.disabled = !selectable;
      selectButton.dataset.previewSelectOutputIndex = String(outputIndex);
      selectButton.dataset.previewSelectTaskId = String(task?.task_id || "");
      selectButton.setAttribute("aria-pressed", selected ? "true" : "false");
      selectButton.setAttribute("aria-label", selected ? "\u53D6\u6D88\u7CBE\u9009" : "\u52A0\u5165\u7CBE\u9009");
      selectButton.title = selected ? "\u53D6\u6D88\u7CBE\u9009" : "\u52A0\u5165\u7CBE\u9009";
      selectButton.querySelector("[data-preview-select-label]").textContent = selected ? "\u5DF2\u7CBE\u9009" : "\u7CBE\u9009";
      card.classList.toggle("can-select-output", selectable);
      card.classList.toggle("is-selected", selected);
    }
  }
  function updatePreviewIndexLabel(card, outputIndex, totalCount) {
    const label = card.querySelector(".preview-index");
    if (!label) return;
    if (totalCount > 1) {
      label.textContent = `${outputIndex} / ${totalCount}`;
      label.classList.remove("hidden");
      return;
    }
    label.textContent = "";
    label.classList.add("hidden");
  }
  function updatePreviewImage(card, url, { preservePreviousImage = true, imageAlreadyLoaded = false } = {}) {
    const visibleImage = card.querySelector("img[data-lightbox-url]");
    if (!visibleImage) return;
    if (visibleImage.getAttribute("src") === url) {
      visibleImage.dataset.lightboxUrl = url;
      if (visibleImage.complete) window.requestAnimationFrame(syncPreviewImageOrientation);
      return;
    }
    const token = `${url}:${Date.now()}:${Math.random()}`;
    card.dataset.previewImageToken = token;
    card.dataset.previewPendingUrl = url;
    if (imageAlreadyLoaded) {
      commitPreviewImageUrl(card, visibleImage, url, token);
      return;
    }
    if (!visibleImage.getAttribute("src")) {
      commitPreviewImageUrl(card, visibleImage, url, token);
      return;
    }
    if (!preservePreviousImage) {
      clearPreviewImageBeforeLoad(visibleImage);
    }
    card.classList.add("is-loading-next");
    void preloadPreviewImage(url).then((loaded) => {
      if (!loaded) {
        cancelPreviewImagePending(card, token);
        return;
      }
      commitPreviewImageUrl(card, visibleImage, url, token);
    });
  }
  function commitPreviewImageUrl(card, visibleImage, url, token) {
    if (!card.isConnected || card.dataset.previewImageToken !== token) return;
    visibleImage.src = url;
    visibleImage.hidden = false;
    visibleImage.dataset.lightboxUrl = url;
    delete card.dataset.previewPendingUrl;
    card.classList.remove("is-loading-next");
    if (visibleImage.complete) window.requestAnimationFrame(syncPreviewImageOrientation);
  }
  function clearPreviewImageBeforeLoad(visibleImage) {
    visibleImage.hidden = true;
    visibleImage.removeAttribute("src");
    visibleImage.dataset.lightboxUrl = "";
  }
  function cancelPreviewImagePending(card, token) {
    if (!card.isConnected || card.dataset.previewImageToken !== token) return;
    delete card.dataset.previewPendingUrl;
    card.classList.remove("is-loading-next");
  }
  async function preloadPreviewImage(url) {
    const image = document.createElement("img");
    const loadedPromise = waitForPreviewImageLoad(image);
    image.decoding = "async";
    image.src = url;
    const loaded = image.complete && image.naturalWidth > 0 ? true : await loadedPromise;
    if (!loaded) return false;
    try {
      await image.decode?.();
    } catch {
    }
    return true;
  }
  async function preloadPreviewImages(outputUrls) {
    const results = await Promise.all(outputUrls.map((url) => preloadPreviewImage(String(url || ""))));
    return results.every(Boolean);
  }
  function waitForPreviewImageLoad(image) {
    return new Promise((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    });
  }
  function reconcilePreviewStatusCard(task, flags, visibleOutputCount) {
    const existing = els38.previewGrid.querySelector("[data-preview-status-card]");
    const html = flags.running ? runningProgressCard(task, visibleOutputCount) : flags.waiting ? waitingProgressCard(task, visibleOutputCount) : flags.failure ? failureSummaryCard(task, visibleOutputCount) : "";
    if (!html) {
      existing?.remove();
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const next = template.content.firstElementChild;
    if (!(next instanceof HTMLElement)) return;
    next.dataset.previewStatusCard = "true";
    if (existing) {
      existing.replaceWith(next);
    } else {
      els38.previewGrid.append(next);
    }
  }
  function bindPreviewGridEvents() {
    if (previewGridEventsBound || !els38.previewGrid) return;
    previewGridEventsBound = true;
    els38.previewGrid.addEventListener("click", handlePreviewGridClick);
  }
  function handlePreviewGridClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-download-output-url]")) return;
    const retryButton = target.closest("[data-preview-retry-failed-task-id]");
    if (retryButton) {
      retryFailedTask2(retryButton.dataset.previewRetryFailedTaskId);
      return;
    }
    const acceptButton = target.closest("[data-preview-accept-successes-task-id]");
    if (acceptButton) {
      acceptTaskSuccesses2(acceptButton.dataset.previewAcceptSuccessesTaskId);
      return;
    }
    const selectButton = target.closest("[data-preview-select-output-index]");
    if (selectButton) {
      event.stopPropagation();
      const outputIndex = positiveInt2(selectButton.dataset.previewSelectOutputIndex);
      const taskId = selectButton.dataset.previewSelectTaskId || state29.previewTask?.task_id || "";
      if (!taskId || outputIndex === null) return;
      const selected = selectButton.getAttribute("aria-pressed") !== "true";
      void updateTaskOutputSelection(taskId, outputIndex, selected);
      return;
    }
    const addButton = target.closest("[data-add-input-url]");
    if (addButton) {
      void window.addToInput?.(addButton.dataset.addInputUrl || "");
      return;
    }
    const collectButton = target.closest("[data-collect-input-url]");
    if (collectButton) {
      collectReferenceOutput2(collectButton.dataset.collectInputUrl, {
        name: collectButton.dataset.collectOutputName || "",
        sourceTaskId: state29.previewTask?.task_id || "",
        outputIndex: positiveInt2(collectButton.dataset.collectOutputIndex) || null
      });
      return;
    }
    const promptButton = target.closest("[data-prompt-popover-index]");
    if (promptButton) {
      event.stopPropagation();
      const index = Number.parseInt(promptButton.dataset.promptPopoverIndex || "0", 10);
      openPromptPopover(promptButton, promptPopoverData(state29.previewTask, index));
      return;
    }
    const image = target.closest("[data-lightbox-url]");
    if (!image) return;
    const images = [...els38.previewGrid.querySelectorAll("[data-lightbox-url]")];
    const urls = images.map((item) => item.dataset.lightboxUrl || item.currentSrc || item.src).filter((url) => Boolean(url));
    const currentUrl = image.dataset.lightboxUrl || image.currentSrc || image.src;
    if (!currentUrl) return;
    window.openLightbox?.(currentUrl, urls, Math.max(0, images.indexOf(image)));
  }
  function bindPreviewRetryButtons() {
    bindPreviewGridEvents();
  }
  function updatePreviewDownloadActions(task) {
    updatePreviewSelectionActions(task);
    const outputUrls = taskOutputUrls3(task);
    if (!els38.downloadAllButton) return;
    if (!task?.task_id || outputUrls.length < 2) {
      els38.downloadAllButton.classList.add("hidden");
      els38.downloadAllButton.removeAttribute("href");
      els38.downloadAllButton.removeAttribute("download");
      return;
    }
    els38.downloadAllButton.href = taskOutputZipUrl(task);
    els38.downloadAllButton.download = `${task.task_id}-images.zip`;
    els38.downloadAllButton.classList.remove("hidden");
  }
  function updatePreviewSelectionActions(task) {
    const outputUrls = taskOutputUrls3(task);
    const selectedUrls = taskSelectedOutputUrls(task);
    const selectedCount = selectedUrls.length;
    const totalCount = outputUrls.length;
    const hasSelection = Boolean(task?.task_id && selectedCount > 0 && totalCount > 1);
    els38.previewSelectionActions?.classList.toggle("hidden", !hasSelection);
    if (els38.previewSelectionCount) {
      els38.previewSelectionCount.textContent = selectedCount ? `\u5DF2\u9009 ${selectedCount}/${totalCount}` : "\u5DF2\u9009 0";
    }
    if (els38.downloadSelectedButton) {
      if (!hasSelection) {
        els38.downloadSelectedButton.classList.add("hidden");
        els38.downloadSelectedButton.removeAttribute("href");
        els38.downloadSelectedButton.removeAttribute("download");
      } else {
        els38.downloadSelectedButton.href = taskSelectedOutputDownloadUrl(task);
        els38.downloadSelectedButton.download = taskSelectedOutputDownloadName(task);
        els38.downloadSelectedButton.classList.remove("hidden");
      }
    }
    if (els38.deleteUnselectedOutputsButton) {
      const canDeleteUnselected = hasSelection && selectedCount < totalCount;
      els38.deleteUnselectedOutputsButton.classList.toggle("hidden", !canDeleteUnselected);
      if (canDeleteUnselected) {
        els38.deleteUnselectedOutputsButton.dataset.deleteUnselectedTaskId = String(task.task_id || "");
      } else {
        delete els38.deleteUnselectedOutputsButton.dataset.deleteUnselectedTaskId;
      }
    }
  }
  function taskSelectedOutputUrls(task) {
    const selectedIndexes = new Set(taskSelectedOutputIndexes2(task));
    return taskOutputUrls3(task).filter((url, index) => {
      return selectedIndexes.has(taskOutputIndex2(task, url, index));
    });
  }
  function taskSelectedOutputDownloadUrl(task) {
    const selectedUrls = taskSelectedOutputUrls(task);
    if (selectedUrls.length === 1) return selectedUrls[0];
    return taskOutputZipUrl(task, { selected: true });
  }
  function taskSelectedOutputDownloadName(task) {
    const selectedUrls = taskSelectedOutputUrls(task);
    if (selectedUrls.length === 1) {
      const outputUrls = taskOutputUrls3(task);
      const index = Math.max(0, outputUrls.indexOf(selectedUrls[0]));
      return outputDownloadFilename(task, selectedUrls[0], index);
    }
    return `${safeDownloadStem(task?.task_id || "image")}-selected-images.zip`;
  }
  function taskOutputZipUrl(task, { selected = false } = {}) {
    const url = `/api/tasks/${encodeURIComponent(String(task?.task_id || ""))}/outputs.zip`;
    return selected ? `${url}?selected=1` : url;
  }
  async function updateTaskOutputSelection(taskId, outputIndex, selected) {
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/outputs/${encodeURIComponent(String(outputIndex))}/selected`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u7CBE\u9009\u72B6\u6001\u66F4\u65B0\u5931\u8D25");
      const updatedTask = data.task;
      updateTaskInState3(updatedTask);
      renderPreview5(updatedTask);
      setStatus21(selected ? "\u5DF2\u52A0\u5165\u7CBE\u9009" : "\u5DF2\u53D6\u6D88\u7CBE\u9009", "ok");
    } catch (error) {
      setStatus21(error instanceof Error ? error.message : "\u7CBE\u9009\u72B6\u6001\u66F4\u65B0\u5931\u8D25", "error");
    }
  }
  function openDeleteUnselectedOutputsConfirm(button) {
    const taskId = button.dataset.deleteUnselectedTaskId || state29.previewTask?.task_id || state29.selectedTaskId || "";
    const task = state29.tasks.find((item) => String(item.task_id) === String(taskId)) || state29.previewTask;
    const selectedCount = taskSelectedOutputUrls(task).length;
    const totalCount = taskOutputUrls3(task).length;
    const deleteCount = Math.max(0, totalCount - selectedCount);
    if (!task?.task_id || selectedCount <= 0 || deleteCount <= 0) {
      setStatus21("\u6CA1\u6709\u53EF\u5220\u9664\u7684\u672A\u7CBE\u9009\u56FE\u7247", "error");
      return;
    }
    openConfirmPopover6(button, {
      title: "\u5220\u9664\u672A\u7CBE\u9009\u56FE\u7247\uFF1F",
      message: "\u4F1A\u5220\u9664\u5F53\u524D\u4EFB\u52A1\u91CC\u672A\u7CBE\u9009\u7684\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002",
      detail: `\u4FDD\u7559 ${selectedCount} \u5F20\uFF0C\u5220\u9664 ${deleteCount} \u5F20`,
      confirmText: "\u5220\u9664",
      onConfirm: async () => {
        await deleteUnselectedOutputs(task.task_id);
      }
    });
  }
  async function deleteUnselectedOutputs(taskId) {
    closePromptPopover7();
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/outputs/delete-unselected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "\u5220\u9664\u672A\u7CBE\u9009\u5931\u8D25");
      const updatedTask = data.task;
      updateTaskInState3(updatedTask);
      state29.selectedTaskId = updatedTask.task_id;
      renderTasks7();
      renderPreview5(updatedTask);
      setStatus21("\u672A\u7CBE\u9009\u56FE\u7247\u5DF2\u5220\u9664", "ok");
    } catch (error) {
      setStatus21(error instanceof Error ? error.message : "\u5220\u9664\u672A\u7CBE\u9009\u5931\u8D25", "error");
    }
  }
  function outputDownloadFilename(task, url, index) {
    return outputFilenameFromUrl(url) || `${safeDownloadStem(task?.task_id || "image")}-image-${taskOutputIndex2(task, url, index)}.png`;
  }
  function outputFilenameFromUrl(url) {
    try {
      const parsed = new URL(String(url || ""), window.location.origin);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || "");
    } catch {
      const clean = (String(url || "").split("?")[0] || "").split("#")[0] || "";
      const parts = clean.split("/").filter(Boolean);
      try {
        return decodeURIComponent(parts[parts.length - 1] || "");
      } catch {
        return parts[parts.length - 1] || "";
      }
    }
  }
  function safeDownloadStem(value) {
    return String(value || "image").replace(/[^\w.-]+/g, "-") || "image";
  }
  function clearPreviewGridLayout() {
    if (!els38.previewGrid) return;
    els38.previewGrid.classList.remove("multi-output");
    [...els38.previewGrid.classList].forEach((className) => {
      if (className.startsWith("preview-count-") || className.startsWith("preview-orientation-")) {
        els38.previewGrid.classList.remove(className);
      }
    });
  }
  function applyPreviewGridLayout(outputCount, itemCount) {
    const previousOrientationClass = currentPreviewOrientationClass();
    clearPreviewGridLayout();
    if (!els38.previewGrid) return;
    els38.previewGrid.classList.toggle("multi-output", itemCount > 1);
    els38.previewGrid.classList.add(`preview-count-${outputCount}`);
    els38.previewGrid.classList.add(previousOrientationClass || "preview-orientation-unknown");
  }
  function currentPreviewOrientationClass() {
    if (!els38.previewGrid) return "";
    return [...els38.previewGrid.classList].find((className) => className.startsWith("preview-orientation-")) || "";
  }
  function syncPreviewImageOrientation() {
    if (!els38.previewGrid) return;
    const images = [...els38.previewGrid.querySelectorAll("[data-lightbox-url]")];
    const loadedImages = images.filter((image) => image.naturalWidth > 0 && image.naturalHeight > 0);
    if (!loadedImages.length) return;
    const portraitCount = loadedImages.filter((image) => image.naturalHeight > image.naturalWidth).length;
    const landscapeCount = loadedImages.filter((image) => image.naturalWidth > image.naturalHeight).length;
    const orientation = portraitCount > landscapeCount ? "portrait" : landscapeCount > portraitCount ? "landscape" : "square";
    els38.previewGrid.classList.remove("preview-orientation-unknown", "preview-orientation-portrait", "preview-orientation-landscape", "preview-orientation-square");
    els38.previewGrid.classList.add(`preview-orientation-${orientation}`);
  }
  function promptPopoverData(task, index) {
    const originalPrompt = task.prompt || task.prompt_for_model || "";
    const submittedPrompt = task.prompt_for_model || originalPrompt || "";
    const optimizedPrompt = task.revised_prompts?.[index] || task.revised_prompt || "";
    return { originalPrompt, submittedPrompt, optimizedPrompt };
  }
  function runningProgressCard(task, visibleOutputCount) {
    const elapsed = elapsedTimerSpan2("running", taskProgressStartValue3(task));
    const generated = taskGeneratedCount2(task, visibleOutputCount);
    const total = taskTotalCount2(task);
    const size = escapeHtml20(task.params?.size || currentSize2());
    const retryState = taskRetryStateText4(task);
    const retryStateHtml = retryState ? `<p data-preview-retry-state>${escapeHtml20(retryState)}</p>` : "";
    const failureNotice = runningFailureNotice(task);
    return `
    <div class="running-progress-card">
      <div class="waiting-spinner" aria-hidden="true"></div>
      <div>
        <strong>\u7EE7\u7EED\u751F\u6210\u4E2D</strong>
        <p class="elapsed-line">\u5DF2\u5B8C\u6210 ${generated} / ${total} \xB7 \u8BA1\u65F6 ${elapsed}</p>
        <p class="elapsed-meta">${size}</p>
        ${retryStateHtml}
        ${failureNotice}
      </div>
      <div class="waiting-bar"><span></span></div>
    </div>
  `;
  }
  function waitingProgressCard(task, visibleOutputCount) {
    const elapsedFrom = task.queued_at || task.updated_at || task.created_at;
    const elapsed = elapsedTimerSpan2("waiting", elapsedFrom);
    const generated = taskGeneratedCount2(task, visibleOutputCount);
    const total = taskTotalCount2(task);
    const size = escapeHtml20(task.params?.size || currentSize2());
    const retryReason = task.last_error ? `<p>\u4E0A\u6B21\u9519\u8BEF\uFF1A${escapeHtml20(task.last_error)}</p>` : "";
    const retryState = taskRetryStateText4(task);
    const retryStateHtml = retryState ? `<p data-preview-retry-state>${escapeHtml20(retryState)}</p>` : "";
    return `
    <div class="running-progress-card waiting-progress-card">
      <div class="waiting-spinner" aria-hidden="true"></div>
      <div>
        <strong>\u7B49\u5F85\u7EE7\u7EED\u751F\u6210</strong>
        <p class="elapsed-line">\u5DF2\u5B8C\u6210 ${generated} / ${total} \xB7 \u8BA1\u65F6 ${elapsed}</p>
        <p class="elapsed-meta">${size}</p>
        ${retryStateHtml}
        ${retryReason}
      </div>
      <div class="waiting-bar"><span></span></div>
    </div>
  `;
  }
  function failureSummaryCard(task, visibleOutputCount) {
    const generated = taskGeneratedCount2(task, visibleOutputCount);
    const failed = Number.parseInt(task?.failed_count ?? "", 10);
    const failedCount = Number.isNaN(failed) ? Math.max(0, taskTotalCount2(task) - generated) : failed;
    const total = taskTotalCount2(task);
    const message = escapeHtml20(taskFailureMessage3(task) || "\u90E8\u5206\u56FE\u7247\u751F\u6210\u5931\u8D25");
    const retryState = taskRetryStateText4(task);
    const retryStateHtml = retryState ? `<p data-preview-retry-state>${escapeHtml20(retryState)}</p>` : "";
    return `
    <div class="failure-summary-card">
      <strong>${task.status === "partial_failed" ? "\u90E8\u5206\u56FE\u7247\u751F\u6210\u5931\u8D25" : "\u4EFB\u52A1\u5931\u8D25"}</strong>
      <p>\u5DF2\u5B8C\u6210 ${generated} / ${total} \xB7 \u5931\u8D25 ${failedCount}</p>
      ${retryStateHtml}
      <p>${message}</p>
      ${retryFailureSummaryButton(task)}
    </div>
  `;
  }
  function retryFailureSummaryButton(task) {
    const taskId = escapeHtml20(task.task_id || "");
    const actions = [];
    if (canRetryFailedTask3(task)) {
      actions.push(`<button class="ghost-button text-sm" type="button" data-preview-retry-failed-task-id="${taskId}">\u4EC5\u91CD\u8BD5\u5931\u8D25\u56FE\u7247</button>`);
    }
    if (canAcceptTaskSuccesses3(task)) {
      actions.push(`<button class="ghost-button text-sm" type="button" data-preview-accept-successes-task-id="${taskId}">\u63A5\u53D7\u5DF2\u6210\u529F\u7ED3\u679C</button>`);
    }
    if (!actions.length) return "";
    return `
    <div class="failure-summary-actions">
      ${actions.join("")}
    </div>
  `;
  }
  function renderRunningPreview(task) {
    clearPreviewGridLayout();
    const elapsed = elapsedTimerSpan2("running", taskProgressStartValue3(task));
    const size = escapeHtml20(task.params?.size || currentSize2());
    const modeLabel = task.mode === "edit" ? "\u7F16\u8F91" : "\u751F\u6210";
    const retryState = taskRetryStateText4(task);
    const retryStateHtml = retryState ? `<p data-preview-retry-state>${escapeHtml20(retryState)}</p>` : "";
    const failureNotice = runningFailureNotice(task);
    els38.previewGrid.innerHTML = `
    <div class="waiting-preview">
      <div class="waiting-spinner" aria-hidden="true"></div>
      <div>
        <strong>${modeLabel}\u4EFB\u52A1\u8FD0\u884C\u4E2D</strong>
        <p class="elapsed-line">\u8BA1\u65F6 ${elapsed}</p>
        <p class="elapsed-meta">${size}</p>
        ${retryStateHtml}
        ${failureNotice}
      </div>
      <div class="waiting-bar"><span></span></div>
    </div>
  `;
  }
  function renderWaitingPreview(task) {
    clearPreviewGridLayout();
    const submitting = task.status === "submitting";
    const elapsedFrom = task.started_at || task.queued_at || task.created_at;
    const elapsed = elapsedTimerSpan2("waiting", elapsedFrom);
    const size = escapeHtml20(task.params?.size || currentSize2());
    const title = submitting ? "\u63D0\u4EA4\u4EFB\u52A1\u4E2D" : "\u4EFB\u52A1\u6392\u961F\u4E2D";
    const detail = submitting ? "\u6B63\u5728\u4FDD\u5B58\u8F93\u5165\u5E76\u5199\u5165\u961F\u5217\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u8FDB\u5165\u751F\u6210\u6D41\u7A0B\u3002" : "\u4EFB\u52A1\u5DF2\u8FDB\u5165\u961F\u5217\uFF0C\u7B49\u5F85\u53EF\u7528\u901A\u9053\u63A5\u624B\u3002";
    const retryReason = !submitting && task.last_error ? `<p>\u4E0A\u6B21\u9519\u8BEF\uFF1A${escapeHtml20(task.last_error)}</p>` : "";
    const retryState = taskRetryStateText4(task);
    const retryStateHtml = retryState ? `<p data-preview-retry-state>${escapeHtml20(retryState)}</p>` : "";
    els38.previewGrid.innerHTML = `
    <div class="waiting-preview">
      <div class="waiting-spinner" aria-hidden="true"></div>
      <div>
        <strong>${title}</strong>
        <p class="elapsed-line">\u8BA1\u65F6 ${elapsed}</p>
        <p class="elapsed-meta">${size}</p>
        ${retryStateHtml}
        <p>${detail}</p>
        ${retryReason}
      </div>
      <div class="waiting-bar"><span></span></div>
    </div>
  `;
  }
  function initTaskPreviewFeature() {
    els38.deleteUnselectedOutputsButton?.addEventListener("click", () => {
      openDeleteUnselectedOutputsConfirm(els38.deleteUnselectedOutputsButton);
    });
    Object.assign(getLegacyBridge().methods, {
      taskRequestPreviewPayload,
      renderPreview: renderPreview5,
      previewStructureKey,
      previewPromptKey,
      renderOutputPreview,
      bindPreviewRetryButtons,
      updatePreviewDownloadActions,
      updatePreviewSelectionActions,
      taskSelectedOutputUrls,
      taskSelectedOutputDownloadUrl,
      taskSelectedOutputDownloadName,
      taskOutputZipUrl,
      updateTaskOutputSelection,
      openDeleteUnselectedOutputsConfirm,
      deleteUnselectedOutputs,
      outputDownloadFilename,
      outputFilenameFromUrl,
      retryFailureSummaryButton
    });
  }

  // codex_image/webui/frontend/src/tasks.ts
  var bridge36 = getLegacyBridge();
  var state30 = bridge36.state;
  var els39 = bridge36.els;
  function legacyMethod40(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  var updateTaskInState4 = (...args) => legacyMethod40("updateTaskInState", ...args);
  var cleanupSessionSelections2 = (...args) => legacyMethod40("cleanupSessionSelections", ...args);
  var renderTasks8 = (...args) => legacyMethod40("renderTasks", ...args);
  var renderArchiveButton4 = (...args) => legacyMethod40("renderArchiveButton", ...args);
  var renderArchiveModal4 = (...args) => legacyMethod40("renderArchiveModal", ...args);
  var renderPreview6 = (...args) => legacyMethod40("renderPreview", ...args);
  var migrateLegacyArchivedTasks2 = (...args) => legacyMethod40("migrateLegacyArchivedTasks", ...args);
  var revokeTaskUploadPreviewUrls3 = (...args) => legacyMethod40("revokeTaskUploadPreviewUrls", ...args);
  var taskHasViewableUpdate2 = (...args) => legacyMethod40("taskHasViewableUpdate", ...args);
  var markTaskViewed2 = (...args) => legacyMethod40("markTaskViewed", ...args);
  async function refreshTasks({ migrateLegacyArchives = false } = {}) {
    const requestSeq = ++state30.tasksRequestSeq;
    const response = await fetch("/api/tasks");
    const data = await response.json();
    if (requestSeq !== state30.tasksRequestSeq) return;
    await applyTasksSnapshot(data.tasks || [], { migrateLegacyArchives, requestSeq });
  }
  async function applyTasksSnapshot(tasks, { migrateLegacyArchives = false, requestSeq = state30.tasksRequestSeq } = {}) {
    const previousLocalPendingTasks = state30.tasks.filter((task) => task?.local_pending);
    const pendingTask = state30.pendingTaskId ? state30.tasks.find((task) => task.task_id === state30.pendingTaskId) : null;
    state30.tasks = Array.isArray(tasks) ? tasks : [];
    if (pendingTask?.local_pending && !state30.tasks.some((task) => task.task_id === pendingTask.task_id)) {
      state30.tasks.unshift(pendingTask);
    }
    const retainedTasks = new Set(state30.tasks);
    previousLocalPendingTasks.forEach((task) => {
      if (!retainedTasks.has(task)) revokeTaskUploadPreviewUrls3(task);
    });
    if (migrateLegacyArchives) {
      await migrateLegacyArchivedTasks2();
      if (requestSeq !== state30.tasksRequestSeq) return;
    }
    cleanupSessionSelections2();
    renderTasks8();
    renderArchiveButton4();
    renderArchiveModal4();
    renderPreview6();
  }
  function applyTaskUpdate(task) {
    if (!updateTaskInState4(task)) return;
    if (String(task.task_id) === String(state30.selectedTaskId) && taskHasViewableUpdate2(task)) {
      void markTaskViewed2(task.task_id);
    }
    cleanupSessionSelections2();
    renderTasks8();
    renderArchiveButton4();
    renderArchiveModal4();
    renderPreview6();
  }
  function initTaskFeature() {
    Object.assign(getLegacyBridge().methods, {
      refreshTasks,
      applyTasksSnapshot,
      applyTaskUpdate
    });
  }

  // codex_image/webui/frontend/src/task-selection.ts
  var bridge37 = getLegacyBridge();
  var state31 = bridge37.state;
  var els40 = bridge37.els;
  var taskSelectionInitialized = false;
  function legacyMethod41(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function setStatus22(message, type) {
    legacyMethod41("setStatus", message, type);
  }
  function closePromptPopover8() {
    legacyMethod41("closePromptPopover");
  }
  function markTaskViewed3(taskId) {
    return legacyMethod41("markTaskViewed", taskId);
  }
  function applyTaskToForm3(task) {
    legacyMethod41("applyTaskToForm", task);
  }
  function updateTaskSelectionVisuals3(taskId) {
    legacyMethod41("updateTaskSelectionVisuals", taskId);
  }
  function renderPreview7(task) {
    legacyMethod41("renderPreview", task);
  }
  function taskFailureMessage4(task) {
    return legacyMethod41("taskFailureMessage", task);
  }
  function taskRequestPreviewPayload2(task) {
    return legacyMethod41("taskRequestPreviewPayload", task);
  }
  function revokeUploadPreviewUrls2(sources) {
    legacyMethod41("revokeUploadPreviewUrls", sources);
  }
  function renderImageStrip6() {
    legacyMethod41("renderImageStrip");
  }
  function updateRequestPreview12() {
    legacyMethod41("updateRequestPreview");
  }
  function taskInputUrls2(task) {
    return legacyMethod41("taskInputUrls", task);
  }
  function uploadSource2(file) {
    return legacyMethod41("uploadSource", file);
  }
  function gallerySource4(item) {
    return legacyMethod41("gallerySource", item);
  }
  function assetSource2(item) {
    return legacyMethod41("assetSource", item);
  }
  function selectedTaskInputRestoreCurrent(taskId, restoreSeq) {
    if (restoreSeq == null) return true;
    return state31.taskInputRestoreSeq === restoreSeq && String(state31.selectedTaskId) === String(taskId);
  }
  function applySelectedTaskRequestPreview(task) {
    const requestPayload = taskRequestPreviewPayload2(task);
    if (requestPayload && els40.requestJson) {
      els40.requestJson.textContent = JSON.stringify(requestPayload, null, 2);
    }
  }
  function applyTaskInputRestoreSources(sources, taskId, restoreSeq) {
    if (!selectedTaskInputRestoreCurrent(taskId, restoreSeq)) {
      revokeUploadPreviewUrls2(sources);
      return false;
    }
    revokeUploadPreviewUrls2(state31.images);
    state31.images = sources.filter(Boolean);
    renderImageStrip6();
    updateRequestPreview12();
    return true;
  }
  function renderSelectedTask(task, taskId) {
    applySelectedTaskRequestPreview(task);
    updateTaskSelectionVisuals3(taskId);
    renderPreview7(task);
    if (task.status === "failed") {
      setStatus22(taskFailureMessage4(task) || "\u4EFB\u52A1\u5931\u8D25", "error");
    } else if (task.status !== "running") {
      setStatus22(`\u5DF2\u8F7D\u5165\u4EFB\u52A1 ${taskId}`, "ok");
    }
  }
  function isLegacyOutputInputUrl2(url) {
    return typeof url === "string" && /^\/outputs\/[^/]+\/inputs\//.test(url);
  }
  function historyInputCandidateUrls(sourceUrl, fallbackUrl) {
    const urls = [];
    const addUrl = (url) => {
      if (url && !urls.includes(url)) urls.push(url);
    };
    if (isLegacyOutputInputUrl2(sourceUrl)) {
      addUrl(fallbackUrl);
      addUrl(sourceUrl);
    } else {
      addUrl(sourceUrl);
      addUrl(fallbackUrl);
    }
    return urls;
  }
  async function fetchHistoryInputBlob(candidateUrls, sourceUrl) {
    for (const url of candidateUrls) {
      const response = await fetch(url);
      if (response.ok) {
        return response.blob();
      }
    }
    throw new Error(`\u65E0\u6CD5\u8F7D\u5165\u5386\u53F2\u8F93\u5165\u56FE: ${candidateUrls[0] || sourceUrl}`);
  }
  async function restoreTaskInputs(task, options = {}) {
    const taskId = options.taskId ?? task?.task_id;
    const restoreSeq = options.restoreSeq;
    if (Array.isArray(task.local_input_files)) {
      return applyTaskInputRestoreSources(task.local_input_files.slice(), taskId, restoreSeq);
    }
    if (Array.isArray(task.input_sources) && task.input_sources.length) {
      const restoredSources = [];
      const inputUrls = taskInputUrls2(task);
      const inputNames2 = Array.isArray(task.input_files) ? task.input_files : [];
      let uploadInputIndex = 0;
      const uploadSources = task.input_sources.filter((source) => source?.kind === "upload" && source.image_url);
      if (uploadSources.length && selectedTaskInputRestoreCurrent(taskId, restoreSeq)) {
        setStatus22("\u6B63\u5728\u8F7D\u5165\u5386\u53F2\u8F93\u5165\u56FE...", "");
      }
      try {
        for (const [index, source] of task.input_sources.entries()) {
          if (!selectedTaskInputRestoreCurrent(taskId, restoreSeq)) {
            revokeUploadPreviewUrls2(restoredSources);
            return false;
          }
          if (source.kind === "gallery") {
            restoredSources.push(gallerySource4(source));
          } else if (source.kind === "asset") {
            restoredSources.push(assetSource2(source));
          } else if (source.kind === "upload" && source.image_url) {
            const fallbackUrl = inputUrls[uploadInputIndex];
            const fallbackFileName = inputNames2[uploadInputIndex];
            uploadInputIndex += 1;
            const candidateUrls = historyInputCandidateUrls(source.image_url, fallbackUrl);
            const blob = await fetchHistoryInputBlob(candidateUrls, source.image_url);
            const fallbackName = `history-input-${index + 1}`;
            restoredSources.push(uploadSource2(new File([blob], source.filename || source.name || fallbackFileName || fallbackName, { type: blob.type || "application/octet-stream" })));
          } else {
            restoredSources.push(source);
          }
        }
      } catch (error) {
        revokeUploadPreviewUrls2(restoredSources);
        throw error;
      }
      return applyTaskInputRestoreSources(restoredSources, taskId, restoreSeq);
    }
    const urls = taskInputUrls2(task);
    const gallerySources = Array.isArray(task.gallery_refs) ? task.gallery_refs.map((ref) => gallerySource4(ref)) : [];
    if (!urls.length) {
      return applyTaskInputRestoreSources(gallerySources, taskId, restoreSeq);
    }
    if (selectedTaskInputRestoreCurrent(taskId, restoreSeq)) {
      setStatus22("\u6B63\u5728\u8F7D\u5165\u5386\u53F2\u8F93\u5165\u56FE...", "");
    }
    const inputNames = Array.isArray(task.input_files) ? task.input_files : [];
    const files = [];
    try {
      for (const [index, url] of urls.entries()) {
        if (!selectedTaskInputRestoreCurrent(taskId, restoreSeq)) {
          revokeUploadPreviewUrls2(files);
          return false;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`\u65E0\u6CD5\u8F7D\u5165\u5386\u53F2\u8F93\u5165\u56FE: ${url}`);
        }
        const blob = await response.blob();
        const fallbackName = `history-input-${index + 1}`;
        files.push(uploadSource2(new File([blob], inputNames[index] || fallbackName, { type: blob.type || "application/octet-stream" })));
      }
    } catch (error) {
      revokeUploadPreviewUrls2(files);
      throw error;
    }
    return applyTaskInputRestoreSources([...files, ...gallerySources], taskId, restoreSeq);
  }
  async function selectTask2(taskId) {
    closePromptPopover8();
    state31.selectedTaskId = taskId;
    const task = state31.tasks.find((item) => String(item.task_id) === String(taskId));
    if (!task) return;
    const restoreSeq = ++state31.taskInputRestoreSeq;
    void markTaskViewed3(taskId);
    applyTaskToForm3(task);
    renderSelectedTask(task, taskId);
    try {
      await restoreTaskInputs(task, { taskId, restoreSeq });
    } catch (error) {
      if (!selectedTaskInputRestoreCurrent(taskId, restoreSeq)) return;
      revokeUploadPreviewUrls2(state31.images);
      state31.images = [];
      renderImageStrip6();
      setStatus22(error.message, "error");
      return;
    }
    if (!selectedTaskInputRestoreCurrent(taskId, restoreSeq)) return;
    applySelectedTaskRequestPreview(task);
    if (task.status !== "running") renderSelectedTask(task, taskId);
  }
  function initTaskSelectionFeature() {
    if (taskSelectionInitialized) return;
    taskSelectionInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      selectTask: selectTask2
    });
  }

  // codex_image/webui/frontend/src/overlay-popovers.ts
  var bridge38 = getLegacyBridge();
  var els41 = bridge38.els;
  var overlayPopoversInitialized = false;
  var overlayPopoverEventsBound = false;
  var confirmPopoverEl = null;
  var confirmPopoverState = {
    anchor: null,
    onConfirm: null
  };
  var promptPopoverEl = null;
  var promptPopoverState = {
    optimizedPrompt: "",
    copyTimerId: null
  };
  function legacyMethod42(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function escapeHtml21(value) {
    return legacyMethod42("escapeHtml", value);
  }
  function closeGalleryEditPopover4() {
    legacyMethod42("closeGalleryEditPopover");
  }
  function handlePromptDocumentClick2(event) {
    legacyMethod42("handlePromptDocumentClick", event);
  }
  function handleGalleryDocumentClick2(event) {
    legacyMethod42("handleGalleryDocumentClick", event);
  }
  function closeCompressionPopover2() {
    legacyMethod42("closeCompressionPopover");
  }
  function handleImageEditorHistoryShortcut2(event) {
    return legacyMethod42("handleImageEditorHistoryShortcut", event);
  }
  function hideMentionSuggest4() {
    legacyMethod42("hideMentionSuggest");
  }
  function hideColorSuggest5() {
    legacyMethod42("hideColorSuggest");
  }
  function hidePromptSnippetSuggest4() {
    legacyMethod42("hidePromptSnippetSuggest");
  }
  function hidePromptSnippetSelectionButton4() {
    legacyMethod42("hidePromptSnippetSelectionButton");
  }
  function closePromptSnippetPopover4() {
    legacyMethod42("closePromptSnippetPopover");
  }
  function closeArchiveModal3() {
    legacyMethod42("closeArchiveModal");
  }
  function closeImageEditor2() {
    legacyMethod42("closeImageEditor");
  }
  function closeGallery3() {
    legacyMethod42("closeGallery");
  }
  function closeApiSettingsModal2() {
    legacyMethod42("closeApiSettingsModal");
  }
  function closeAccountQuotaDrawer2() {
    legacyMethod42("closeAccountQuotaDrawer");
  }
  function closePromptTemplateDrawer2() {
    legacyMethod42("closePromptTemplateDrawer");
  }
  function bindOverlayPopoverEvents() {
    if (overlayPopoverEventsBound) return;
    overlayPopoverEventsBound = true;
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
  }
  function ensureConfirmPopover() {
    if (confirmPopoverEl) return confirmPopoverEl;
    confirmPopoverEl = document.createElement("div");
    confirmPopoverEl.className = "confirm-popover hidden";
    confirmPopoverEl.setAttribute("role", "dialog");
    confirmPopoverEl.setAttribute("aria-label", "\u786E\u8BA4\u64CD\u4F5C");
    document.body.appendChild(confirmPopoverEl);
    return confirmPopoverEl;
  }
  function openConfirmPopover7(anchor, options = {}) {
    if (!anchor) return;
    const popover = ensureConfirmPopover();
    if (!popover.classList.contains("hidden") && confirmPopoverState.anchor === anchor) {
      closeConfirmPopover4();
      return;
    }
    closePromptPopover9();
    closeGalleryEditPopover4();
    confirmPopoverState.anchor = anchor;
    confirmPopoverState.onConfirm = typeof options.onConfirm === "function" ? options.onConfirm : null;
    const message = options.message ? `<p class="confirm-popover-message">${escapeHtml21(options.message)}</p>` : "";
    const detail = options.detail ? `<div class="confirm-popover-detail">${escapeHtml21(options.detail)}</div>` : "";
    const confirmText = options.confirmText || "\u786E\u8BA4";
    popover.innerHTML = `
    <div class="confirm-popover-title">${escapeHtml21(options.title || "\u786E\u8BA4\u64CD\u4F5C\uFF1F")}</div>
    ${message}
    ${detail}
    <div class="confirm-popover-actions">
      <button class="ghost-button text-sm" type="button" data-confirm-popover-cancel>\u53D6\u6D88</button>
      <button class="ghost-button text-sm danger-button confirm-popover-confirm" type="button" data-confirm-popover-confirm>${escapeHtml21(confirmText)}</button>
    </div>
  `;
    popover.querySelector("[data-confirm-popover-cancel]")?.addEventListener("click", closeConfirmPopover4);
    popover.querySelector("[data-confirm-popover-confirm]")?.addEventListener("click", async () => {
      const onConfirm = confirmPopoverState.onConfirm;
      closeConfirmPopover4();
      if (onConfirm) await onConfirm();
    });
    popover.classList.remove("hidden");
    positionConfirmPopover(anchor, popover);
    popover.querySelector("[data-confirm-popover-confirm]")?.focus({ preventScroll: true });
  }
  function closeConfirmPopover4() {
    if (!confirmPopoverEl) return;
    confirmPopoverEl.classList.add("hidden");
    confirmPopoverState.anchor = null;
    confirmPopoverState.onConfirm = null;
  }
  function positionConfirmPopover(anchor, popover) {
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(280, Math.max(220, window.innerWidth - margin * 2));
    popover.style.width = `${width}px`;
    popover.style.left = "0px";
    popover.style.top = "0px";
    const height = popover.offsetHeight;
    const left = clampPopoverPosition2(anchorRect.right - width, margin, window.innerWidth - width - margin);
    const belowTop = anchorRect.bottom + 8;
    const top = belowTop + height <= window.innerHeight - margin ? belowTop : clampPopoverPosition2(anchorRect.top - height - 8, margin, window.innerHeight - height - margin);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  function normalizedPromptText(value) {
    return String(value || "").trim();
  }
  function promptLengthLabel(value) {
    return `${Array.from(normalizedPromptText(value)).length} \u5B57`;
  }
  function promptPopoverSection(label, text, meta, tone = "") {
    const toneClass = tone ? ` prompt-popover-section-${tone}` : "";
    return `
    <section class="prompt-popover-section${toneClass}">
      <div class="prompt-popover-section-head">
        <div class="prompt-popover-label">${escapeHtml21(label)}</div>
        <span class="prompt-popover-meta">${escapeHtml21(meta || promptLengthLabel(text))}</span>
      </div>
      <pre class="prompt-popover-text">${escapeHtml21(text || "\u65E0")}</pre>
    </section>
  `;
  }
  function submittedPromptDetails(originalPrompt, submittedPrompt) {
    if (!normalizedPromptText(submittedPrompt)) return "";
    if (normalizedPromptText(originalPrompt) === normalizedPromptText(submittedPrompt)) return "";
    return `
    <details class="prompt-popover-submitted">
      <summary>\u67E5\u770B\u5B9E\u9645\u63D0\u4EA4\u63D0\u793A\u8BCD</summary>
      <pre class="prompt-popover-submitted-text">${escapeHtml21(submittedPrompt)}</pre>
    </details>
  `;
  }
  function ensurePromptPopover() {
    if (promptPopoverEl) return promptPopoverEl;
    promptPopoverEl = document.createElement("div");
    promptPopoverEl.className = "prompt-popover hidden";
    promptPopoverEl.setAttribute("role", "dialog");
    promptPopoverEl.setAttribute("aria-label", "\u63D0\u793A\u8BCD\u5BF9\u6BD4");
    document.body.appendChild(promptPopoverEl);
    return promptPopoverEl;
  }
  function openPromptPopover2(anchor, data) {
    const popover = ensurePromptPopover();
    const originalPrompt = data.originalPrompt || data.submittedPrompt || "";
    const submittedPrompt = data.submittedPrompt || originalPrompt || "";
    const optimizedPrompt = data.optimizedPrompt || "";
    promptPopoverState.optimizedPrompt = optimizedPrompt;
    clearPromptPopoverCopyTimer();
    popover.innerHTML = `
    <div class="prompt-popover-header">
      <div>
        <strong>\u63D0\u793A\u8BCD\u5BF9\u6BD4</strong>
        <span class="prompt-popover-summary">\u539F\u59CB ${escapeHtml21(promptLengthLabel(originalPrompt))} \xB7 \u4F18\u5316 ${escapeHtml21(optimizedPrompt ? promptLengthLabel(optimizedPrompt) : "\u672A\u8FD4\u56DE")}</span>
      </div>
      <button class="prompt-popover-close" type="button" aria-label="\u5173\u95ED\u63D0\u793A\u8BCD">\xD7</button>
    </div>
    <div class="prompt-popover-body">
      <div class="prompt-popover-compare">
        ${promptPopoverSection("\u539F\u59CB\u63D0\u793A\u8BCD", originalPrompt || "\u65E0", promptLengthLabel(originalPrompt), "original")}
        ${promptPopoverSection("\u4F18\u5316\u540E\u63D0\u793A\u8BCD", optimizedPrompt || "\u672A\u8FD4\u56DE\u4F18\u5316\u63D0\u793A\u8BCD", optimizedPrompt ? promptLengthLabel(optimizedPrompt) : "\u672A\u8FD4\u56DE", optimizedPrompt ? "optimized" : "empty")}
      </div>
      ${submittedPromptDetails(originalPrompt, submittedPrompt)}
    </div>
    <div class="prompt-popover-actions">
      <button class="prompt-copy-button" type="button" data-copy-optimized-prompt ${optimizedPrompt ? "" : "disabled"}>\u590D\u5236\u4F18\u5316\u540E\u63D0\u793A\u8BCD</button>
    </div>
  `;
    popover.querySelector(".prompt-popover-close")?.addEventListener("click", closePromptPopover9);
    popover.querySelector("[data-copy-optimized-prompt]")?.addEventListener("click", (event) => {
      copyOptimizedPrompt(event.currentTarget);
    });
    popover.classList.remove("hidden");
    positionPromptPopover(anchor, popover);
  }
  function positionPromptPopover(anchor, popover) {
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(860, Math.max(360, window.innerWidth - margin * 2));
    popover.style.left = "0px";
    popover.style.top = "0px";
    popover.style.width = `${width}px`;
    const height = popover.offsetHeight;
    const left = clampPopoverPosition2(
      anchorRect.left + anchorRect.width / 2 - width / 2,
      margin,
      window.innerWidth - width - margin
    );
    const preferredTop = anchorRect.top - height - margin;
    const fallbackTop = anchorRect.bottom + margin;
    const top = preferredTop >= margin ? preferredTop : clampPopoverPosition2(fallbackTop, margin, window.innerHeight - height - margin);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  function clampPopoverPosition2(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }
  function closePromptPopover9() {
    if (!promptPopoverEl) return;
    promptPopoverEl.classList.add("hidden");
    promptPopoverState.optimizedPrompt = "";
    clearPromptPopoverCopyTimer();
  }
  function clearPromptPopoverCopyTimer() {
    if (!promptPopoverState.copyTimerId) return;
    window.clearTimeout(promptPopoverState.copyTimerId);
    promptPopoverState.copyTimerId = null;
  }
  async function copyOptimizedPrompt(button) {
    const text = promptPopoverState.optimizedPrompt;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    button.textContent = "\u5DF2\u590D\u5236";
    clearPromptPopoverCopyTimer();
    promptPopoverState.copyTimerId = window.setTimeout(() => {
      button.textContent = "\u590D\u5236\u4F18\u5316\u540E\u63D0\u793A\u8BCD";
      promptPopoverState.copyTimerId = null;
    }, 1200);
  }
  function handleDocumentClick(event) {
    const target = event.target;
    handlePromptDocumentClick2(event);
    if (promptPopoverEl && !promptPopoverEl.classList.contains("hidden")) {
      const clickedPopover = promptPopoverEl.contains(target);
      const clickedPromptButton = target.closest?.("[data-prompt-popover-index]");
      if (!clickedPopover && !clickedPromptButton) {
        closePromptPopover9();
      }
    }
    handleGalleryDocumentClick2(event);
    if (confirmPopoverEl && !confirmPopoverEl.classList.contains("hidden")) {
      const clickedPopover = confirmPopoverEl.contains(target);
      const clickedAnchor = confirmPopoverState.anchor?.contains?.(target);
      if (!clickedPopover && !clickedAnchor) {
        closeConfirmPopover4();
      }
    }
    if (!els41.compressionPopover || els41.compressionPopover.classList.contains("hidden")) return;
    if (els41.compressionPopover.contains(target) || els41.outputFormatField?.contains(target)) return;
    closeCompressionPopover2();
  }
  function handleDocumentKeydown(event) {
    if (handleImageEditorHistoryShortcut2(event)) return;
    if (event.key === "Escape") {
      hideMentionSuggest4();
      hideColorSuggest5();
      hidePromptSnippetSuggest4();
      hidePromptSnippetSelectionButton4();
      closeCompressionPopover2();
      closePromptPopover9();
      closePromptSnippetPopover4();
      closeGalleryEditPopover4();
      closeConfirmPopover4();
      closeArchiveModal3();
      closeImageEditor2();
      closeGallery3();
      closeApiSettingsModal2();
      closeAccountQuotaDrawer2();
      closePromptTemplateDrawer2();
    }
  }
  function initOverlayPopoversFeature() {
    if (overlayPopoversInitialized) return;
    overlayPopoversInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      bindOverlayPopoverEvents,
      ensureConfirmPopover,
      openConfirmPopover: openConfirmPopover7,
      closeConfirmPopover: closeConfirmPopover4,
      positionConfirmPopover,
      promptPopoverSection,
      ensurePromptPopover,
      openPromptPopover: openPromptPopover2,
      positionPromptPopover,
      clampPopoverPosition: clampPopoverPosition2,
      closePromptPopover: closePromptPopover9,
      clearPromptPopoverCopyTimer,
      copyOptimizedPrompt,
      handleDocumentClick,
      handleDocumentKeydown
    });
  }

  // codex_image/webui/frontend/src/shell-ui.ts
  var THEME_STORAGE_KEY = "codex-image-theme-preference";
  var THEME_OPTIONS = /* @__PURE__ */ new Set(["system", "light", "dark"]);
  var SIDEBAR_WIDTH_STORAGE_KEY = "codex-image-sidebar-width";
  var SIDEBAR_MIN_WIDTH = 280;
  var SIDEBAR_MAX_WIDTH = 520;
  var bridge39 = getLegacyBridge();
  var state32 = bridge39.state;
  var els42 = bridge39.els;
  var shellUiInitialized = false;
  var shellUiEventsBound = false;
  var previewPanelHeightFrameId = null;
  function legacyMethod43(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy method " + name + " is not initialized");
    }
    return method(...args);
  }
  function formatTaskStatus4(task) {
    return legacyMethod43("formatTaskStatus", task);
  }
  function closePromptPopover10() {
    legacyMethod43("closePromptPopover");
  }
  function closePromptSnippetPopover5() {
    legacyMethod43("closePromptSnippetPopover");
  }
  function closeArchiveModal4() {
    legacyMethod43("closeArchiveModal");
  }
  function closeGallery4() {
    legacyMethod43("closeGallery");
  }
  function closeImageEditor3() {
    legacyMethod43("closeImageEditor");
  }
  function revokeUploadPreviewUrls3(sources) {
    legacyMethod43("revokeUploadPreviewUrls", sources);
  }
  function finishBatchMarqueeSelection2() {
    legacyMethod43("finishBatchMarqueeSelection");
  }
  function setPromptText3(value) {
    legacyMethod43("setPromptText", value);
  }
  function setMode6(mode) {
    legacyMethod43("setMode", mode);
  }
  function updateSizeFromPreset2() {
    legacyMethod43("updateSizeFromPreset");
  }
  function updatePromptCount7() {
    legacyMethod43("updatePromptCount");
  }
  function updateQuantity3() {
    legacyMethod43("updateQuantity");
  }
  function updateCompression3() {
    legacyMethod43("updateCompression");
  }
  function renderImageStrip7() {
    legacyMethod43("renderImageStrip");
  }
  function renderTasks9() {
    legacyMethod43("renderTasks");
  }
  function renderPreview8() {
    legacyMethod43("renderPreview");
  }
  function updateRequestPreview13() {
    legacyMethod43("updateRequestPreview");
  }
  function bindShellUiEvents() {
    if (shellUiEventsBound) return;
    shellUiEventsBound = true;
    els42.themeSwitcher?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-option]");
      if (!button) return;
      applyThemePreference(button.dataset.themeOption || "system");
    });
    state32.themeSystemQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    state32.themeSystemQuery?.addEventListener?.("change", handleThemeSystemChange);
    if (els42.copyJsonButton) {
      els42.copyJsonButton.addEventListener("click", copyJson);
    }
    els42.newTaskButton?.addEventListener("click", resetForm);
    els42.sidebarResizeHandle?.addEventListener("pointerdown", startSidebarResize);
    els42.sidebarResizeHandle?.addEventListener("keydown", handleSidebarResizeKeydown);
  }
  function normalizeThemePreference(value) {
    return THEME_OPTIONS.has(value) ? value : "system";
  }
  function resolveEffectiveTheme(preference = state32.themePreference) {
    if (preference === "dark" || preference === "light") return preference;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }
  function updateThemeSwitcher() {
    els42.themeSwitcher?.querySelectorAll("[data-theme-option]").forEach((button) => {
      const active = button.dataset.themeOption === state32.themePreference;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  function applyThemePreference(preference, { persist = true } = {}) {
    state32.themePreference = normalizeThemePreference(preference);
    const effectiveTheme = resolveEffectiveTheme(state32.themePreference);
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themePreference = state32.themePreference;
    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, state32.themePreference);
      } catch {
      }
    }
    updateThemeSwitcher();
  }
  function restoreThemePreference() {
    let saved = "system";
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY) || "system";
    } catch {
      saved = "system";
    }
    applyThemePreference(saved, { persist: false });
  }
  function handleThemeSystemChange() {
    if (state32.themePreference === "system") {
      applyThemePreference("system", { persist: false });
    }
  }
  function restoreSidebarWidth() {
    try {
      const saved = Number.parseInt(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || "", 10);
      if (!Number.isNaN(saved)) {
        applySidebarWidth(saved, { persist: false });
      }
    } catch {
    }
  }
  function sidebarMaxWidth() {
    const viewportWidth = window.innerWidth || SIDEBAR_MAX_WIDTH;
    if (viewportWidth <= 1024) return viewportWidth;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - 760));
  }
  function clampSidebarWidth(value) {
    const width = Number.parseInt(value, 10);
    if (Number.isNaN(width)) return SIDEBAR_MIN_WIDTH;
    return Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, width));
  }
  function applySidebarWidth(width, { persist = true } = {}) {
    const nextWidth = clampSidebarWidth(width);
    document.documentElement.style.setProperty("--sidebar-width", `${nextWidth}px`);
    if (persist) {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
      } catch {
      }
    }
    schedulePreviewPanelHeightSync();
  }
  function startSidebarResize(event) {
    if (!els42.sidebar || event.button !== 0) return;
    event.preventDefault();
    const currentWidth = els42.sidebar.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;
    state32.sidebarResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: currentWidth
    };
    els42.sidebar.classList.add("resizing");
    document.body.classList.add("sidebar-resizing");
    els42.sidebarResizeHandle?.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", updateSidebarResize);
    window.addEventListener("pointerup", finishSidebarResize);
    window.addEventListener("pointercancel", finishSidebarResize);
  }
  function updateSidebarResize(event) {
    const resize = state32.sidebarResize;
    if (!resize || event.pointerId !== resize.pointerId) return;
    applySidebarWidth(resize.startWidth + event.clientX - resize.startX, { persist: false });
  }
  function finishSidebarResize(event) {
    const resize = state32.sidebarResize;
    if (!resize || event.pointerId !== resize.pointerId) return;
    const currentWidth = els42.sidebar?.getBoundingClientRect().width || resize.startWidth;
    applySidebarWidth(currentWidth, { persist: true });
    state32.sidebarResize = null;
    els42.sidebar?.classList.remove("resizing");
    document.body.classList.remove("sidebar-resizing");
    els42.sidebarResizeHandle?.releasePointerCapture?.(event.pointerId);
    window.removeEventListener("pointermove", updateSidebarResize);
    window.removeEventListener("pointerup", finishSidebarResize);
    window.removeEventListener("pointercancel", finishSidebarResize);
  }
  function handleSidebarResizeKeydown(event) {
    if (!els42.sidebar) return;
    const step = event.shiftKey ? 32 : 16;
    const currentWidth = els42.sidebar.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySidebarWidth(currentWidth - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applySidebarWidth(currentWidth + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  }
  function setupPreviewPanelHeightSync() {
    if (!els42.controlsCol || !els42.previewCol || !els42.previewPanel) return;
    window.addEventListener("resize", schedulePreviewPanelHeightSync);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(schedulePreviewPanelHeightSync);
      observer.observe(els42.controlsCol);
      els42.controlsCol.querySelectorAll(":scope > .panel").forEach((panel) => observer.observe(panel));
    }
    schedulePreviewPanelHeightSync();
  }
  function schedulePreviewPanelHeightSync() {
    if (previewPanelHeightFrameId !== null) {
      window.cancelAnimationFrame(previewPanelHeightFrameId);
    }
    previewPanelHeightFrameId = window.requestAnimationFrame(() => {
      previewPanelHeightFrameId = null;
      syncPreviewPanelHeight();
    });
  }
  function syncPreviewPanelHeight() {
    if (!els42.controlsCol || !els42.previewCol || !els42.previewPanel) return;
    if (window.matchMedia("(max-width: 1024px)").matches) {
      els42.previewCol.style.removeProperty("--controls-col-height");
      els42.previewPanel.style.removeProperty("--controls-col-height");
      return;
    }
    const panels = [...els42.controlsCol.querySelectorAll(":scope > .panel")];
    if (!panels.length) return;
    const firstPanelRect = panels[0].getBoundingClientRect();
    const lastPanelRect = panels[panels.length - 1].getBoundingClientRect();
    const height = Math.max(260, Math.ceil(lastPanelRect.bottom - firstPanelRect.top));
    els42.previewCol.style.setProperty("--controls-col-height", `${height}px`);
    els42.previewPanel.style.setProperty("--controls-col-height", `${height}px`);
  }
  function updateDocumentTitle2() {
    const summary = state32.queue.summary || {};
    const waitingCount = Number(summary.waiting_count ?? state32.queue.waiting.length ?? 0);
    const runningCount = Number(summary.running_count ?? state32.queue.running.length ?? 0);
    const total = waitingCount + runningCount;
    let status = "";
    if (runningCount > 0) {
      status = `\u751F\u6210\u4E2D \xB7 \u961F\u5217 ${total}`;
    } else if (waitingCount > 0) {
      status = `\u6392\u961F\u4E2D \xB7 \u7B49\u5F85 ${waitingCount}`;
    } else {
      const selected = state32.tasks.find((item) => String(item.task_id) === String(state32.selectedTaskId));
      status = selected ? formatTaskStatus4(selected) : "";
    }
    document.title = status ? `${status} \xB7 ${getLegacyBridge().constants.defaultDocumentTitle}` : getLegacyBridge().constants.defaultDocumentTitle;
  }
  function setStatus23(message, type) {
    if (!els42.statusText) return;
    els42.statusText.textContent = message;
    els42.statusText.className = `status-text ${type || ""}`;
  }
  function resetForm() {
    closePromptPopover10();
    closePromptSnippetPopover5();
    closeArchiveModal4();
    closeGallery4();
    closeImageEditor3();
    state32.selectedTaskId = null;
    state32.mode = "generate";
    revokeUploadPreviewUrls3(state32.images);
    state32.images = [];
    state32.batchMode = false;
    state32.batchSelectedTaskIds = [];
    finishBatchMarqueeSelection2();
    setPromptText3("");
    if (els42.customSizeToggle) els42.customSizeToggle.checked = false;
    if (els42.nInput) els42.nInput.value = "1";
    if (els42.resolution) els42.resolution.value = "standard";
    if (els42.ratio) els42.ratio.value = "1:1";
    if (els42.orientation) els42.orientation.value = "square";
    els42.size.value = "1024x1024";
    els42.quality.value = "auto";
    els42.outputFormat.value = "png";
    els42.moderation.value = "auto";
    els42.compression.value = "80";
    if (els42.promptFidelity) els42.promptFidelity.value = "strict";
    [els42.nInput, els42.resolution, els42.ratio, els42.orientation, els42.quality, els42.outputFormat, els42.moderation, els42.promptFidelity].forEach((sel) => {
      if (sel) sel.dispatchEvent(new Event("change"));
    });
    setMode6("generate");
    updateSizeFromPreset2();
    updatePromptCount7();
    updateQuantity3();
    updateCompression3();
    renderImageStrip7();
    renderTasks9();
    renderPreview8();
    updateRequestPreview13();
    setStatus23("\u7B49\u5F85\u4EFB\u52A1", "");
  }
  async function copyJson() {
    if (!els42.requestJson) return;
    await navigator.clipboard.writeText(els42.requestJson.textContent);
    setStatus23("JSON \u5DF2\u590D\u5236", "ok");
  }
  function initShellUiFeature() {
    if (shellUiInitialized) return;
    shellUiInitialized = true;
    Object.assign(getLegacyBridge().methods, {
      bindShellUiEvents,
      normalizeThemePreference,
      resolveEffectiveTheme,
      updateThemeSwitcher,
      applyThemePreference,
      restoreThemePreference,
      handleThemeSystemChange,
      restoreSidebarWidth,
      sidebarMaxWidth,
      clampSidebarWidth,
      applySidebarWidth,
      startSidebarResize,
      updateSidebarResize,
      finishSidebarResize,
      handleSidebarResizeKeydown,
      setupPreviewPanelHeightSync,
      schedulePreviewPanelHeightSync,
      syncPreviewPanelHeight,
      updateDocumentTitle: updateDocumentTitle2,
      setStatus: setStatus23,
      resetForm,
      copyJson
    });
  }

  // codex_image/webui/frontend/src/lightbox.ts
  var lightboxFeatureInitialized = false;
  var lightboxEl = null;
  var lightboxState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    urls: [],
    index: 0
  };
  function legacyMethod44(name, ...args) {
    const method = getLegacyBridge().methods[name];
    if (typeof method !== "function") {
      throw new Error("Legacy bridge method " + name + " is not available");
    }
    return method(...args);
  }
  function isLightboxActive() {
    return Boolean(lightboxEl?.classList.contains("active"));
  }
  function lightboxImage() {
    return lightboxEl?.querySelector("#lightboxImg") || null;
  }
  function setLightboxTransform() {
    const img = lightboxImage();
    if (!img) return;
    img.style.transform = `translate(${lightboxState.pointX}px, ${lightboxState.pointY}px) scale(${lightboxState.scale})`;
  }
  function resetLightboxTransform() {
    lightboxState.scale = 1;
    lightboxState.pointX = 0;
    lightboxState.pointY = 0;
    stopLightboxPanning();
    setLightboxTransform();
  }
  function stopLightboxPanning() {
    lightboxState.panning = false;
  }
  function updateLightboxControls() {
    if (!lightboxEl) return;
    const hasMultipleImages = lightboxState.urls.length > 1;
    const prevButton = lightboxEl.querySelector(".lightbox-prev");
    const nextButton = lightboxEl.querySelector(".lightbox-next");
    const counter = lightboxEl.querySelector(".lightbox-counter");
    [prevButton, nextButton, counter].forEach((element2) => {
      element2?.classList.toggle("hidden", !hasMultipleImages);
    });
    if (counter) {
      counter.textContent = hasMultipleImages ? `${lightboxState.index + 1} / ${lightboxState.urls.length}` : "";
    }
  }
  function normalizedLightboxIndex(index, count) {
    if (!count) return 0;
    return (index % count + count) % count;
  }
  function syncActiveLightboxUrls3(urls) {
    if (!isLightboxActive() || !Array.isArray(urls) || !urls.length) return;
    const currentUrl = lightboxState.urls[lightboxState.index];
    if (!currentUrl) return;
    const nextIndex = urls.indexOf(currentUrl);
    if (nextIndex === -1) return;
    lightboxState.urls = urls.slice();
    lightboxState.index = nextIndex;
    updateLightboxControls();
  }
  function showLightboxImage(index) {
    if (!lightboxEl || !lightboxState.urls.length) return;
    const img = lightboxImage();
    if (!img) return;
    lightboxState.index = normalizedLightboxIndex(index, lightboxState.urls.length);
    img.src = lightboxState.urls[lightboxState.index] || "";
    resetLightboxTransform();
    updateLightboxControls();
  }
  function showPreviousLightboxImage() {
    if (!isLightboxActive() || lightboxState.urls.length < 2) return;
    showLightboxImage(lightboxState.index - 1);
  }
  function showNextLightboxImage() {
    if (!isLightboxActive() || lightboxState.urls.length < 2) return;
    showLightboxImage(lightboxState.index + 1);
  }
  function ensureLightboxElement() {
    if (lightboxEl) return lightboxEl;
    lightboxEl = document.createElement("div");
    lightboxEl.className = "lightbox";
    lightboxEl.setAttribute("role", "dialog");
    lightboxEl.setAttribute("aria-modal", "true");
    lightboxEl.setAttribute("aria-label", "\u56FE\u7247\u9884\u89C8");
    lightboxEl.innerHTML = `
      <button class="lightbox-close" type="button" aria-label="\u5173\u95ED\u9884\u89C8">\xD7</button>
      <button class="lightbox-nav lightbox-prev" type="button" aria-label="\u4E0A\u4E00\u5F20">&lsaquo;</button>
      <img id="lightboxImg" src="" alt="" draggable="false">
      <button class="lightbox-nav lightbox-next" type="button" aria-label="\u4E0B\u4E00\u5F20">&rsaquo;</button>
      <div class="lightbox-counter" aria-live="polite"></div>
    `;
    document.body.appendChild(lightboxEl);
    const img = lightboxEl.querySelector("img");
    const lightboxClose = lightboxEl.querySelector(".lightbox-close");
    const prevButton = lightboxEl.querySelector(".lightbox-prev");
    const nextButton = lightboxEl.querySelector(".lightbox-next");
    lightboxClose?.addEventListener("click", closeLightbox);
    prevButton?.addEventListener("click", showPreviousLightboxImage);
    nextButton?.addEventListener("click", showNextLightboxImage);
    lightboxEl.addEventListener("wheel", (event) => {
      if (!isLightboxActive()) return;
      event.preventDefault();
      const delta = event.deltaY * -5e-3;
      lightboxState.scale = Math.min(Math.max(0.5, lightboxState.scale + delta), 5);
      setLightboxTransform();
    });
    lightboxEl.addEventListener("click", (event) => {
      if (event.target === lightboxEl) closeLightbox();
    });
    img?.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        stopLightboxPanning();
        return;
      }
      event.preventDefault();
      lightboxState.panning = true;
      lightboxState.startX = event.clientX - lightboxState.pointX;
      lightboxState.startY = event.clientY - lightboxState.pointY;
    });
    img?.addEventListener("contextmenu", stopLightboxPanning);
    window.addEventListener("mousemove", (event) => {
      if (!lightboxState.panning) return;
      if (event.buttons !== void 0 && (event.buttons & 1) !== 1) {
        stopLightboxPanning();
        return;
      }
      lightboxState.pointX = event.clientX - lightboxState.startX;
      lightboxState.pointY = event.clientY - lightboxState.startY;
      setLightboxTransform();
    });
    window.addEventListener("mouseup", stopLightboxPanning);
    window.addEventListener("blur", stopLightboxPanning);
    window.addEventListener("keydown", (event) => {
      if (!isLightboxActive()) return;
      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousLightboxImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextLightboxImage();
      }
    });
    return lightboxEl;
  }
  function openLightbox(url, urls = [], index = 0) {
    const element2 = ensureLightboxElement();
    const nextUrls = Array.isArray(urls) && urls.length ? urls.filter(Boolean) : [url].filter(Boolean);
    lightboxState.urls = nextUrls.length ? nextUrls : [url].filter(Boolean);
    const matchedIndex = lightboxState.urls.indexOf(url);
    lightboxState.index = matchedIndex >= 0 ? matchedIndex : normalizedLightboxIndex(index, lightboxState.urls.length);
    showLightboxImage(lightboxState.index);
    document.body.classList.add("lightbox-open");
    element2.classList.add("active");
    updateLightboxControls();
  }
  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.classList.remove("active");
    document.body.classList.remove("lightbox-open");
    stopLightboxPanning();
    lightboxState.urls = [];
    lightboxState.index = 0;
  }
  async function addToInput(url) {
    try {
      const file = await legacyMethod44("imageFileFromUrl", url, "preview-" + Date.now());
      legacyMethod44("addImageFiles", [file]);
    } catch (error) {
      console.error("Failed to add image to input", error);
    }
  }
  function initLightboxFeature() {
    if (lightboxFeatureInitialized) return;
    lightboxFeatureInitialized = true;
    window.openLightbox = openLightbox;
    window.closeLightbox = closeLightbox;
    window.showLightboxImage = showLightboxImage;
    window.showPreviousLightboxImage = showPreviousLightboxImage;
    window.showNextLightboxImage = showNextLightboxImage;
    window.addToInput = addToInput;
    Object.assign(getLegacyBridge().methods, {
      syncActiveLightboxUrls: syncActiveLightboxUrls3
    });
  }

  // codex_image/webui/frontend/src/segmented-indicator.ts
  var HOST_SELECTORS = [".radio-group:not(.ratio-group)", "#authSourceGroup"];
  var HOST_SELECTOR = HOST_SELECTORS.join(", ");
  var BUTTON_SELECTOR = ".radio-btn, .auth-source-button";
  var INDICATOR_CLASS = "segmented-indicator";
  var HOST_CLASS = "segmented-indicator-host";
  var initializedHosts = /* @__PURE__ */ new WeakSet();
  var scheduledFrames = /* @__PURE__ */ new WeakMap();
  var segmentedIndicatorsInitialized = false;
  var resizeObserver = null;
  function activeSegment(host) {
    return host.querySelector(".radio-btn.active, .auth-source-button.active");
  }
  function ensureIndicator(host) {
    const existing = Array.from(host.children).find((child) => child.classList.contains(INDICATOR_CLASS));
    if (existing instanceof HTMLElement) return existing;
    const indicator = document.createElement("span");
    indicator.className = INDICATOR_CLASS;
    indicator.setAttribute("aria-hidden", "true");
    host.insertBefore(indicator, host.firstElementChild);
    return indicator;
  }
  function updateIndicator(host) {
    scheduledFrames.delete(host);
    if (!host.isConnected) return;
    const indicator = ensureIndicator(host);
    const active = activeSegment(host);
    if (!active) {
      indicator.style.setProperty("--segmented-indicator-opacity", "0");
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const hostStyle = window.getComputedStyle(host);
    const borderLeft = Number.parseFloat(hostStyle.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(hostStyle.borderTopWidth) || 0;
    indicator.style.setProperty("--segmented-indicator-x", `${activeRect.left - hostRect.left - borderLeft}px`);
    indicator.style.setProperty("--segmented-indicator-y", `${activeRect.top - hostRect.top - borderTop}px`);
    indicator.style.setProperty("--segmented-indicator-width", `${activeRect.width}px`);
    indicator.style.setProperty("--segmented-indicator-height", `${activeRect.height}px`);
    indicator.style.setProperty("--segmented-indicator-opacity", "1");
  }
  function scheduleIndicatorUpdate(host) {
    if (scheduledFrames.has(host)) return;
    scheduledFrames.set(host, window.requestAnimationFrame(() => updateIndicator(host)));
  }
  function watchButtonClassChanges(host) {
    const observer = new MutationObserver(() => scheduleIndicatorUpdate(host));
    host.querySelectorAll(BUTTON_SELECTOR).forEach((button) => {
      observer.observe(button, { attributes: true, attributeFilter: ["class"] });
    });
  }
  function initHost(host) {
    if (initializedHosts.has(host)) return;
    initializedHosts.add(host);
    host.classList.add(HOST_CLASS);
    ensureIndicator(host);
    host.addEventListener("click", () => scheduleIndicatorUpdate(host));
    watchButtonClassChanges(host);
    if ("ResizeObserver" in window) {
      resizeObserver || (resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => scheduleIndicatorUpdate(entry.target));
      }));
      resizeObserver.observe(host);
    }
    scheduleIndicatorUpdate(host);
  }
  function updateAllIndicators() {
    document.querySelectorAll(HOST_SELECTOR).forEach(scheduleIndicatorUpdate);
  }
  function initSegmentedIndicatorFeature() {
    if (segmentedIndicatorsInitialized) return;
    segmentedIndicatorsInitialized = true;
    document.querySelectorAll(HOST_SELECTOR).forEach(initHost);
    window.addEventListener("resize", updateAllIndicators, { passive: true });
    document.fonts?.ready?.then(updateAllIndicators).catch(() => {
    });
  }

  // codex_image/webui/frontend/src/main.ts
  initInputSourcesFeature();
  initImageEditorFeature();
  initImageStripFeature();
  initGalleryCategoriesFeature();
  initRecentAssetsFeature();
  initQuickGalleryFeature();
  initGalleryGridFeature();
  initGalleryItemActionsFeature();
  initGalleryFeature();
  initApiSettingsFeature();
  initAccountQuotaFeature();
  initStorageSettingsFeature();
  initColorPaletteFeature();
  initPromptColorsFeature();
  initPromptSnippetsFeature();
  initPromptTemplatesFeature();
  initPromptFeature();
  initPromptFindReplaceFeature();
  initFormControlsFeature();
  initTaskListRenderFeature();
  initTaskHistoryAnchorsFeature();
  initTaskArchiveControlsFeature();
  initTaskBatchControlsFeature();
  initTaskActionsFeature();
  initTaskSubmitFeature();
  initTaskListControlsFeature();
  initTaskListQueueControlsFeature();
  initTaskContextMenuFeature();
  initTaskNotificationsFeature();
  initTaskDerivedFeature();
  initTaskPreviewFeature();
  initTaskFeature();
  initTaskSelectionFeature();
  initOverlayPopoversFeature();
  initShellUiFeature();
  initLightboxFeature();
  initializeQueueFeature();
  initSegmentedIndicatorFeature();
  window.__codexImageWebUI?.boot();
})();
//# sourceMappingURL=app.js.map

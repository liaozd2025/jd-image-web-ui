from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI

from codex_image.account_quota import AccountQuotaCache
from codex_image.auth import AuthState

from .queue import QueueManager
from .settings_store import ApiSettings, AuthSettings, ColorPaletteSettings, PromptSnippetSettings, PromptTemplateSettings, WebUISettings
from .storage import GalleryStorage, QueueStorage, ReferenceAssetStorage, SQLiteQueueStorage, TaskStorage

ClientFactory = Callable[[], Any]
AuthChecker = Callable[[], bool]
QuotaFetcher = Callable[[AuthState], dict[str, Any]]


@dataclass
class WebUIContext:
    app: FastAPI
    storage: TaskStorage
    gallery_storage: GalleryStorage
    reference_asset_storage: ReferenceAssetStorage
    queue_storage: QueueStorage | SQLiteQueueStorage
    webui_settings: WebUISettings
    auth_settings: AuthSettings
    api_settings: ApiSettings
    color_settings: ColorPaletteSettings
    prompt_snippet_settings: PromptSnippetSettings
    prompt_template_settings: PromptTemplateSettings
    account_quota_cache: AccountQuotaCache
    client_factory: ClientFactory
    auth_checker: AuthChecker
    account_quota_fetcher: QuotaFetcher
    input_root: Path
    output_root: Path
    gallery_root: Path
    reference_asset_root: Path
    source_data_root: Path
    auto_start_queue: bool
    queue_manager: QueueManager | None = None
    active_task_ids: set[str] = field(default_factory=set)
    running_worker_tasks: dict[str, Any] = field(default_factory=dict)
    api_request_semaphores: dict[str, dict[str, Any]] = field(default_factory=dict)
    route_helpers: dict[str, Any] = field(default_factory=dict)

    def install_on_app_state(self) -> None:
        self.app.state.ctx = self
        self.app.state.storage = self.storage
        self.app.state.gallery_storage = self.gallery_storage
        self.app.state.reference_asset_storage = self.reference_asset_storage
        self.app.state.queue_storage = self.queue_storage
        self.app.state.webui_settings = self.webui_settings
        self.app.state.input_root = self.input_root
        self.app.state.output_root = self.output_root
        self.app.state.gallery_root = self.gallery_root
        self.app.state.reference_asset_root = self.reference_asset_root
        self.app.state.source_data_root = self.source_data_root
        self.app.state.auto_start_queue = self.auto_start_queue
        self.app.state.auth_settings = self.auth_settings
        self.app.state.api_settings = self.api_settings
        self.app.state.prompt_template_settings = self.prompt_template_settings
        self.app.state.account_quota_cache = self.account_quota_cache
        self.app.state.client_factory = self.client_factory
        self.app.state.auth_checker = self.auth_checker
        self.app.state.active_task_ids = self.active_task_ids
        self.app.state.running_worker_tasks = self.running_worker_tasks
        self.app.state.api_request_semaphores = self.api_request_semaphores
        self.app.state.route_helpers = self.route_helpers
        if self.queue_manager is not None:
            self.app.state.queue_manager = self.queue_manager

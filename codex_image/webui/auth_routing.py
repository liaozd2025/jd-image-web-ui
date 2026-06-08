from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from codex_image.account_quota import AccountQuotaDescriptor
from codex_image.auth import AuthState, load_auth_state
from codex_image.client import CodexImageClient, OpenAIImagesImageClient, OpenAIResponsesImageClient
from codex_image.cockpit_auth import CockpitAuthProvider

from . import executor as _executor
from .queue import QueueChannel
from .schemas import DEFAULT_WEBUI_API_SETTINGS_PATH
from .settings_store import ApiSettings
from .storage import TaskStorage
from .task_metadata import _apply_api_images_concurrency_metadata

AUTH_SOURCES = {"auto", "cockpit", "codex", "api"}
API_MODES = {"images", "responses"}
DEFAULT_API_MODE = "images"
DEFAULT_API_PROVIDER_ID = "default"
DEFAULT_API_IMAGES_CONCURRENCY = 4
MIN_API_IMAGES_CONCURRENCY = 1
MAX_API_IMAGES_CONCURRENCY = 32
BACKEND_CODEX_RESPONSES = "codex_responses"
BACKEND_OPENAI_RESPONSES = "openai_responses"
BACKEND_OPENAI_IMAGES = "openai_images"


def _normalize_api_mode(value: Any) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in API_MODES else DEFAULT_API_MODE


def _normalize_api_images_concurrency(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = DEFAULT_API_IMAGES_CONCURRENCY
    return min(MAX_API_IMAGES_CONCURRENCY, max(MIN_API_IMAGES_CONCURRENCY, parsed))


def _api_client_from_settings(settings: dict[str, Any], *, api_mode: str | None = None) -> Any:
    mode = _normalize_api_mode(api_mode or settings.get("api_mode"))
    client_class = OpenAIResponsesImageClient if mode == "responses" else OpenAIImagesImageClient
    if mode == "images":
        _executor.OpenAIImagesImageClient = OpenAIImagesImageClient
    return client_class(
        api_key=str(settings["api_key"]),
        base_url=str(settings["base_url"]),
        image_model=str(settings["image_model"]),
    )


def _backend_for_api_mode(api_mode: Any) -> str:
    return BACKEND_OPENAI_RESPONSES if _normalize_api_mode(api_mode) == "responses" else BACKEND_OPENAI_IMAGES


def _backend_for_queue_channel(
    channel: QueueChannel,
    metadata: dict[str, Any] | None = None,
    *,
    api_settings: ApiSettings | None = None,
) -> str:
    if channel.auth_source == "api":
        params = metadata.get("params") if isinstance(metadata, dict) and isinstance(metadata.get("params"), dict) else {}
        if api_settings is not None:
            settings = api_settings.read()
            provider = api_settings.provider_settings(str(params.get("api_provider_id") or settings.get("active_provider_id") or ""))
            settings_mode = provider.get("api_mode")
        else:
            settings_mode = DEFAULT_API_MODE
        return _backend_for_api_mode(params.get("api_mode") or settings_mode)
    return BACKEND_CODEX_RESPONSES


def _backend_for_submit(auth_source: str, api_mode: str | None) -> str:
    return _backend_for_api_mode(api_mode) if auth_source == "api" else BACKEND_CODEX_RESPONSES


def _request_api_provider_id(auth_source: str, api_provider_id: str | None, api_settings: ApiSettings) -> str | None:
    if auth_source != "api":
        return None
    settings = api_settings.read()
    provider = api_settings.provider_settings(api_provider_id or str(settings.get("active_provider_id") or ""))
    return str(provider["id"])


def _request_api_provider_name(auth_source: str, api_provider_id: str | None, api_settings: ApiSettings) -> str | None:
    if auth_source != "api":
        return None
    provider = api_settings.provider_settings(api_provider_id)
    return str(provider.get("name") or provider.get("id") or "").strip() or None


def _request_api_mode(auth_source: str, api_mode: str | None, api_settings: ApiSettings, api_provider_id: str | None = None) -> str | None:
    if auth_source != "api":
        return None
    if api_mode is not None and str(api_mode).strip():
        return _normalize_api_mode(api_mode)
    provider = api_settings.provider_settings(api_provider_id)
    return _normalize_api_mode(provider.get("api_mode"))


def _request_api_images_concurrency(auth_source: str, api_settings: ApiSettings, api_provider_id: str | None = None) -> int:
    if auth_source != "api":
        return DEFAULT_API_IMAGES_CONCURRENCY
    provider = api_settings.provider_settings(api_provider_id)
    return _normalize_api_images_concurrency(provider.get("images_concurrency"))


def _task_metadata_uses_api(metadata: dict[str, Any]) -> bool:
    params = metadata.get("params") if isinstance(metadata.get("params"), dict) else {}
    return (
        str(metadata.get("assigned_auth_source") or "") == "api"
        or bool(metadata.get("api_provider_id"))
        or bool(params.get("api_provider_id"))
    )


def _apply_retry_api_provider(
    storage: TaskStorage,
    task_id: str,
    metadata: dict[str, Any],
    api_settings: ApiSettings,
    api_provider_id: str | None = None,
) -> None:
    if not _task_metadata_uses_api(metadata):
        return
    provider_id = _request_api_provider_id("api", api_provider_id, api_settings)
    provider_name = _request_api_provider_name("api", provider_id, api_settings)
    api_mode = _request_api_mode("api", None, api_settings, provider_id)
    params = dict(metadata.get("params") or {})
    params["api_provider_id"] = provider_id
    params["api_mode"] = api_mode
    if provider_name:
        params["api_provider_name"] = provider_name
    else:
        params.pop("api_provider_name", None)
    if api_mode == "images":
        params["api_images_concurrency"] = _request_api_images_concurrency("api", api_settings, provider_id)
    else:
        params.pop("api_images_concurrency", None)
    metadata["params"] = params
    metadata["requested_backend"] = _backend_for_submit("api", api_mode)
    metadata["api_provider_id"] = provider_id
    if provider_name:
        metadata["api_provider_name"] = provider_name
    else:
        metadata.pop("api_provider_name", None)
    _apply_api_images_concurrency_metadata(metadata, params)
    _update_stored_request_api_provider(storage, task_id, params)


def _update_stored_request_api_provider(storage: TaskStorage, task_id: str, params: dict[str, Any]) -> None:
    try:
        request_payload = json.loads(storage.request_path(task_id).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(request_payload, dict):
        return
    api_mode = _normalize_api_mode(params.get("api_mode"))
    request_payload["webui_requested_backend"] = _backend_for_api_mode(api_mode)
    request_payload["webui_api_provider_id"] = params.get("api_provider_id")
    if params.get("api_provider_name"):
        request_payload["webui_api_provider_name"] = params.get("api_provider_name")
    else:
        request_payload.pop("webui_api_provider_name", None)
    if api_mode == "images" and params.get("api_images_concurrency") is not None:
        request_payload["webui_api_images_concurrency"] = _normalize_api_images_concurrency(params.get("api_images_concurrency"))
    else:
        request_payload.pop("webui_api_images_concurrency", None)
    storage.write_request(task_id, request_payload)


def _client_for_auth_source(source: str, *, api_settings: ApiSettings | None = None) -> Any:
    normalized = source if source in AUTH_SOURCES else "auto"
    if normalized == "api":
        settings = (api_settings or ApiSettings(DEFAULT_WEBUI_API_SETTINGS_PATH)).read()
        provider = (api_settings or ApiSettings(DEFAULT_WEBUI_API_SETTINGS_PATH)).provider_settings(str(settings.get("active_provider_id") or ""))
        return _api_client_from_settings(provider, api_mode=str(provider.get("api_mode") or DEFAULT_API_MODE))
    provider = _cockpit_provider()
    if normalized == "cockpit":
        if provider is None:
            raise RuntimeError("Cockpit Codex auth is not available")
        return CodexImageClient(auth_provider=provider)
    if normalized == "auto" and provider is not None:
        return CodexImageClient(auth_provider=provider)
    return CodexImageClient(load_auth_state())


def _api_queue_channel_count(api_settings: ApiSettings | None = None) -> int:
    if api_settings is None:
        return DEFAULT_API_IMAGES_CONCURRENCY
    settings = api_settings.read()
    return _normalize_api_images_concurrency(settings.get("images_concurrency"))


def _queue_channels_for_source(source: str, *, api_settings: ApiSettings | None = None) -> list[QueueChannel]:
    if source == "api":
        return [
            QueueChannel(channel_id=f"api:default:{index}", auth_source="api", account_id=None)
            for index in range(1, _api_queue_channel_count(api_settings) + 1)
        ]
    provider = _cockpit_provider()
    if source in {"auto", "cockpit"} and provider is not None and provider.available_count() > 0:
        return [
            QueueChannel(
                channel_id=f"cockpit:{state.raw['_cockpit_account_file_id']}",
                auth_source="cockpit",
                account_id=state.raw["_cockpit_account_file_id"],
            )
            for state in provider.list_auth_states()
        ]
    return [QueueChannel(channel_id="codex:local", auth_source="codex", account_id=None)]


def _account_quota_descriptors_for_source(source: str) -> list[AccountQuotaDescriptor]:
    provider = _cockpit_provider()
    if source in {"auto", "cockpit"} and provider is not None and provider.available_count() > 0:
        return [
            AccountQuotaDescriptor(
                account_key=f"cockpit:{state.raw['_cockpit_account_file_id']}",
                auth_source="cockpit",
                account_id=str(state.raw["_cockpit_account_file_id"]),
                label=_account_label_from_auth_state(state, fallback=f"Cockpit {state.raw['_cockpit_account_file_id']}"),
                auth_state=state,
            )
            for state in provider.list_auth_states()
        ]
    if source == "cockpit":
        return []
    try:
        state = load_auth_state()
    except Exception:
        return []
    return [
        AccountQuotaDescriptor(
            account_key="codex:local",
            auth_source="codex",
            account_id=None,
            label=_account_label_from_auth_state(state, fallback="Codex 本机"),
            auth_state=state,
        )
    ]


def _account_label_from_auth_state(state: AuthState, *, fallback: str) -> str:
    raw = state.raw if isinstance(state.raw, dict) else {}
    candidates = [
        raw.get("email"),
        raw.get("account_email"),
        raw.get("user_email"),
        state.account_id,
        fallback,
    ]
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return text
    return fallback


def _auth_status(source: str, *, api_settings: ApiSettings | None = None) -> dict[str, Any]:
    selected = source if source in AUTH_SOURCES else "auto"
    provider = _cockpit_provider()
    cockpit_count = provider.available_count() if provider is not None else 0
    codex_available = _codex_auth_available()
    api_public = (api_settings or ApiSettings(DEFAULT_WEBUI_API_SETTINGS_PATH)).public_settings()
    api_available = bool(api_public["base_url"] and api_public["api_key_set"])

    effective_source = ""
    auth_available = False
    if selected == "cockpit":
        effective_source = "cockpit" if provider is not None else ""
        auth_available = provider is not None
    elif selected == "codex":
        effective_source = "codex" if codex_available else ""
        auth_available = codex_available
    elif selected == "api":
        effective_source = "api" if api_available else ""
        auth_available = api_available
    else:
        if provider is not None:
            effective_source = "cockpit"
            auth_available = True
        elif codex_available:
            effective_source = "codex"
            auth_available = True

    return {
        "selected_source": selected,
        "effective_source": effective_source,
        "auth_available": auth_available,
        "sources": {
            "cockpit": {
                "available": provider is not None,
                "account_count": cockpit_count,
            },
            "codex": {
                "available": codex_available,
            },
            "api": {
                **api_public,
                "available": api_available,
            },
        },
    }


def _codex_auth_available() -> bool:
    try:
        state = load_auth_state()
    except Exception:
        return False
    return bool(state.access_token)


def _default_auth_source() -> str:
    source = os.getenv("CODEX_IMAGE_AUTH_SOURCE", "auto").strip().lower()
    return source if source in AUTH_SOURCES else "auto"


def _cockpit_provider() -> CockpitAuthProvider | None:
    root = os.getenv("CODEX_IMAGE_COCKPIT_HOME")
    provider = CockpitAuthProvider(root=Path(root) if root else None)
    return provider if provider.has_auth() else None

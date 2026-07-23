from __future__ import annotations

import asyncio
from dataclasses import asdict
from io import BytesIO
import json
import re
from typing import Any
import zipfile

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import ValidationError
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException

from .assets import AssetNotFound, AssetQuotaExceeded, AssetRepository, AssetValidationError
from .department_providers import DepartmentCredentialNotFound, DepartmentProviderRepository
from .identity import AuthenticatedSession
from .providers import (
    GenerationModelNotFound,
    GenerationModelInUse,
    PersonalCredentialNotFound,
    ProviderVersion,
    ProviderRepository,
    ProviderVersionInactive,
    ProviderVersionNotFound,
)
from .model_capabilities import get_model_capability_profile
from .providers_api import ProviderVersionPayload
from .tasks import (
    GenerationTask,
    GenerationTaskRepository,
    TaskConfigurationError,
    TaskNotFound,
    task_output_records,
)
from .tasks_api import MAX_TASK_INPUT_BYTES, _task_payload
from .shared_assets import SharedAssetForbidden, SharedAssetRepository
from codex_image.generation.catalog import (
    MODEL_MANIFEST_VERSION,
    list_model_families,
    list_model_manifests,
)
from codex_image.providers.registry import default_registry
from codex_image.version import APP_VERSION_TAG


WORKSPACE_UPLOAD_LIMIT = 16
REFERENCE_FILE_EXTENSIONS = {
    "asm", "bat", "c", "cc", "conf", "cpp", "css", "csv", "cxx", "def", "dic", "doc", "docx",
    "dot", "eml", "h", "hh", "htm", "html", "ics", "ifb", "iif", "in", "js", "json", "ksh",
    "list", "log", "markdown", "md", "mht", "mhtml", "mime", "mjs", "nws", "odt", "pdf", "pl",
    "pot", "ppa", "pps", "ppt", "pptx", "pwz", "py", "rst", "rtf", "s", "sql", "srt", "text",
    "tsv", "txt", "vcf", "vtt", "wiz", "xla", "xlb", "xlc", "xlm", "xls", "xlsx", "xlt", "xlw", "xml",
}


def install_workspace_routes(
    app: FastAPI,
    *,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
    tasks: GenerationTaskRepository,
) -> None:
    @app.get("/api/health", response_model=None)
    def workspace_health(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        available = _available_providers(session, providers, departments)
        return JSONResponse(
            content={
                "auth_available": bool(available),
                "auth": {
                    "selected_source": "api",
                    "effective_source": "api" if available else None,
                    "auth_available": bool(available),
                },
            }
        )

    @app.patch("/api/auth", response_model=None)
    def select_workspace_auth(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        available = _available_providers(session, providers, departments)
        return JSONResponse(
            content={
                "selected_source": "api",
                "effective_source": "api" if available else None,
                "auth_available": bool(available),
            }
        )

    @app.get("/api/api-settings", response_model=None)
    def api_settings(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"settings": _api_settings(session, providers, departments)})

    @app.get("/api/generation-catalog", response_model=None)
    def generation_catalog(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(
            content=_generation_catalog_payload(session, providers, departments),
            headers={"Cache-Control": "no-store"},
        )

    @app.patch("/api/api-settings", response_model=None)
    async def save_api_settings(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            payload = await request.json()
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "invalid_provider_settings"})
        if not isinstance(payload, dict) or not isinstance(payload.get("providers", []), list):
            return JSONResponse(status_code=422, content={"detail": "invalid_provider_settings"})
        if session.user.role == "admin":
            try:
                _save_department_api_settings(session, payload, providers, departments)
            except (TypeError, ValueError, ValidationError):
                return JSONResponse(status_code=422, content={"detail": "invalid_provider_settings"})
            except DepartmentCredentialNotFound as error:
                return JSONResponse(status_code=409, content={"detail": str(error)})
            except (GenerationModelInUse, GenerationModelNotFound) as error:
                return JSONResponse(status_code=409, content={"detail": str(error)})
            except (ProviderVersionNotFound, ProviderVersionInactive) as error:
                return JSONResponse(status_code=409, content={"detail": str(error)})
        else:
            for item in payload.get("providers", []):
                if not isinstance(item, dict):
                    continue
                scope, provider_version_id = _split_provider_id(item.get("id"))
                api_key = item.get("api_key")
                if scope != "personal" or not provider_version_id:
                    continue
                try:
                    if isinstance(api_key, str) and api_key:
                        providers.save_personal_credential(
                            session.user.user_id,
                            provider_version_id=provider_version_id,
                            api_key=api_key,
                        )
                    elif item.get("api_key_set") is False:
                        providers.delete_personal_credential(
                            session.user.user_id,
                            provider_version_id=provider_version_id,
                        )
                    if isinstance(item.get("models"), list):
                        validated_models = _workspace_models_payload(item["models"])
                        providers.replace_personal_models(
                            session.user.user_id,
                            provider_version_id=provider_version_id,
                            models=[
                                {
                                    **model.canonical_payload(),
                                    "generation_model_id": model.generation_model_id,
                                    "validation_status": "not_required",
                                }
                                for model in validated_models
                            ],
                        )
                except PersonalCredentialNotFound:
                    pass
                except (TypeError, ValueError, ValidationError):
                    return JSONResponse(status_code=422, content={"detail": "invalid_provider_settings"})
                except GenerationModelInUse as error:
                    return JSONResponse(status_code=409, content={"detail": str(error)})
                except (ProviderVersionNotFound, ProviderVersionInactive) as error:
                    return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"settings": _api_settings(session, providers, departments)})

    @app.get("/api/generation-model-preferences", response_model=None)
    def generation_model_preferences(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"preferences": providers.list_model_preferences(session.user.user_id)})

    @app.put("/api/generation-model-preferences", response_model=None)
    async def save_generation_model_preferences(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        provider_scope = str(payload.get("provider_scope") or "")
        provider_version_id = str(payload.get("provider_version_id") or "")
        generation_model_id = str(payload.get("generation_model_id") or "")
        if provider_scope not in {"personal", "department"} or not provider_version_id or not generation_model_id:
            return JSONResponse(status_code=422, content={"detail": "invalid_generation_model_preference"})
        owner_user_id = session.user.user_id if provider_scope == "personal" else None
        model = next(
            (
                item
                for item in providers.list_generation_models(
                    provider_version_id=provider_version_id,
                    owner_user_id=owner_user_id,
                )
                if item.get("generation_model_id") == generation_model_id
            ),
            None,
        )
        if model is None:
            return JSONResponse(status_code=404, content={"detail": "generation_model_not_found"})
        try:
            profile = get_model_capability_profile(str(model.get("capability_profile_id") or "generic-basic"))
            parameters = _normalize_model_preference_parameters(payload.get("parameters"), profile)
            preferences = providers.save_model_preference(
                session.user.user_id,
                provider_scope=provider_scope,  # type: ignore[arg-type]
                provider_version_id=provider_version_id,
                generation_model_id=generation_model_id,
                parameters=parameters,
            )
        except (GenerationModelNotFound, ValueError) as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"preferences": preferences})

    @app.get("/api/settings", response_model=None)
    def workspace_settings(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"settings": _workspace_settings(session.user.user_id, assets)})

    @app.patch("/api/settings", response_model=None)
    async def save_workspace_settings(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
        settings = _workspace_settings(session.user.user_id, assets)
        if isinstance(payload, dict) and payload.get("locale") in {
            "zh-CN", "zh-TW", "zh-HK", "ja", "ko", "en", "es", "pt", "fr", "de", "ru", "it", "hi",
        }:
            settings["locale"] = payload["locale"]
        _save_workspace_document(
            session.user.user_id,
            assets,
            {"_workspace_type": "workspace_settings", "locale": settings["locale"]},
            name="workspace-settings",
        )
        return JSONResponse(content={"settings": settings, "restart_required": False})

    @app.get("/api/app-version", response_model=None)
    def app_version(request: Request) -> JSONResponse:
        request.state.auth_session
        return JSONResponse(
            content={
                "current_version_label": f"{APP_VERSION_TAG} · SaaS Server",
                "latest_version_label": f"{APP_VERSION_TAG} · SaaS Server",
                "source": "source",
                "update_available": False,
                "updater_available": False,
                "release_url": "https://github.com/liaozd2025/jd-image-web-ui/releases",
                "post_update_onboarding": None,
            }
        )

    @app.post("/api/app-version/open-updater", response_model=None)
    def open_updater(request: Request) -> JSONResponse:
        return app_version(request)

    @app.post("/api/app-version/dismiss-onboarding", response_model=None)
    def dismiss_onboarding(request: Request) -> JSONResponse:
        return app_version(request)

    @app.get("/api/color-palette", response_model=None)
    def color_palette(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"palette": _color_palette(session.user.user_id, assets)})

    @app.patch("/api/color-palette", response_model=None)
    async def save_color_palette(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        current = _color_palette(session.user.user_id, assets)
        payload = await _json_object(request)
        current.update({key: value for key, value in payload.items() if key in {"favorites", "recent_colors", "recent_limit"}})
        document = {"_workspace_type": "color_palette", **current}
        _save_workspace_document(session.user.user_id, assets, document, name="color-palette")
        return JSONResponse(content={"palette": current})

    @app.post("/api/color-palette/import", response_model=None)
    async def import_color_palette(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        imported: list[dict[str, Any]] = []
        try:
            async with request.form(max_part_size=1024 * 1024) as form:
                upload = form.get("file")
                if isinstance(upload, UploadFile):
                    text = (await upload.read(1024 * 1024)).decode("utf-8", errors="ignore")
                    import re

                    colors = list(dict.fromkeys(value.upper() for value in re.findall(r"#[0-9a-fA-F]{6}", text)))
                    imported = [{"name": value, "hex": value, "order": (index + 1) * 10} for index, value in enumerate(colors[:100])]
        except (MultiPartException, RuntimeError):
            imported = []
        palette = _color_palette(session.user.user_id, assets)
        if imported:
            palette["favorites"] = imported
            _save_workspace_document(session.user.user_id, assets, {"_workspace_type": "color_palette", **palette}, name="color-palette")
        return JSONResponse(content={"palette": palette, "imported": len(imported)})

    @app.get("/api/color-palette/export.css", response_model=None)
    def export_color_palette(request: Request) -> Response:
        session: AuthenticatedSession = request.state.auth_session
        palette = _color_palette(session.user.user_id, assets)
        rules = [":root {"]
        for index, item in enumerate(palette.get("favorites", []), start=1):
            if isinstance(item, dict):
                rules.append(f"  --conjure-color-{index}: {item.get('hex', '#FFFFFF')};")
        rules.append("}")
        return Response("\n".join(rules), media_type="text/css", headers={"Content-Disposition": 'attachment; filename="conjure-colors.css"'})

    @app.get("/api/gallery", response_model=None)
    def gallery(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        scope = request.query_params.get("scope")
        if scope not in {None, "personal", "shared"}:
            return JSONResponse(status_code=422, content={"detail": "invalid_gallery_scope"})
        query = str(request.query_params.get("query") or "").strip().casefold()
        category_id = str(request.query_params.get("category_id") or "").strip()
        items = _gallery_items(session, assets, shared_assets)
        if scope:
            items = [item for item in items if item.get("scope") == scope]
        if category_id:
            items = [item for item in items if str(item.get("category") or "") == category_id]
        if query:
            items = [
                item
                for item in items
                if query in str(item.get("name") or "").casefold()
                or query in str(item.get("prompt_note") or "").casefold()
            ]
        return JSONResponse(
            content={
                "items": items,
                "categories": _workspace_categories(session.user.user_id, assets, kind="gallery"),
            }
        )

    @app.post("/api/gallery", response_model=None, status_code=201)
    async def create_gallery_item(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            async with request.form(max_part_size=MAX_TASK_INPUT_BYTES) as form:
                upload = form.get("image")
                if not isinstance(upload, UploadFile):
                    return JSONResponse(status_code=422, content={"detail": "请选择图片文件"})
                content = await upload.read(MAX_TASK_INPUT_BYTES + 1)
                requested_name = str(form.get("name") or upload.filename or "图片")
                if _personal_gallery_name_exists(session.user.user_id, assets, requested_name):
                    return JSONResponse(status_code=409, content={"detail": "个人图库素材名称已存在"})
                item = assets.create_asset(
                    session.user.user_id,
                    asset_kind="image",
                    name=requested_name,
                    original_filename=upload.filename or "gallery-image.bin",
                    mime_type=upload.content_type or "application/octet-stream",
                    content=content,
                )
                metadata = {
                    "_workspace_type": "gallery_metadata",
                    "asset_id": item.asset_id,
                    "name": str(form.get("name") or item.name),
                    "category": str(form.get("category") or "portrait"),
                    "prompt_note": str(form.get("prompt_note") or ""),
                    "order": 0,
                }
                _save_workspace_document(session.user.user_id, assets, metadata, name=f"gallery:{item.asset_id}")
        except (AssetQuotaExceeded, AssetValidationError) as error:
            return JSONResponse(status_code=413 if isinstance(error, AssetQuotaExceeded) else 422, content={"detail": str(error)})
        created = next(value for value in _gallery_items(session, assets, shared_assets) if value["id"] == item.asset_id)
        return JSONResponse(status_code=201, content={"item": created})

    @app.patch("/api/gallery/{asset_id}", response_model=None)
    async def update_gallery_item(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id == "reorder":
            payload = await _json_object(request)
            item_ids = [str(item) for item in payload.get("item_ids", []) if str(item)]
            if any(item_id.startswith("shared:") for item_id in item_ids):
                return JSONResponse(status_code=403, content={"detail": "共享素材只读"})
            metadata_by_id = _gallery_metadata(session.user.user_id, assets)
            for index, item_id in enumerate(item_ids, start=1):
                existing = metadata_by_id.get(item_id, {})
                document = {
                    "_workspace_type": "gallery_metadata",
                    "asset_id": item_id,
                    "name": str(existing.get("name") or item_id),
                    "category": str(payload.get("category") or existing.get("category") or "portrait"),
                    "prompt_note": str(existing.get("prompt_note") or ""),
                    "order": index * 10,
                }
                _save_workspace_document(session.user.user_id, assets, document, name=f"gallery:{item_id}")
            reordered = [item for item in _gallery_items(session, assets, shared_assets) if item["id"] in set(item_ids)]
            return JSONResponse(content={"items": reordered})
        if asset_id.startswith("shared:"):
            return JSONResponse(status_code=403, content={"detail": "共享素材只读"})
        try:
            assets.get_asset(session.user.user_id, asset_id)
            payload = await request.json()
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "invalid_gallery_request"})
        existing = _gallery_metadata(session.user.user_id, assets).get(asset_id, {})
        requested_name = str(payload.get("name", existing.get("name", "图片")))[:160]
        if _personal_gallery_name_exists(
            session.user.user_id,
            assets,
            requested_name,
            exclude_asset_id=asset_id,
        ):
            return JSONResponse(status_code=409, content={"detail": "个人图库素材名称已存在"})
        metadata = {
            "_workspace_type": "gallery_metadata",
            "asset_id": asset_id,
            "name": requested_name,
            "category": str(payload.get("category", existing.get("category", "portrait")))[:64],
            "prompt_note": str(payload.get("prompt_note", existing.get("prompt_note", "")))[:1000],
            "order": int(payload.get("order", existing.get("order", 0)) or 0),
        }
        _save_workspace_document(session.user.user_id, assets, metadata, name=f"gallery:{asset_id}")
        updated = next(value for value in _gallery_items(session, assets, shared_assets) if value["id"] == asset_id)
        return JSONResponse(content={"item": updated})

    @app.put("/api/gallery/{asset_id}/image", response_model=None)
    async def replace_gallery_image(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id.startswith("shared:"):
            return JSONResponse(status_code=403, content={"detail": "共享素材只读"})
        try:
            async with request.form(max_part_size=MAX_TASK_INPUT_BYTES) as form:
                upload = form.get("image")
                if not isinstance(upload, UploadFile):
                    return JSONResponse(status_code=422, content={"detail": "请选择图片文件"})
                content = await upload.read(MAX_TASK_INPUT_BYTES + 1)
                assets.create_version(
                    session.user.user_id,
                    asset_id,
                    original_filename=upload.filename or "gallery-image.bin",
                    mime_type=upload.content_type or "application/octet-stream",
                    content=content,
                )
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except (AssetQuotaExceeded, AssetValidationError) as error:
            return JSONResponse(status_code=413 if isinstance(error, AssetQuotaExceeded) else 422, content={"detail": str(error)})
        updated = next(value for value in _gallery_items(session, assets, shared_assets) if value["id"] == asset_id)
        return JSONResponse(content={"item": updated})

    @app.delete("/api/gallery/{asset_id}", response_model=None)
    def delete_gallery_item(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id.startswith("shared:"):
            try:
                shared_assets.set_active(
                    session.user.user_id,
                    session.user.role,
                    asset_id.split(":", 1)[1],
                    is_active=False,
                )
            except AssetNotFound as error:
                return JSONResponse(status_code=404, content={"detail": str(error)})
            except SharedAssetForbidden as error:
                return JSONResponse(status_code=403, content={"detail": str(error)})
            return JSONResponse(content={"ok": True})
        try:
            assets.soft_delete(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"ok": True})

    @app.get("/api/reference-assets/recent", response_model=None)
    def recent_reference_assets(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        items = [
            item for item in _gallery_items(session, assets, shared_assets)
            if item.get("image_url")
        ]
        return JSONResponse(
            content={
                "items": [
                    {
                        "id": item["id"],
                        "filename": item["name"],
                        "image_url": item["image_url"],
                        "mime_type": item.get("mime_type", "image/png"),
                        "scope": item["scope"],
                        "read_only": item["read_only"],
                    }
                    for item in items[: _query_limit(request) or 50]
                ]
            }
        )

    @app.delete("/api/reference-assets/{asset_id}", response_model=None)
    def delete_reference_asset(request: Request, asset_id: str) -> JSONResponse:
        return delete_gallery_item(request, asset_id)

    @app.get("/api/prompt-snippets", response_model=None)
    def prompt_snippets(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"snippets": _prompt_snippets(session, assets, shared_assets)})

    @app.post("/api/prompt-snippets", response_model=None, status_code=201)
    async def create_prompt_snippet(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        snippet = _normalize_snippet(payload)
        if snippet is None:
            return JSONResponse(status_code=422, content={"detail": "标签和内容不能为空"})
        created = _save_workspace_document(session.user.user_id, assets, snippet, name=f"snippet:{snippet['tag']}")
        snippet["id"] = created.asset_id
        return JSONResponse(
            status_code=201,
            content={"snippet": snippet, "snippets": _prompt_snippets(session, assets, shared_assets)},
        )

    @app.patch("/api/prompt-snippets/{asset_id}", response_model=None)
    async def update_prompt_snippet(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id.startswith("shared:"):
            return JSONResponse(status_code=403, content={"detail": "共享提示词只读"})
        payload = _normalize_snippet(await _json_object(request))
        if payload is None:
            return JSONResponse(status_code=422, content={"detail": "标签和内容不能为空"})
        try:
            _update_workspace_document(session.user.user_id, assets, asset_id, payload)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        payload["id"] = asset_id
        return JSONResponse(content={"snippet": payload, "snippets": _prompt_snippets(session, assets, shared_assets)})

    @app.get("/api/prompt-templates", response_model=None)
    def prompt_templates(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.post("/api/prompt-templates", response_model=None, status_code=201)
    async def create_prompt_template(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        template = _normalize_template(await _json_object(request))
        if template is None:
            return JSONResponse(status_code=422, content={"detail": "标题和内容不能为空"})
        created = _save_workspace_document(session.user.user_id, assets, template, name=f"template:{template['title']}", kind="template")
        template["id"] = created.asset_id
        return JSONResponse(status_code=201, content={"template": template, **_prompt_template_response(session, assets, shared_assets)})

    @app.patch("/api/prompt-templates/{asset_id}", response_model=None)
    async def update_prompt_template(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id.startswith("shared:"):
            return JSONResponse(status_code=403, content={"detail": "共享模板只读"})
        template = _normalize_template(await _json_object(request))
        if template is None:
            return JSONResponse(status_code=422, content={"detail": "标题和内容不能为空"})
        try:
            _update_workspace_document(session.user.user_id, assets, asset_id, template)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        template["id"] = asset_id
        return JSONResponse(content={"template": template, **_prompt_template_response(session, assets, shared_assets)})

    @app.delete("/api/prompt-templates/{asset_id}", response_model=None)
    def delete_prompt_template(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if asset_id.startswith("shared:"):
            return JSONResponse(status_code=403, content={"detail": "共享模板只读"})
        try:
            assets.soft_delete(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.post("/api/prompt-templates/{asset_id}/use", response_model=None)
    def use_prompt_template(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        templates = _prompt_template_response(session, assets, shared_assets)
        template = next((item for item in templates["templates"] if item["id"] == asset_id), None)
        if template is None:
            return JSONResponse(status_code=404, content={"detail": "模板不存在"})
        return JSONResponse(content={"template": template, **templates})

    @app.get("/api/prompt-template-categories", response_model=None)
    def prompt_template_categories(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.get("/api/gallery/categories", response_model=None)
    def gallery_categories(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"categories": _workspace_categories(session.user.user_id, assets, kind="gallery")})

    @app.post("/api/gallery/categories", response_model=None, status_code=201)
    async def create_gallery_category(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        name = str(payload.get("name") or "").strip()[:32]
        if not name:
            return JSONResponse(status_code=422, content={"detail": "分类名称不能为空"})
        categories = _workspace_categories(session.user.user_id, assets, kind="gallery")
        category_id = _unique_category_id(name, categories)
        category = {
            "id": category_id,
            "name": name,
            "prompt_role": str(payload.get("prompt_role") or name).strip()[:48] or name,
            "order": (len(categories) + 1) * 10,
            "locked": False,
        }
        categories.append(category)
        _save_workspace_categories(session.user.user_id, assets, kind="gallery", categories=categories)
        return JSONResponse(status_code=201, content={"category": category, "categories": categories})

    @app.patch("/api/gallery/categories/{category_id}", response_model=None)
    async def update_gallery_category(request: Request, category_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        categories = _workspace_categories(session.user.user_id, assets, kind="gallery")
        if category_id == "reorder":
            category_ids = [str(item) for item in payload.get("category_ids", []) if str(item)]
            order = {item_id: (index + 1) * 10 for index, item_id in enumerate(category_ids)}
            for category in categories:
                category["order"] = order.get(str(category.get("id")), int(category.get("order") or 0))
            categories.sort(key=lambda item: int(item.get("order") or 0))
            _save_workspace_categories(session.user.user_id, assets, kind="gallery", categories=categories)
            return JSONResponse(content={"categories": categories})
        target = next((item for item in categories if str(item.get("id")) == category_id), None)
        if target is None:
            return JSONResponse(status_code=404, content={"detail": "分类不存在"})
        target["name"] = str(payload.get("name") or target.get("name") or category_id).strip()[:32]
        target["prompt_role"] = str(payload.get("prompt_role") or target.get("prompt_role") or target["name"]).strip()[:48]
        if "order" in payload:
            target["order"] = int(payload.get("order") or 0)
        _save_workspace_categories(session.user.user_id, assets, kind="gallery", categories=categories)
        return JSONResponse(content={"category": target, "categories": categories})

    @app.delete("/api/gallery/categories/{category_id}", response_model=None)
    def delete_gallery_category(request: Request, category_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        categories = _workspace_categories(session.user.user_id, assets, kind="gallery")
        remaining = [item for item in categories if str(item.get("id")) != category_id]
        if len(remaining) == len(categories) or not remaining:
            return JSONResponse(status_code=409, content={"detail": "分类无法删除"})
        _save_workspace_categories(session.user.user_id, assets, kind="gallery", categories=remaining)
        return JSONResponse(content={"categories": remaining})

    @app.patch("/api/gallery/categories/reorder", response_model=None)
    async def reorder_gallery_categories(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        category_ids = [str(item) for item in payload.get("category_ids", []) if str(item)]
        categories = _workspace_categories(session.user.user_id, assets, kind="gallery")
        order = {category_id: (index + 1) * 10 for index, category_id in enumerate(category_ids)}
        for category in categories:
            category["order"] = order.get(str(category.get("id")), int(category.get("order") or 0))
        categories.sort(key=lambda item: int(item.get("order") or 0))
        _save_workspace_categories(session.user.user_id, assets, kind="gallery", categories=categories)
        return JSONResponse(content={"categories": categories})

    @app.post("/api/prompt-template-categories", response_model=None, status_code=201)
    async def create_template_category(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        name = str(payload.get("name") or "").strip()[:32]
        if not name:
            return JSONResponse(status_code=422, content={"detail": "分类名称不能为空"})
        categories = _workspace_categories(session.user.user_id, assets, kind="template")
        category = {"id": name, "name": name, "order": (len(categories) + 1) * 10}
        if not any(str(item.get("id")) == name for item in categories):
            categories.append(category)
        _save_workspace_categories(session.user.user_id, assets, kind="template", categories=categories)
        return JSONResponse(status_code=201, content=_prompt_template_response(session, assets, shared_assets))

    @app.patch("/api/prompt-template-categories/{category_id}", response_model=None)
    async def update_template_category(request: Request, category_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        categories = _workspace_categories(session.user.user_id, assets, kind="template")
        name = str(payload.get("name") or category_id).strip()[:32]
        found = False
        for category in categories:
            if str(category.get("id")) == category_id:
                category.update({"id": name, "name": name})
                found = True
        if not found:
            return JSONResponse(status_code=404, content={"detail": "分类不存在"})
        _save_workspace_categories(session.user.user_id, assets, kind="template", categories=categories)
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.delete("/api/prompt-template-categories/{category_id}", response_model=None)
    def delete_template_category(request: Request, category_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        categories = _workspace_categories(session.user.user_id, assets, kind="template")
        remaining = [item for item in categories if str(item.get("id")) != category_id]
        if len(remaining) == len(categories):
            return JSONResponse(status_code=404, content={"detail": "分类不存在"})
        _save_workspace_categories(session.user.user_id, assets, kind="template", categories=remaining)
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.get("/api/prompt-templates/export.json", response_model=None)
    def export_prompt_templates(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content=_prompt_template_response(session, assets, shared_assets))

    @app.post("/api/prompt-templates/import", response_model=None)
    async def import_prompt_templates(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        imported = 0
        try:
            async with request.form(max_part_size=1024 * 1024) as form:
                upload = form.get("file")
                if isinstance(upload, UploadFile):
                    payload = json.loads((await upload.read(1024 * 1024)).decode("utf-8"))
                    source = payload.get("templates", []) if isinstance(payload, dict) else payload
                    for item in source if isinstance(source, list) else []:
                        template = _normalize_template(item if isinstance(item, dict) else {})
                        if template is None:
                            continue
                        _save_workspace_document(session.user.user_id, assets, template, name=f"template:{template['title']}", kind="template")
                        imported += 1
        except (MultiPartException, RuntimeError, ValueError, UnicodeError):
            return JSONResponse(status_code=422, content={"detail": "模板文件无效"})
        return JSONResponse(content={"imported": imported, **_prompt_template_response(session, assets, shared_assets)})

    @app.get("/api/task-history/summary", response_model=None)
    def task_history_summary(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        items = tasks.list_tasks(session.user.user_id, limit=100, include_deleted=False)
        summaries = [_history_task_summary(task) for task in items]
        return JSONResponse(content=_history_summary(summaries))

    @app.get("/api/task-history/tasks", response_model=None)
    def task_history(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        limit = _query_limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_limit"})
        items = [_history_task_summary(task) for task in tasks.list_tasks(session.user.user_id, limit=100)]
        items = _filter_history_tasks(items, request)
        if request.query_params.get("sort") == "oldest":
            items.reverse()
        try:
            offset = max(0, int(request.query_params.get("cursor", "0") or "0"))
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "invalid_history_cursor"})
        page = items[offset: offset + limit]
        next_cursor = str(offset + limit) if offset + limit < len(items) else None
        previous_cursor = str(max(0, offset - limit)) if offset > 0 else None
        return JSONResponse(content={"tasks": page, "next_cursor": next_cursor, "previous_cursor": previous_cursor})

    @app.patch("/api/tasks/{task_id}/archive", response_model=None)
    async def set_task_archive(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        try:
            task = tasks.set_archived(session.user.user_id, task_id, archived=bool(payload.get("archived")))
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task, attempts=tasks.list_attempts(session.user.user_id, task_id))})

    @app.patch("/api/tasks/{task_id}/viewed", response_model=None)
    def mark_task_viewed(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.mark_viewed(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/retry-failed", response_model=None, status_code=201)
    async def retry_failed_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        try:
            task = tasks.resubmit_task(
                session.user.user_id,
                task_id,
                confirm_capability_change=payload.get("confirm_capability_change") is True,
            )
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/accept-successes", response_model=None)
    def accept_task_successes(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.accept_partial_successes(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.patch("/api/tasks/{task_id}/outputs/{output_index}/selected", response_model=None)
    async def select_task_output(request: Request, task_id: str, output_index: int) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        try:
            task = tasks.set_output_selected(
                session.user.user_id,
                task_id,
                output_index,
                selected=bool(payload.get("selected")),
            )
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/outputs/delete-unselected", response_model=None)
    def delete_unselected_outputs(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.delete_unselected_outputs(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/outputs/{output_index}/restore", response_model=None)
    def restore_task_output(request: Request, task_id: str, output_index: int) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.restore_output(session.user.user_id, task_id, output_index)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/generate", response_model=None, status_code=201)
    async def generate(request: Request) -> JSONResponse:
        return await _create_workspace_task(
            request,
            mode="generate",
            providers=providers,
            departments=departments,
            assets=assets,
            shared_assets=shared_assets,
            tasks=tasks,
        )

    @app.post("/api/edit", response_model=None, status_code=201)
    async def edit(request: Request) -> JSONResponse:
        return await _create_workspace_task(
            request,
            mode="edit",
            providers=providers,
            departments=departments,
            assets=assets,
            shared_assets=shared_assets,
            tasks=tasks,
        )

    @app.get("/api/tasks/recent", response_model=None)
    def recent_tasks(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        limit = _query_limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_limit"})
        return JSONResponse(
            content={
                "tasks": [
                    _task_payload(task, attempts=tasks.list_attempts(session.user.user_id, task.task_id))
                    for task in tasks.list_tasks(session.user.user_id, limit=limit)
                ]
            }
        )

    @app.get("/api/queue", response_model=None)
    def queue(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        items = tasks.list_queue_tasks(session.user.user_id)
        waiting = [_task_payload(task) for task in items if task.status == "queued"]
        running = [_task_payload(task) for task in items if task.status == "running"]
        for index, task in enumerate(waiting, start=1):
            task["queue_position"] = index
        return JSONResponse(
            content={
                "waiting": waiting,
                "running": running,
                "summary": {
                    "waiting_count": len(waiting),
                    "running_count": len(running),
                    "channel_count": 1,
                    "usable_channel_count": 1,
                },
            }
        )

    @app.get("/api/events", response_model=None)
    async def task_events(request: Request) -> StreamingResponse:
        session: AuthenticatedSession = request.state.auth_session

        async def stream():
            while not await request.is_disconnected():
                queue_items = tasks.list_queue_tasks(session.user.user_id)
                recent_items = tasks.list_tasks(session.user.user_id, limit=50)
                waiting = [_task_payload(task) for task in queue_items if task.status == "queued"]
                running = [_task_payload(task) for task in queue_items if task.status == "running"]
                payload = {
                    "type": "snapshot",
                    "tasks": [_task_payload(task) for task in recent_items],
                    "queue": {
                        "waiting": waiting,
                        "running": running,
                        "summary": {
                            "waiting_count": len(waiting),
                            "running_count": len(running),
                            "channel_count": 1,
                            "usable_channel_count": 1,
                        },
                    },
                }
                yield f"data: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
                await asyncio.sleep(1)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @app.delete("/api/queue/{task_id}", response_model=None)
    def cancel_queue_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.cancel_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/queue/{task_id}/promote", response_model=None)
    def promote_queue_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            tasks.promote_queue_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return queue(request)

    @app.patch("/api/queue/reorder", response_model=None)
    async def reorder_queue(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        payload = await _json_object(request)
        task_ids = payload.get("task_ids")
        if not isinstance(task_ids, list) or not all(isinstance(item, str) for item in task_ids):
            return JSONResponse(status_code=422, content={"detail": "queue order is invalid"})
        try:
            tasks.reorder_queue(session.user.user_id, task_ids)
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return queue(request)

    @app.get("/api/tasks/{task_id}/inputs/{input_index}/thumbnail", response_model=None)
    def input_thumbnail(request: Request, task_id: str, input_index: int):
        if input_index != 1:
            return JSONResponse(status_code=404, content={"detail": "task_input_not_found"})
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
            path = tasks.input_path(task)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not (task.input_media_type or "").startswith("image/") or not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "task_input_not_found"})
        return FileResponse(path, media_type=task.input_media_type, headers={"Cache-Control": "no-store"})

    @app.get("/api/tasks/{task_id}/outputs/{output_index}/thumbnail", response_model=None)
    def output_thumbnail(request: Request, task_id: str, output_index: int):
        return _workspace_task_file(
            request, task_id, tasks=tasks, kind="thumbnail", output_index=output_index
        )

    @app.get("/api/tasks/{task_id}/outputs/{output_index}/download", response_model=None)
    def output_download(request: Request, task_id: str, output_index: int):
        return _workspace_task_file(
            request, task_id, tasks=tasks, kind="download", output_index=output_index
        )

    @app.get("/api/tasks/{task_id}/outputs.zip", response_model=None)
    def output_archive(request: Request, task_id: str):
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if task.status not in {"completed", "partial_failed"}:
            return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
        paths: list[tuple[int, Any, dict[str, object]]] = []
        output_records = list(enumerate(task_output_records(task), start=1))
        output_records = [entry for entry in output_records if not bool(entry[1].get("deleted"))]
        if request.query_params.get("selected") == "1":
            output_records = [entry for entry in output_records if bool(entry[1].get("selected", True))]
        for output_position, item in output_records:
            output_index = int(item.get("index") or 0)
            try:
                path = tasks.result_path(task, output_position)
            except TaskNotFound as error:
                return JSONResponse(status_code=404, content={"detail": str(error)})
            if not path.is_file():
                return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
            paths.append((output_index, path, item))
        archive = BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for output_index, path, item in paths:
                output.write(
                    path,
                    arcname=f"task-{task.task_id}-image-{output_index}.{_task_extension(task, item)}",
                )
        return Response(
            content=archive.getvalue(),
            media_type="application/zip",
            headers={"Cache-Control": "no-store", "Content-Disposition": f'attachment; filename="task-{task_id}.zip"'},
        )


async def _create_workspace_task(
    request: Request,
    *,
    mode: str,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
    tasks: GenerationTaskRepository,
) -> JSONResponse:
    session: AuthenticatedSession = request.state.auth_session
    try:
        async with request.form(max_part_size=MAX_TASK_INPUT_BYTES) as form:
            result = await _workspace_task_from_form(
                form,
                session=session,
                mode=mode,
                providers=providers,
                departments=departments,
                assets=assets,
                shared_assets=shared_assets,
                tasks=tasks,
            )
    except (MultiPartException, ValueError, RuntimeError) as error:
        return JSONResponse(status_code=422, content={"detail": str(error) or "invalid_task_request"})
    if isinstance(result, JSONResponse):
        return result
    task, request_payload = result
    return JSONResponse(
        status_code=201,
        content={"task": _task_payload(task), "request": request_payload},
    )


async def _workspace_task_from_form(
    form: FormData,
    *,
    session: AuthenticatedSession,
    mode: str,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
    tasks: GenerationTaskRepository,
) -> tuple[GenerationTask, dict[str, object]] | JSONResponse:
    api_provider_id = str(form.get("api_provider_id") or "").strip()
    canonical_provider_id = str(form.get("provider_id") or "").strip()
    if api_provider_id and canonical_provider_id and api_provider_id != canonical_provider_id:
        return JSONResponse(status_code=422, content={"detail": "供应商参数不一致"})
    provider_scope, provider_version_id = _split_provider_id(
        api_provider_id or canonical_provider_id
    )
    if not provider_version_id:
        return JSONResponse(status_code=422, content={"detail": "请选择可用的供应商"})
    available = {item["id"]: item for item in _available_providers(session, providers, departments)}
    provider = available.get(f"{provider_scope}-{provider_version_id}")
    if provider is None:
        return JSONResponse(status_code=409, content={"detail": "所选供应商不可用，请检查凭据或联系管理员"})
    generation_model_id = str(form.get("generation_model_id") or "").strip()
    binding_id = str(form.get("binding_id") or "").strip()
    if generation_model_id and binding_id and generation_model_id != binding_id:
        return JSONResponse(status_code=422, content={"detail": "模型绑定参数不一致"})
    generation_model_id = generation_model_id or binding_id
    available_models = [item for item in provider.get("models", []) if isinstance(item, dict)]
    selected_model = next(
        (
            item
            for item in available_models
            if generation_model_id
            and str(item.get("generation_model_id") or "") == generation_model_id
        ),
        None,
    )
    legacy_model_id = str(form.get("model") or form.get("main_model") or "").strip()
    if selected_model is None and not generation_model_id:
        matching_legacy_models = [
            item for item in available_models if str(item.get("model_id") or "") == legacy_model_id
        ]
        selected_model = matching_legacy_models[0] if len(matching_legacy_models) == 1 else None
    if selected_model is None:
        return JSONResponse(status_code=409, content={"detail": "所选模型不可用"})
    generation_model_id = str(selected_model.get("generation_model_id") or "")
    model_id = str(selected_model.get("model_id") or "")
    canonical_model_id = str(form.get("canonical_model_id") or "").strip()
    resolved_canonical_model_id = str(selected_model.get("canonical_model_id") or "")
    if canonical_model_id and canonical_model_id != resolved_canonical_model_id:
        return JSONResponse(status_code=422, content={"detail": "模型参数与服务端绑定不一致"})
    canonical_parameters = _canonical_parameters_from_form(form)
    prompt = str(form.get("prompt_for_model") or form.get("prompt") or "").strip()
    if not prompt:
        return JSONResponse(status_code=422, content={"detail": "请输入提示词"})
    canonical_resolution = str(
        (canonical_parameters or {}).get("canvas.resolution") or ""
    ).upper()
    size = _normalize_size(
        (canonical_parameters or {}).get("canvas.size")
        or {
            "512": "512x512",
            "1K": "1024x1024",
            "2K": "2048x2048",
            "4K": "4096x4096",
        }.get(canonical_resolution)
        or form.get("size")
    )
    quality = str(
        (canonical_parameters or {}).get("gpt.quality") or form.get("quality") or "auto"
    ).lower()
    if quality not in {"auto", "low", "medium", "high"}:
        quality = "auto"
    output_format = str(
        (canonical_parameters or {}).get("output.format")
        or form.get("output_format")
        or "png"
    ).lower()
    if output_format not in {"png", "jpeg", "webp"}:
        output_format = "png"
    moderation = str(
        (canonical_parameters or {}).get("gpt.moderation")
        or form.get("moderation")
        or "auto"
    ).lower()
    if moderation not in {"auto", "low"}:
        return JSONResponse(status_code=422, content={"detail": "审核参数无效"})
    prompt_fidelity = str(form.get("prompt_fidelity") or "strict").lower()
    if prompt_fidelity not in {"strict", "original", "off"}:
        return JSONResponse(status_code=422, content={"detail": "提示词模式无效"})
    prompt_optimization_mode = str(
        (canonical_parameters or {}).get("legacy.prompt_optimization_mode")
        or form.get("prompt_optimization_mode")
        or "off"
    ).lower()
    seed_mode = str(
        (canonical_parameters or {}).get("legacy.seed_mode")
        or form.get("seed_mode")
        or "random"
    ).lower()
    seed = (canonical_parameters or {}).get("legacy.seed", form.get("seed"))
    try:
        output_count = int(
            (canonical_parameters or {}).get("output.count") or form.get("n") or "1"
        )
    except ValueError:
        output_count = 0
    if output_count < 1 or output_count > 4:
        return JSONResponse(status_code=422, content={"detail": "生成数量必须为 1 到 4"})
    output_compression: int | None = None
    requested_compression = (canonical_parameters or {}).get(
        "gpt.output_compression",
        form.get("output_compression"),
    )
    if output_format != "png" and requested_compression not in {None, ""}:
        try:
            output_compression = int(str(requested_compression))
        except ValueError:
            output_compression = -1
        if output_compression < 0 or output_compression > 100:
            return JSONResponse(status_code=422, content={"detail": "输出压缩参数无效"})
    requested_web_search = (canonical_parameters or {}).get(
        "gemini.google_search",
        (canonical_parameters or {}).get("gpt.web_search", form.get("web_search")),
    )
    web_search = (
        requested_web_search
        if isinstance(requested_web_search, bool)
        else str(requested_web_search or "").lower() in {"1", "true", "yes", "on"}
    )
    api_mode = str(provider.get("api_mode") or "images")

    uploads = [item for key, item in form.multi_items() if key in {"images", "reference_images"} and isinstance(item, UploadFile)]
    if len(uploads) > WORKSPACE_UPLOAD_LIMIT:
        return JSONResponse(status_code=413, content={"detail": "参考图片数量不能超过 16 张"})
    if mode == "edit" and not uploads and not form.getlist("gallery_image_ids") and not form.getlist("reference_asset_ids"):
        return JSONResponse(status_code=422, content={"detail": "图片编辑至少需要一张输入图片"})
    input_bytes: bytes | None = None
    input_media_type: str | None = None
    asset_version_ids: list[str] = []
    for index, upload in enumerate(uploads):
        media_type = (upload.content_type or "").split(";", 1)[0].lower()
        content = await upload.read(MAX_TASK_INPUT_BYTES + 1)
        if not content or len(content) > MAX_TASK_INPUT_BYTES or media_type not in {"image/png", "image/jpeg", "image/webp"}:
            return JSONResponse(status_code=422, content={"detail": "参考图片格式无效或文件过大"})
        if index == 0:
            input_bytes = content
            input_media_type = media_type
            continue
        try:
            asset = assets.create_asset(
                session.user.user_id,
                asset_kind="reference",
                name=upload.filename or f"reference-{index + 1}",
                original_filename=upload.filename or f"reference-{index + 1}.bin",
                mime_type=media_type,
                content=content,
            )
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        if asset.current_version_id:
            asset_version_ids.append(asset.current_version_id)

    reference_file_uploads = [
        item for key, item in form.multi_items() if key == "reference_files" and isinstance(item, UploadFile)
    ]
    if reference_file_uploads and api_mode != "responses":
        return JSONResponse(status_code=422, content={"detail": "参考文件只能用于 Responses 供应商"})
    if len(reference_file_uploads) > WORKSPACE_UPLOAD_LIMIT:
        return JSONResponse(status_code=413, content={"detail": "参考文件数量不能超过 16 个"})
    for upload in reference_file_uploads:
        filename = upload.filename or "reference-file"
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if extension not in REFERENCE_FILE_EXTENSIONS:
            return JSONResponse(status_code=422, content={"detail": "参考文件类型不受支持"})
        content = await upload.read(MAX_TASK_INPUT_BYTES + 1)
        media_type = (upload.content_type or "application/octet-stream").split(";", 1)[0].lower()
        if not content or len(content) > MAX_TASK_INPUT_BYTES or media_type.startswith("image/"):
            return JSONResponse(status_code=422, content={"detail": "参考文件格式无效或文件过大"})
        try:
            asset = assets.create_asset(
                session.user.user_id,
                asset_kind="file",
                name=filename,
                original_filename=filename,
                mime_type=media_type,
                content=content,
            )
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        if asset.current_version_id:
            asset_version_ids.append(asset.current_version_id)

    stored_reference_file_ids = [str(item) for item in form.getlist("reference_file_ids")]
    if stored_reference_file_ids and api_mode != "responses":
        return JSONResponse(status_code=422, content={"detail": "参考文件只能用于 Responses 供应商"})
    shared_asset_version_ids: list[str] = []
    gallery_image_ids = [str(item) for item in form.getlist("gallery_image_ids")]
    gallery_image_version_ids = [str(item) for item in form.getlist("gallery_image_version_ids")]
    if gallery_image_version_ids and len(gallery_image_version_ids) != len(gallery_image_ids):
        return JSONResponse(status_code=422, content={"detail": "图库素材版本参数无效"})
    for index, raw_text in enumerate(gallery_image_ids):
        requested_version_id = gallery_image_version_ids[index] if gallery_image_version_ids else ""
        if raw_text.startswith("shared:"):
            asset_id = raw_text.split(":", 1)[1]
            try:
                shared_asset = shared_assets.get_asset(asset_id)
                if requested_version_id:
                    selected_version = shared_assets.get_version(requested_version_id)
                    if selected_version.asset_id != asset_id:
                        raise AssetNotFound("shared gallery version does not belong to the selected item")
                    version_id = selected_version.asset_version_id
                else:
                    version_id = shared_asset.current_version_id
            except AssetNotFound as error:
                return JSONResponse(status_code=404, content={"detail": str(error)})
            if version_id and version_id not in shared_asset_version_ids:
                shared_asset_version_ids.append(version_id)
            continue
        try:
            asset = assets.get_asset(session.user.user_id, raw_text)
            if requested_version_id:
                selected_version = assets.get_version(session.user.user_id, requested_version_id)
                if selected_version.asset_id != raw_text:
                    raise AssetNotFound("gallery version does not belong to the selected item")
                version_id = selected_version.asset_version_id
            else:
                version_id = asset.current_version_id
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if version_id and version_id not in asset_version_ids:
            asset_version_ids.append(version_id)

    for raw_asset_id in [*form.getlist("reference_asset_ids"), *stored_reference_file_ids]:
        raw_text = str(raw_asset_id)
        if raw_text.startswith("shared:"):
            if raw_text in stored_reference_file_ids:
                return JSONResponse(status_code=422, content={"detail": "共享参考文件暂不可用"})
            try:
                shared_asset = shared_assets.get_asset(raw_text.split(":", 1)[1])
            except AssetNotFound as error:
                return JSONResponse(status_code=404, content={"detail": str(error)})
            if shared_asset.current_version_id and shared_asset.current_version_id not in shared_asset_version_ids:
                shared_asset_version_ids.append(shared_asset.current_version_id)
            continue
        try:
            asset = assets.get_asset(session.user.user_id, raw_text)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if raw_text in stored_reference_file_ids and asset.asset_kind != "file":
            return JSONResponse(status_code=422, content={"detail": "参考文件类型无效"})
        if asset.current_version_id and asset.current_version_id not in asset_version_ids:
            asset_version_ids.append(asset.current_version_id)

    try:
        request_parameters: dict[str, object] = {
            "size": size,
            "quality": quality,
            "background": str(
                (canonical_parameters or {}).get("gpt.background")
                or form.get("background")
                or "auto"
            ).lower(),
            "output_format": output_format,
            "output_compression": output_compression,
            "moderation": moderation,
            "n": output_count,
            "prompt_fidelity": prompt_fidelity,
            "web_search": web_search,
            "main_model": str(form.get("main_model") or model_id),
            "resolution": (
                "standard" if canonical_resolution == "1K"
                else canonical_resolution.lower() if canonical_resolution
                else str(form.get("resolution") or "")
            ),
            "ratio": str(
                (canonical_parameters or {}).get("canvas.aspect_ratio")
                or form.get("ratio")
                or ""
            ),
            "orientation": str(form.get("orientation") or ""),
            "mode": mode,
            "api_mode": api_mode,
            "prompt_optimization_mode": prompt_optimization_mode,
            "seed_mode": seed_mode,
            "seed": str(seed) if seed not in {None, ""} else None,
            "capability_profile_version": form.get("capability_profile_version"),
        }
        if canonical_parameters is not None and resolved_canonical_model_id in {
            model.id for model in list_model_manifests()
        }:
            request_parameters["canonical_parameters"] = canonical_parameters
        task = tasks.create_task(
            session.user.user_id,
            provider_version_id=provider_version_id,
            model_id=model_id,
            generation_model_id=generation_model_id,
            prompt=prompt,
            request_parameters=request_parameters,
            input_bytes=input_bytes,
            input_media_type=input_media_type,
            asset_version_ids=asset_version_ids,
            shared_asset_version_ids=shared_asset_version_ids,
            provider_scope=provider_scope,
        )
    except TaskConfigurationError as error:
        return JSONResponse(status_code=409, content={"detail": _friendly_task_error(str(error))})
    try:
        providers.save_model_preference(
            session.user.user_id,
            provider_scope=provider_scope,
            provider_version_id=provider_version_id,
            generation_model_id=generation_model_id,
            parameters=canonical_parameters or {
                "size": task.request_parameters.get("size"),
                "resolution": task.request_parameters.get("resolution"),
                "ratio": task.request_parameters.get("ratio"),
                "orientation": task.request_parameters.get("orientation"),
                "output_format": task.request_parameters.get("output_format"),
                "prompt_optimization_mode": task.request_parameters.get("prompt_optimization_mode"),
                "seed_mode": task.request_parameters.get("seed_mode"),
                **(
                    {"seed": task.request_parameters.get("seed")}
                    if task.request_parameters.get("seed_mode") == "fixed"
                    else {}
                ),
            },
        )
    except GenerationModelNotFound:
        pass
    return task, {
        "provider_version_id": provider_version_id,
        "provider_scope": provider_scope,
        "model": model_id,
        "generation_model_id": generation_model_id,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "output_format": output_format,
        "output_compression": output_compression,
        "moderation": moderation,
        "n": output_count,
        "prompt_fidelity": prompt_fidelity,
        "web_search": web_search,
        "mode": mode,
        "prompt_optimization_mode": task.request_parameters.get("prompt_optimization_mode"),
        "seed_mode": task.request_parameters.get("seed_mode"),
        "seed": task.request_parameters.get("seed"),
    }


async def _json_object(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_model_preference_parameters(
    value: object,
    profile: dict[str, Any],
) -> dict[str, object]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("invalid generation model parameters")
    value = {
        **value,
        "size": value.get("size") or value.get("canvas.size"),
        "resolution": value.get("resolution") or value.get("canvas.resolution"),
        "ratio": value.get("ratio") or value.get("canvas.aspect_ratio"),
        "n": value.get("n") if value.get("n") is not None else value.get("output.count"),
        "output_format": value.get("output_format") or value.get("output.format"),
        "prompt_optimization_mode": value.get("prompt_optimization_mode")
        or value.get("legacy.prompt_optimization_mode"),
        "seed_mode": value.get("seed_mode") or value.get("legacy.seed_mode"),
        "seed": value.get("seed") if value.get("seed") is not None else value.get("legacy.seed"),
    }
    result: dict[str, object] = {}
    size = str(value.get("size") or "")
    if size:
        if size not in [str(item) for item in profile.get("sizes", [])]:
            match = re.fullmatch(r"(\d+)x(\d+)", size, flags=re.IGNORECASE)
            constraints = profile.get("size_constraints") if isinstance(profile.get("size_constraints"), dict) else {}
            if not profile.get("custom_size") or match is None:
                raise ValueError("output size is not supported by this model")
            width, height = int(match.group(1)), int(match.group(2))
            aspect = width / height if height else 0
            if (
                width < int(constraints.get("min_dimension") or 1)
                or height < int(constraints.get("min_dimension") or 1)
                or width > int(constraints.get("max_dimension") or 32768)
                or height > int(constraints.get("max_dimension") or 32768)
                or aspect < float(constraints.get("min_aspect_ratio") or 0)
                or aspect > float(constraints.get("max_aspect_ratio") or 1_000_000)
            ):
                raise ValueError("output size is not supported by this model")
        result["size"] = size.lower()
    for key in ("resolution", "ratio", "orientation"):
        raw = str(value.get(key) or "")[:32]
        if raw:
            result[key] = raw
    try:
        raw_output_count = value.get("n")
        output_count = int(
            raw_output_count
            if raw_output_count is not None
            else profile.get("min_output_count") or 1
        )
    except (TypeError, ValueError) as error:
        raise ValueError("output count must be an integer") from error
    minimum_output_count = int(profile.get("min_output_count") or 1)
    maximum_output_count = int(profile.get("max_output_count") or minimum_output_count)
    if output_count < minimum_output_count or output_count > maximum_output_count:
        raise ValueError("output count is not supported by this model")
    result["n"] = output_count
    output_format = str(value.get("output_format") or "").lower()
    supported_formats = [str(item) for item in profile.get("output_formats", [])]
    if output_format:
        if output_format not in supported_formats:
            raise ValueError("output format is not supported by this model")
        result["output_format"] = output_format
    prompt_mode = str(value.get("prompt_optimization_mode") or "off").lower()
    supported_prompt_modes = [str(item) for item in profile.get("prompt_optimization_modes", [])]
    if prompt_mode != "off" and prompt_mode not in supported_prompt_modes:
        raise ValueError("prompt optimization mode is not supported by this model")
    result["prompt_optimization_mode"] = prompt_mode
    seed_mode = str(value.get("seed_mode") or "random").lower()
    if seed_mode not in {"random", "fixed"}:
        raise ValueError("seed mode is invalid")
    seed_profile = profile.get("seed") if isinstance(profile.get("seed"), dict) else {}
    if seed_mode == "fixed":
        if not seed_profile.get("supported"):
            raise ValueError("seed is not supported by this model")
        try:
            seed = int(value.get("seed"))
        except (TypeError, ValueError) as error:
            raise ValueError("seed must be an integer") from error
        minimum = int(seed_profile.get("minimum", 0))
        maximum = int(seed_profile.get("maximum", 2147483647))
        if seed < minimum or seed > maximum:
            raise ValueError("seed is outside the supported range")
        result["seed"] = seed
    result["seed_mode"] = seed_mode
    return result


def _gallery_items(
    session: AuthenticatedSession,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
) -> list[dict[str, Any]]:
    metadata = _gallery_metadata(session.user.user_id, assets)
    items: list[dict[str, Any]] = []
    personal_assets = [
        *assets.list_assets(session.user.user_id, kind="image", limit=100),
        *assets.list_assets(session.user.user_id, kind="reference", limit=100),
    ]
    for asset in personal_assets:
        details = metadata.get(asset.asset_id, {})
        current = asset.current_version
        if current is None:
            continue
        items.append(
            {
                "id": asset.asset_id,
                "name": str(details.get("name") or asset.name),
                "category": str(details.get("category") or "portrait"),
                "prompt_note": str(details.get("prompt_note") or ""),
                "order": int(details.get("order") or 0),
                "image_url": f"/api/assets/{asset.asset_id}/download",
                "mime_type": current.mime_type,
                "scope": "personal",
                "read_only": False,
                "asset_version_id": asset.current_version_id,
                "created_at": asset.created_at,
                "updated_at": asset.updated_at,
            }
        )
    for asset in shared_assets.list_assets(limit=100):
        if asset.asset_kind not in {"image", "reference"} or asset.current_version is None:
            continue
        items.append(
            {
                "id": f"shared:{asset.asset_id}",
                "name": asset.name,
                "category": asset.category_id or "uncategorized",
                "category_name": asset.category_name or "未分类",
                "prompt_note": asset.prompt_note,
                "order": asset.sort_order,
                "image_url": f"/api/shared-assets/{asset.asset_id}/download",
                "mime_type": asset.current_version.mime_type,
                "scope": "shared",
                "read_only": True,
                "asset_version_id": asset.current_version_id,
                "created_at": asset.created_at,
                "updated_at": asset.updated_at,
            }
        )
    return sorted(items, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


def _gallery_metadata(user_id: str, assets: AssetRepository) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for _, document in _workspace_documents(user_id, assets, kind="prompt"):
        if document.get("_workspace_type") != "gallery_metadata":
            continue
        asset_id = str(document.get("asset_id") or "")
        if asset_id:
            result[asset_id] = document
    return result


def _personal_gallery_name_exists(
    user_id: str,
    assets: AssetRepository,
    name: str,
    *,
    exclude_asset_id: str | None = None,
) -> bool:
    normalized = " ".join(name.replace("\x00", "").split()).casefold()
    if not normalized:
        return False
    metadata = _gallery_metadata(user_id, assets)
    personal_assets = [
        *assets.list_assets(user_id, kind="image", limit=100),
        *assets.list_assets(user_id, kind="reference", limit=100),
    ]
    for asset in personal_assets:
        if asset.asset_id == exclude_asset_id:
            continue
        details = metadata.get(asset.asset_id, {})
        existing_name = str(details.get("name") or asset.name)
        if " ".join(existing_name.replace("\x00", "").split()).casefold() == normalized:
            return True
    return False


def _workspace_documents(
    user_id: str,
    assets: AssetRepository,
    *,
    kind: str,
) -> list[tuple[Any, dict[str, Any]]]:
    result: list[tuple[Any, dict[str, Any]]] = []
    for asset in assets.list_assets(user_id, kind=kind, limit=100):
        if asset.current_version is None:
            continue
        document = _read_json_file(assets.asset_path(asset.current_version))
        if document is not None:
            result.append((asset, document))
    return result


def _save_workspace_document(
    user_id: str,
    assets: AssetRepository,
    document: dict[str, Any],
    *,
    name: str,
    kind: str = "prompt",
):
    workspace_type = str(document.get("_workspace_type") or "")
    document_asset_id = str(document.get("asset_id") or "")
    for asset, existing in _workspace_documents(user_id, assets, kind=kind):
        if str(existing.get("_workspace_type") or "") != workspace_type:
            continue
        if workspace_type == "gallery_metadata" and str(existing.get("asset_id") or "") != document_asset_id:
            continue
        if workspace_type in {"gallery_categories", "template_categories", "color_palette", "workspace_settings"}:
            return _update_workspace_document(user_id, assets, asset.asset_id, document)
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return assets.create_asset(
        user_id,
        asset_kind=kind,
        name=name[:160],
        original_filename=f"{kind}.json",
        mime_type="text/plain",
        content=encoded,
    )


def _update_workspace_document(
    user_id: str,
    assets: AssetRepository,
    asset_id: str,
    document: dict[str, Any],
):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return assets.create_version(
        user_id,
        asset_id,
        original_filename="workspace.json",
        mime_type="text/plain",
        content=encoded,
    )


def _read_json_file(path: Any) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _read_text_file(path: Any) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return ""


def _normalize_snippet(payload: dict[str, Any]) -> dict[str, Any] | None:
    tag = str(payload.get("tag") or "").strip().lstrip("~～〜∼˜")[:64]
    content = str(payload.get("content") or "").strip()[:16_000]
    if not tag or not content:
        return None
    return {
        "_workspace_type": "snippet",
        "tag": tag,
        "title": str(payload.get("title") or tag).strip()[:160] or tag,
        "content": content,
        "category": str(payload.get("category") or "常用").strip()[:64] or "常用",
        "order": int(payload.get("order") or 0),
    }


def _prompt_snippets(
    session: AuthenticatedSession,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
) -> list[dict[str, Any]]:
    snippets: list[dict[str, Any]] = []
    for asset, document in _workspace_documents(session.user.user_id, assets, kind="prompt"):
        if document.get("_workspace_type") != "snippet":
            continue
        normalized = _normalize_snippet(document)
        if normalized is None:
            continue
        normalized.update({"id": asset.asset_id, "scope": "personal", "read_only": False, "created_at": asset.created_at, "updated_at": asset.updated_at})
        snippets.append(normalized)
    for asset in shared_assets.list_assets(limit=100):
        if asset.asset_kind != "prompt" or asset.current_version is None:
            continue
        document = _read_json_file(shared_assets.asset_path(asset.current_version))
        normalized = _normalize_snippet(document or {"tag": asset.name, "title": asset.name, "content": _read_text_file(shared_assets.asset_path(asset.current_version))})
        if normalized is None:
            continue
        normalized.update({"id": f"shared:{asset.asset_id}", "scope": "shared", "read_only": True, "created_at": asset.created_at, "updated_at": asset.updated_at})
        snippets.append(normalized)
    return sorted(snippets, key=lambda item: (int(item.get("order") or 0), str(item.get("tag") or "")))


def _normalize_template(payload: dict[str, Any]) -> dict[str, Any] | None:
    title = str(payload.get("title") or "").strip()[:160]
    content = str(payload.get("content") or "").strip()[:16_000]
    if not title or not content:
        return None
    return {
        "_workspace_type": "template",
        "title": title,
        "short_title": str(payload.get("short_title") or title).strip()[:12] or title[:12],
        "content": content,
        "category": str(payload.get("category") or "常用").strip()[:64] or "常用",
        "tags": [str(item).strip()[:64] for item in payload.get("tags", []) if str(item).strip()][:20],
        "mode": str(payload.get("mode") or "any")[:16],
        "model_hint": str(payload.get("model_hint") or "gpt-image-2")[:160],
        "notes": str(payload.get("notes") or "")[:2000],
        "thumbnail_url": str(payload.get("thumbnail_url") or "")[:2048],
        "favorite": bool(payload.get("favorite")),
        "variables": [str(item).strip()[:64] for item in payload.get("variables", []) if str(item).strip()][:50],
        "usage_count": max(0, int(payload.get("usage_count") or 0)),
    }


def _prompt_template_response(
    session: AuthenticatedSession,
    assets: AssetRepository,
    shared_assets: SharedAssetRepository,
) -> dict[str, Any]:
    templates: list[dict[str, Any]] = []
    for asset, document in _workspace_documents(session.user.user_id, assets, kind="template"):
        normalized = _normalize_template(document)
        if normalized is None:
            continue
        normalized.update({"id": asset.asset_id, "scope": "personal", "read_only": False, "created_at": asset.created_at, "updated_at": asset.updated_at})
        templates.append(normalized)
    for asset in shared_assets.list_assets(limit=100):
        if asset.asset_kind != "template" or asset.current_version is None:
            continue
        path = shared_assets.asset_path(asset.current_version)
        document = _read_json_file(path)
        normalized = _normalize_template(document or {"title": asset.name, "content": _read_text_file(path)})
        if normalized is None:
            continue
        normalized.update({"id": f"shared:{asset.asset_id}", "scope": "shared", "read_only": True, "created_at": asset.created_at, "updated_at": asset.updated_at})
        templates.append(normalized)
    categories = _workspace_categories(session.user.user_id, assets, kind="template")
    return {"templates": templates, "categories": categories}


def _workspace_categories(user_id: str, assets: AssetRepository, *, kind: str) -> list[dict[str, Any]]:
    workspace_type = "gallery_categories" if kind == "gallery" else "template_categories"
    for _, document in _workspace_documents(user_id, assets, kind="prompt"):
        if document.get("_workspace_type") == workspace_type and isinstance(document.get("categories"), list):
            return [item for item in document["categories"] if isinstance(item, dict)]
    if kind == "gallery":
        return [
            {"id": "portrait", "name": "人像", "prompt_role": "人像参考", "order": 10, "locked": False},
            {"id": "character", "name": "角色", "prompt_role": "角色参考", "order": 20, "locked": False},
            {"id": "product", "name": "产品", "prompt_role": "产品参考", "order": 30, "locked": False},
        ]
    return [
        {"id": name, "name": name, "order": (index + 1) * 10}
        for index, name in enumerate(["常用", "人像", "产品", "修复", "海报", "电商"])
    ]


def _save_workspace_categories(
    user_id: str,
    assets: AssetRepository,
    *,
    kind: str,
    categories: list[dict[str, Any]],
) -> None:
    workspace_type = "gallery_categories" if kind == "gallery" else "template_categories"
    _save_workspace_document(
        user_id,
        assets,
        {"_workspace_type": workspace_type, "categories": categories},
        name=workspace_type,
    )


def _unique_category_id(name: str, categories: list[dict[str, Any]]) -> str:
    import re

    base = re.sub(r"[^a-z0-9_-]+", "-", name.lower()).strip("-") or f"category-{len(categories) + 1}"
    existing = {str(item.get("id") or "") for item in categories}
    if base not in existing:
        return base
    index = 2
    while f"{base}-{index}" in existing:
        index += 1
    return f"{base}-{index}"


def _color_palette(user_id: str, assets: AssetRepository) -> dict[str, Any]:
    for _, document in _workspace_documents(user_id, assets, kind="prompt"):
        if document.get("_workspace_type") == "color_palette":
            return {
                "version": 1,
                "favorites": document.get("favorites", []),
                "recent_colors": document.get("recent_colors", []),
                "recent_limit": int(document.get("recent_limit") or 6),
            }
    defaults = ["#FFFFFF", "#111111", "#F6E8D8", "#E6F0EC", "#457B66", "#F4B183", "#B7D7F0", "#F8D7DA"]
    return {
        "version": 1,
        "favorites": [{"name": value, "hex": value, "order": (index + 1) * 10} for index, value in enumerate(defaults)],
        "recent_colors": [],
        "recent_limit": 6,
    }


def _history_task_summary(task: GenerationTask) -> dict[str, Any]:
    size = str(task.request_parameters.get("size") or "")
    width, height = _size_parts(size)
    ratio = _ratio(width, height)
    orientation = "square" if width and width == height else "landscape" if width > height else "portrait" if height else ""
    generated_count = len([item for item in task_output_records(task) if not bool(item.get("deleted"))])
    output_count = max(1, min(4, int(task.request_parameters.get("n") or 1)))
    failed_count = len(task.request_parameters.get("failed_output_indices", [])) if task.status == "partial_failed" else output_count if task.status == "failed" else 0
    return {
        "task_id": task.task_id,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "completed_at": task.completed_at or "",
        "status": task.status,
        "mode": str(task.request_parameters.get("mode") or ("edit" if task.input_relative_path else "generate")),
        "size": size,
        "quality": str(task.request_parameters.get("quality") or "auto"),
        "prompt_mode": str(task.request_parameters.get("prompt_fidelity") or "original"),
        "ratio": ratio,
        "orientation": orientation,
        "backend": "openai_responses" if task.request_parameters.get("api_mode") == "responses" else "openai_images",
        "provider": f"{task.provider_scope}-{task.provider_version_id}",
        "archived": bool(task.archived_at),
        "archived_at": task.archived_at,
        "generated_count": generated_count if task.status in {"completed", "partial_failed"} else 0,
        "failed_count": failed_count,
        "total_count": output_count,
        "thumbnail_url": f"/api/tasks/{task.task_id}/thumbnail" if task.thumbnail_relative_path else "",
        "prompt_preview": task.prompt[:240],
    }


def _history_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    def facets(key: str) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for item in items:
            value = str(item.get(key) or "")
            if value:
                counts[value] = counts.get(value, 0) + 1
        return [{"value": value, "count": count} for value, count in sorted(counts.items())]

    month_counts: dict[str, int] = {}
    for item in items:
        month = str(item.get("created_at") or "")[:7]
        if month:
            month_counts[month] = month_counts.get(month, 0) + 1
    return {
        "total": len(items),
        "archived_total": sum(1 for item in items if item.get("archived")),
        "months": [{"month": month, "count": count} for month, count in sorted(month_counts.items(), reverse=True)],
        "modes": facets("mode"),
        "prompt_modes": facets("prompt_mode"),
        "qualities": facets("quality"),
        "ratios": facets("ratio"),
        "orientations": facets("orientation"),
        "backends": facets("backend"),
        "providers": facets("provider"),
    }


def _filter_history_tasks(items: list[dict[str, Any]], request: Request) -> list[dict[str, Any]]:
    query = request.query_params
    text = str(query.get("q") or "").strip().lower()
    result: list[dict[str, Any]] = []
    for item in items:
        if text and text not in str(item.get("prompt_preview") or "").lower() and text not in str(item.get("task_id") or "").lower():
            continue
        archived = query.get("archived")
        if archived == "true" and not item.get("archived"):
            continue
        if archived == "false" and item.get("archived"):
            continue
        month = query.get("month")
        if month and not str(item.get("created_at") or "").startswith(month):
            continue
        mismatch = False
        for key in ("mode", "prompt_mode", "quality", "ratio", "orientation", "backend", "provider"):
            expected = query.get(key)
            if expected and str(item.get(key) or "") != expected:
                mismatch = True
                break
        if not mismatch:
            result.append(item)
    return result


def _size_parts(size: str) -> tuple[int, int]:
    try:
        width, height = size.lower().split("x", 1)
        return int(width), int(height)
    except (ValueError, AttributeError):
        return 0, 0


def _ratio(width: int, height: int) -> str:
    if not width or not height:
        return ""
    import math

    divisor = math.gcd(width, height)
    return f"{width // divisor}:{height // divisor}"


def _available_providers(
    session: AuthenticatedSession,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
) -> list[dict[str, Any]]:
    catalog = {item.provider_version_id: item for item in providers.list_catalog(active_only=True)}
    department = {item.provider_version_id: item for item in departments.list_credentials(active_only=True)}
    result: list[dict[str, Any]] = []
    for provider_version_id, credential in department.items():
        catalog_item = catalog.get(provider_version_id)
        if catalog_item is None or not credential.has_credential or not credential.is_active:
            continue
        department_models = providers.list_generation_models(
            provider_version_id=provider_version_id,
            owner_user_id=None,
        )
        result.append(
            _provider_item(
                catalog_item,
                scope="department",
                credential=credential,
                models=[model for model in department_models if model.get("is_enabled")],
            )
        )
    return result


def _parameter_catalog_payload(parameter: Any) -> dict[str, Any]:
    payload = asdict(parameter)
    payload["allowed_values"] = list(parameter.allowed_values)
    payload["operations"] = sorted(parameter.operations)
    payload["visible_when"] = [asdict(condition) for condition in parameter.visible_when]
    payload["object_choices"] = [
        {
            **asdict(row),
            "allowed_values": list(row.allowed_values),
            "label_keys": list(row.label_keys),
        }
        for row in parameter.object_choices
    ]
    payload["object_presets"] = [
        {
            "id": preset.id,
            "label_key": preset.label_key,
            "value": dict(preset.value),
            "matches_empty": preset.matches_empty,
        }
        for preset in parameter.object_presets
    ]
    return payload


def _legacy_parameter_payload(
    *,
    parameter_id: str,
    label_key: str,
    group: str,
    control: str,
    value_type: str,
    default: object,
    allowed_values: list[object] | None = None,
    operations: list[str] | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
    step: int | None = None,
    visible_when: list[dict[str, object]] | None = None,
    full_width: bool = False,
) -> dict[str, object]:
    return {
        "id": parameter_id,
        "label_key": label_key,
        "group": group,
        "control": control,
        "value_type": value_type,
        "default": default,
        "allowed_values": allowed_values or [],
        "scope": "model",
        "minimum": minimum,
        "maximum": maximum,
        "step": step,
        "visible_when": visible_when or [],
        "operations": operations or ["generate", "edit"],
        "full_width": full_width,
        "object_choices": [],
        "object_presets": [],
    }


def _legacy_catalog_model_payload(model: dict[str, object]) -> dict[str, object]:
    profile = get_model_capability_profile(
        str(model.get("capability_profile_id") or "generic-basic")
    )
    operations = [str(item) for item in profile.get("task_modes", [])]
    sizes = [str(item) for item in profile.get("sizes", [])]
    output_formats = [str(item) for item in profile.get("output_formats", [])]
    parameters = [
        _legacy_parameter_payload(
            parameter_id="canvas.size",
            label_key="output.size",
            group="canvas",
            control="text" if profile.get("custom_size") else "select",
            value_type="string",
            default=str(
                profile.get("default_size")
                or (sizes[0] if sizes else "1024x1024")
            ),
            allowed_values=[] if profile.get("custom_size") else sizes,
            operations=operations,
            full_width=True,
        ),
        _legacy_parameter_payload(
            parameter_id="output.format",
            label_key="output.format",
            group="generation",
            control="segmented",
            value_type="string",
            default=str(profile.get("default_output_format") or "png"),
            allowed_values=output_formats,
            operations=operations,
        ),
        _legacy_parameter_payload(
            parameter_id="output.count",
            label_key="output.quantity",
            group="generation",
            control="segmented",
            value_type="integer",
            default=int(profile.get("min_output_count") or 1),
            allowed_values=list(
                range(
                    int(profile.get("min_output_count") or 1),
                    int(profile.get("max_output_count") or 1) + 1,
                )
            ),
            operations=operations,
            minimum=int(profile.get("min_output_count") or 1),
            maximum=int(profile.get("max_output_count") or 1),
            step=1,
        ),
    ]
    prompt_modes = [str(item) for item in profile.get("prompt_optimization_modes", [])]
    if prompt_modes:
        parameters.append(
            _legacy_parameter_payload(
                parameter_id="legacy.prompt_optimization_mode",
                label_key="generationModel.promptOptimization",
                group="advanced",
                control="segmented",
                value_type="string",
                default="off",
                allowed_values=["off", *prompt_modes],
                operations=operations,
            )
        )
    seed = profile.get("seed") if isinstance(profile.get("seed"), dict) else {}
    if seed.get("supported"):
        parameters.extend(
            [
                _legacy_parameter_payload(
                    parameter_id="legacy.seed_mode",
                    label_key="generationModel.seed",
                    group="advanced",
                    control="segmented",
                    value_type="string",
                    default="random",
                    allowed_values=["random", "fixed"],
                    operations=operations,
                ),
                _legacy_parameter_payload(
                    parameter_id="legacy.seed",
                    label_key="generationModel.seed",
                    group="advanced",
                    control="number",
                    value_type="integer",
                    default=int(seed.get("minimum") or 0),
                    operations=operations,
                    minimum=int(seed.get("minimum") or 0),
                    maximum=int(seed.get("maximum") or 2147483647),
                    step=1,
                    visible_when=[
                        {
                            "parameter_id": "legacy.seed_mode",
                            "operator": "equals",
                            "value": "fixed",
                        }
                    ],
                ),
            ]
        )
    return {
        "id": str(model.get("canonical_model_id") or model.get("model_id") or ""),
        "family_id": str(model.get("model_family_id") or "custom-image"),
        "display_name": str(model.get("display_name") or model.get("model_id") or ""),
        "official_model_id": str(model.get("model_id") or ""),
        "version": int(model.get("capability_profile_version") or 1),
        "operations": operations,
        "parameters": parameters,
        "input_constraints": {
            "max_images": int(profile.get("max_reference_images") or 0),
            "supports_mask": bool(
                isinstance(profile.get("phase_features"), dict)
                and profile["phase_features"].get("precise_edit")
            ),
            "supports_reference_files": "responses" in profile.get("api_modes", []),
        },
        "expand_advanced_parameters": bool(prompt_modes or seed.get("supported")),
    }


def _generation_catalog_payload(
    session: AuthenticatedSession,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
) -> dict[str, object]:
    available = _available_providers(session, providers, departments)
    registry = default_registry()
    catalog_providers: list[dict[str, object]] = []
    canonical_ids: set[str] = set()
    legacy_manifests: dict[str, dict[str, object]] = {}
    default_provider_by_model: dict[str, str] = {}
    known_manifests = {model.id: model for model in list_model_manifests()}
    for provider in available:
        provider_id = str(provider["id"])
        bindings: list[dict[str, object]] = []
        for model in provider.get("models", []):
            if not isinstance(model, dict) or not model.get("is_enabled"):
                continue
            canonical_model_id = str(
                model.get("canonical_model_id") or model.get("model_id") or ""
            )
            protocol_profile = str(model.get("protocol_profile") or "openai_images")
            parameter_codec = str(model.get("parameter_codec") or "gpt_openai_images")
            binding_operations = list(model.get("supported_operations") or [])
            if canonical_model_id in known_manifests:
                try:
                    registry.protocol(protocol_profile)
                    registry.codec(parameter_codec)
                except ValueError:
                    continue
                if not binding_operations:
                    binding_operations = list(
                        known_manifests[canonical_model_id].operations
                    )
            else:
                try:
                    legacy_manifest = legacy_manifests.setdefault(
                        canonical_model_id,
                        _legacy_catalog_model_payload(model),
                    )
                except KeyError:
                    continue
                if not binding_operations:
                    binding_operations = list(legacy_manifest["operations"])
            canonical_ids.add(canonical_model_id)
            if model.get("is_default"):
                default_provider_by_model.setdefault(canonical_model_id, provider_id)
            bindings.append(
                {
                    "id": str(model.get("generation_model_id") or ""),
                    "generation_model_id": str(model.get("generation_model_id") or ""),
                    "canonical_model_id": canonical_model_id,
                    "remote_model_id": str(model.get("model_id") or ""),
                    "model_family_id": str(model.get("model_family_id") or ""),
                    "protocol_profile": protocol_profile,
                    "parameter_codec": parameter_codec,
                    "operations": binding_operations,
                    "append_aspect_ratio_prompt": bool(
                        model.get("append_aspect_ratio_prompt", False)
                    ),
                    "display_name": str(model.get("display_name") or model.get("model_id") or ""),
                    "available": True,
                }
            )
        if not bindings:
            continue
        catalog_providers.append(
            {
                "id": str(provider["id"]),
                "name": str(provider["name"]),
                "builtin": False,
                "provider_scope": str(provider["provider_scope"]),
                "provider_version_id": str(provider["provider_version_id"]),
                "available": True,
                "bindings": bindings,
            }
        )
    manifests = [
        {
            "id": model.id,
            "family_id": model.family_id,
            "display_name": model.display_name,
            "official_model_id": model.official_model_id,
            "version": model.version,
            "operations": sorted(model.operations),
            "parameters": [
                _parameter_catalog_payload(parameter) for parameter in model.parameters
            ],
            "input_constraints": asdict(model.input_constraints),
            "expand_advanced_parameters": model.expand_advanced_parameters,
        }
        for model in list_model_manifests()
        if model.id in canonical_ids
    ] + list(legacy_manifests.values())
    family_ids = {model["family_id"] for model in manifests}
    known_families = {
        family.id: asdict(family) for family in list_model_families()
    }
    for family_id in family_ids - set(known_families):
        family_name = "Seedream" if family_id == "seedream-image" else "自定义"
        known_families[family_id] = {
            "id": family_id,
            "display_name": family_name,
            "short_name": family_name,
            "label_key": f"modelFamily.{family_id}",
        }
    return {
        "schema_version": 1,
        "manifest_version": MODEL_MANIFEST_VERSION,
        "families": [known_families[family_id] for family_id in known_families if family_id in family_ids],
        "models": manifests,
        "providers": catalog_providers,
        "default_provider_by_model": default_provider_by_model,
        "codex": {"available": False, "mode": "images"},
        "preferences": providers.list_model_preferences(session.user.user_id),
    }


def _save_department_api_settings(
    session: AuthenticatedSession,
    payload: dict[str, Any],
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
) -> None:
    actor_user_id = session.user.user_id
    catalog = {item.provider_version_id: item for item in providers.list_catalog(active_only=False)}
    for item in payload.get("providers", []):
        if not isinstance(item, dict):
            continue
        raw_id = str(item.get("id") or "").strip()
        scope, provider_version_id = _split_provider_id(raw_id)
        existing = catalog.get(provider_version_id) if scope == "department" else None
        raw_api_key = item.get("api_key")
        if raw_api_key is not None and (not isinstance(raw_api_key, str) or len(raw_api_key) > 4096):
            raise ValueError("invalid API key")
        api_key = str(raw_api_key or "").strip()

        if existing is None:
            raise ProviderVersionNotFound(
                "PATCH /api/api-settings only updates existing providers"
            )

        validated = _workspace_provider_payload(item, existing=existing)
        if not api_key and item.get("api_key_source_provider_id"):
            api_key = _department_source_api_key(item, departments)
        if _workspace_provider_changed(existing, validated):
            updated = providers.update_provider_version(
                actor_user_id,
                provider_version_id=existing.provider_version_id,
                display_name=validated.display_name,
                base_url=validated.base_url,
                api_mode=validated.api_mode,
                models=[
                    {
                        **model.canonical_payload(),
                        "generation_model_id": model.generation_model_id,
                    }
                    for model in validated.models
                ],
                parameter_constraints=validated.parameter_constraints,
                department_api_key=api_key or None,
            )
            catalog[updated.provider_version_id] = updated
        elif api_key:
            departments.save_credential(
                actor_user_id,
                provider_version_id=existing.provider_version_id,
                api_key=api_key,
            )


def _department_source_api_key(item: dict[str, Any], departments: DepartmentProviderRepository) -> str:
    raw_source = str(item.get("api_key_source_provider_id") or "").strip()
    if not raw_source:
        return ""
    scope, provider_version_id = _split_provider_id(raw_source)
    if scope != "department" or not provider_version_id:
        raise ValueError("invalid department provider source")
    return departments.resolve_api_key(provider_version_id=provider_version_id)


def _workspace_provider_payload(
    item: dict[str, Any],
    *,
    existing: ProviderVersion | None = None,
) -> ProviderVersionPayload:
    api_mode = str(item.get("api_mode") or (existing.api_mode if existing is not None else "images")).strip()
    raw_models = item.get("models")
    if isinstance(raw_models, list) and raw_models:
        models: list[dict[str, object]] = []
        for raw_model in raw_models:
            if not isinstance(raw_model, dict):
                raise ValueError("invalid generation model")
            models.append(
                {
                    key: raw_model[key]
                    for key in (
                        "generation_model_id",
                        "display_name",
                        "model_id",
                        "capability_profile_id",
                        "model_family_id",
                        "canonical_model_id",
                        "protocol_profile",
                        "parameter_codec",
                        "supported_operations",
                        "append_aspect_ratio_prompt",
                        "is_default",
                        "is_enabled",
                    )
                    if key in raw_model and raw_model[key] is not None
                }
            )
    else:
        image_model = str(
            item.get("image_model")
            or (_first_provider_model(existing) if existing is not None else "")
        ).strip()
        capabilities = ["image_generation", "image_input"]
        if api_mode == "responses":
            capabilities.append("text_input")
        models = [{"model_id": image_model, "capabilities": capabilities}]
    return ProviderVersionPayload.model_validate(
        {
            "provider_key": existing.provider_key if existing is not None else _workspace_provider_key(item),
            "display_name": str(
                item.get("name")
                or (existing.display_name if existing is not None else "")
            ).strip(),
            "base_url": str(
                item.get("base_url")
                or (existing.base_url if existing is not None else "")
            ).strip(),
            "api_mode": api_mode,
            "models": models,
            "parameter_constraints": dict(existing.parameter_constraints) if existing is not None else {},
        }
    )


def _workspace_provider_key(item: dict[str, Any]) -> str:
    candidate = str(item.get("provider_key") or item.get("id") or item.get("name") or "provider").lower()
    candidate = re.sub(r"[^a-z0-9-]+", "-", candidate).strip("-")
    if len(candidate) < 2:
        candidate = f"provider-{candidate or 'custom'}"
    return candidate[:64].rstrip("-")


def _first_provider_model(provider: ProviderVersion | None) -> str:
    if provider is None or not provider.models or not isinstance(provider.models[0], dict):
        return ""
    return str(provider.models[0].get("model_id") or "").strip()


def _workspace_provider_changed(existing: ProviderVersion, desired: ProviderVersionPayload) -> bool:
    existing_models = [
        {
            "display_name": str(model.get("display_name") or model.get("model_id") or ""),
            "model_id": str(model.get("model_id") or ""),
            "capability_profile_id": str(model.get("capability_profile_id") or "generic-basic"),
            "model_family_id": str(model.get("model_family_id") or ""),
            "canonical_model_id": str(model.get("canonical_model_id") or ""),
            "protocol_profile": str(model.get("protocol_profile") or ""),
            "parameter_codec": str(model.get("parameter_codec") or ""),
            "supported_operations": list(model.get("supported_operations") or []),
            "append_aspect_ratio_prompt": bool(model.get("append_aspect_ratio_prompt", False)),
            "is_default": bool(model.get("is_default")),
            "is_enabled": bool(model.get("is_enabled", True)),
        }
        for model in existing.models
        if isinstance(model, dict)
    ]
    desired_models = [
        {
            "display_name": model.display_name or model.model_id,
            "model_id": model.model_id,
            "capability_profile_id": model.capability_profile_id or "generic-basic",
            "model_family_id": model.model_family_id or "",
            "canonical_model_id": model.canonical_model_id or "",
            "protocol_profile": model.protocol_profile or "",
            "parameter_codec": model.parameter_codec or "",
            "supported_operations": list(model.supported_operations or []),
            "append_aspect_ratio_prompt": bool(model.append_aspect_ratio_prompt),
            "is_default": bool(model.is_default),
            "is_enabled": model.is_enabled,
        }
        for model in desired.models
    ]
    return any(
        (
            existing.display_name != desired.display_name,
            existing.base_url.rstrip("/") != desired.base_url.rstrip("/"),
            existing.api_mode != desired.api_mode,
            existing_models != desired_models,
        )
    )


def _api_settings(
    session: AuthenticatedSession,
    providers: ProviderRepository,
    departments: DepartmentProviderRepository,
) -> dict[str, object]:
    is_admin = session.user.role == "admin"
    catalog = providers.list_catalog(active_only=not is_admin)
    personal = {item.provider_version_id: item for item in providers.list_personal_credentials(session.user.user_id)}
    department = {item.provider_version_id: item for item in departments.list_credentials(active_only=False)}
    items: list[dict[str, Any]] = []
    if is_admin:
        for catalog_item in catalog:
            items.append(
                _provider_item(
                    catalog_item,
                    scope="department",
                    credential=department.get(catalog_item.provider_version_id),
                    models=providers.list_generation_models(
                        provider_version_id=catalog_item.provider_version_id,
                        owner_user_id=None,
                    ),
                    read_only=False,
                    catalog_fields_read_only=False,
                    include_scope_label=False,
                )
            )
    else:
        for catalog_item in catalog:
            items.append(
                _provider_item(
                    catalog_item,
                    scope="personal",
                    credential=personal.get(catalog_item.provider_version_id),
                    models=(
                        providers.list_generation_models(
                            provider_version_id=catalog_item.provider_version_id,
                            owner_user_id=session.user.user_id,
                        )
                        or list(catalog_item.models or [])
                    ),
                    read_only=False,
                    catalog_fields_read_only=True,
                )
            )
        for catalog_item in catalog:
            credential = department.get(catalog_item.provider_version_id)
            if credential and credential.has_credential and credential.is_active:
                items.append(
                    _provider_item(
                        catalog_item,
                        scope="department",
                        credential=credential,
                        models=[
                            model
                            for model in providers.list_generation_models(
                                provider_version_id=catalog_item.provider_version_id,
                                owner_user_id=None,
                            )
                            if model.get("is_enabled")
                        ],
                        read_only=True,
                        catalog_fields_read_only=True,
                    )
                )
    preferences = providers.list_model_preferences(session.user.user_id)
    selection_by_provider = {
        (
            str(item.get("provider_scope") or ""),
            str(item.get("provider_version_id") or ""),
        ): str(item.get("generation_model_id") or "")
        for item in preferences.get("selections", [])
        if isinstance(item, dict)
    }
    for item in items:
        models = [model for model in item.get("models", []) if isinstance(model, dict)]
        available_models = [model for model in models if model.get("is_enabled")]
        available_ids = {
            str(model.get("generation_model_id") or "")
            for model in available_models
        }
        saved_id = selection_by_provider.get(
            (str(item.get("provider_scope") or ""), str(item.get("provider_version_id") or "")),
            "",
        )
        default_model = next(
            (model for model in available_models if model.get("is_default")),
            available_models[0] if available_models else None,
        )
        if saved_id and saved_id in available_ids:
            item["selected_generation_model_id"] = saved_id
            item["model_selection_reason"] = "saved"
        elif default_model is not None:
            item["selected_generation_model_id"] = str(default_model.get("generation_model_id") or "")
            if saved_id:
                item["model_selection_reason"] = "saved_unavailable_default"
            else:
                item["model_selection_reason"] = "default" if default_model.get("is_default") else "first_available"
        else:
            item["selected_generation_model_id"] = ""
            item["model_selection_reason"] = "no_models"
    active = next(
        (
            item["id"]
            for item in items
            if item.get("api_key_set") and item.get("is_active")
        ),
        next(
            (item["id"] for item in items if item.get("is_active")),
            items[0]["id"] if items else "",
        ),
    )
    return {
        "codex_mode": "images",
        "active_provider_id": active,
        "providers": items,
        "allow_new_provider": is_admin,
        "credential_scope": "department" if is_admin else "personal",
        "model_preferences": preferences,
    }


def _provider_item(
    catalog_item: Any,
    *,
    scope: str,
    credential: Any,
    models: list[dict[str, object]] | None = None,
    read_only: bool | None = None,
    catalog_fields_read_only: bool = True,
    include_scope_label: bool = True,
) -> dict[str, Any]:
    resolved_models = list(catalog_item.models or []) if models is None else list(models)
    default_model = next(
        (model for model in resolved_models if isinstance(model, dict) and model.get("is_default")),
        resolved_models[0] if resolved_models else None,
    )
    first_model = str(default_model.get("model_id")) if isinstance(default_model, dict) else ""
    label = "个人" if scope == "personal" else "部门"
    return {
        "id": f"{scope}-{catalog_item.provider_version_id}",
        "provider_version_id": catalog_item.provider_version_id,
        "provider_key": catalog_item.provider_key,
        "version_number": catalog_item.version_number,
        "provider_scope": scope,
        "name": f"{catalog_item.display_name} · {label}" if include_scope_label else catalog_item.display_name,
        "base_url": catalog_item.base_url,
        "image_model": first_model,
        "models": resolved_models,
        "api_mode": catalog_item.api_mode,
        "images_concurrency": 1,
        "api_key_set": bool(credential and credential.has_credential and credential.is_active),
        "api_key_masked": str(getattr(credential, "api_key_mask", "") or ""),
        "is_active": bool(catalog_item.is_active),
        "read_only": scope == "department" if read_only is None else read_only,
        "catalog_fields_read_only": catalog_fields_read_only,
    }


def _workspace_models_payload(models: list[object]) -> list[Any]:
    sanitized: list[dict[str, object]] = []
    for item in models:
        if not isinstance(item, dict):
            raise ValueError("invalid generation model")
        sanitized.append(
            {
                key: item[key]
                for key in (
                    "generation_model_id",
                    "display_name",
                    "model_id",
                    "capability_profile_id",
                    "model_family_id",
                    "canonical_model_id",
                    "protocol_profile",
                    "parameter_codec",
                    "supported_operations",
                    "append_aspect_ratio_prompt",
                    "is_default",
                    "is_enabled",
                )
                if key in item and item[key] is not None
            }
        )
    payload = ProviderVersionPayload.model_validate(
        {
            "provider_key": "personal-models",
            "display_name": "Personal Models",
            "base_url": "https://models.invalid/v1",
            "api_mode": "images",
            "models": sanitized,
        }
    )
    return payload.models


def _split_provider_id(value: object) -> tuple[str, str]:
    text = str(value or "").strip()
    if text.startswith("department-"):
        return "department", text.removeprefix("department-")
    if text.startswith("personal-"):
        return "personal", text.removeprefix("personal-")
    if ":" in text:
        raw_scope, provider_version_id = text.split(":", 1)
        return ("department" if raw_scope == "department" else "personal"), provider_version_id
    return "personal", text


def _normalize_size(value: object) -> str:
    text = str(value or "").strip().lower()
    if text and "x" in text:
        width, _, height = text.partition("x")
        if width.isdigit() and height.isdigit() and 32 <= int(width) <= 99999 and 32 <= int(height) <= 99999:
            return f"{int(width)}x{int(height)}"
    return "1024x1024"


def _canonical_parameters_from_form(form: FormData) -> dict[str, object] | None:
    raw = form.get("parameters_json")
    if raw is None or raw == "":
        return None
    text = str(raw)
    if len(text.encode("utf-8")) > 64 * 1024:
        raise ValueError("模型参数过大")
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError("模型参数格式无效") from error
    if not isinstance(value, dict):
        raise ValueError("模型参数必须是 JSON 对象")
    return value


def _friendly_task_error(message: str) -> str:
    translations = {
        "personal provider credential was not found": "个人供应商凭据未配置",
        "active department provider credential was not found": "部门供应商当前不可用",
        "department quota exceeded": "部门额度不足",
        "asset quota exceeded": "个人存储空间不足",
    }
    return translations.get(message, message)


def _query_limit(request: Request) -> int | None:
    try:
        return min(max(int(request.query_params.get("limit", "50")), 1), 100)
    except ValueError:
        return None


def _default_workspace_settings() -> dict[str, str]:
    return {
        "locale": "zh-CN",
        "input_root": "服务器受保护存储",
        "output_root": "服务器受保护存储",
        "gallery_root": "服务器受保护存储",
        "source_data_root": "服务器受保护存储",
    }


def _workspace_settings(user_id: str, assets: AssetRepository) -> dict[str, str]:
    settings = _default_workspace_settings()
    for _, document in _workspace_documents(user_id, assets, kind="prompt"):
        if document.get("_workspace_type") == "workspace_settings":
            locale = document.get("locale")
            if isinstance(locale, str):
                settings["locale"] = locale
            break
    return settings


def _workspace_task_file(
    request: Request,
    task_id: str,
    *,
    tasks: GenerationTaskRepository,
    kind: str,
    output_index: int,
):
    session: AuthenticatedSession = request.state.auth_session
    try:
        task = tasks.get_task(session.user.user_id, task_id)
        path = (
            tasks.thumbnail_path(task, output_index)
            if kind == "thumbnail"
            else tasks.result_path(task, output_index)
        )
    except TaskNotFound as error:
        return JSONResponse(status_code=404, content={"detail": str(error)})
    if task.status not in {"completed", "partial_failed"} or not path.is_file():
        return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
    headers = {"Cache-Control": "no-store"}
    records = task_output_records(task)
    record = records[output_index - 1] if 0 < output_index <= len(records) else {}
    if kind == "download":
        headers["Content-Disposition"] = (
            f'attachment; filename="task-{task_id}-image-{output_index}.{_task_extension(task, record)}"'
        )
    return FileResponse(
        path,
        media_type="image/jpeg" if kind == "thumbnail" else str(record.get("media_type") or task.result_media_type),
        headers=headers,
    )


def _task_extension(task: GenerationTask, output: dict[str, object] | None = None) -> str:
    media_type = str((output or {}).get("media_type") or task.result_media_type or "")
    return {"image/jpeg": "jpg", "image/webp": "webp"}.get(media_type, "png")

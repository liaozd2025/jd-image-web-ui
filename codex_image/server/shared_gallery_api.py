from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from .assets import MAX_ASSET_BYTES, AssetNotFound, AssetQuotaExceeded, AssetValidationError
from .auth import require_admin
from .identity import AuthenticatedSession
from .shared_assets import SharedAssetConflict, SharedAssetRepository
from .shared_assets_api import _shared_asset_payload
from .shared_gallery import (
    SharedGalleryCategory,
    SharedGalleryConflict,
    SharedGalleryNotFound,
    SharedGalleryRepository,
    SharedGalleryValidationError,
)


class SharedGalleryCategoryPayload(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class SharedGalleryCategoryOrderPayload(BaseModel):
    category_ids: list[str] = Field(min_length=1, max_length=100)


class SharedGalleryItemPayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category_id: str | None = Field(default=None, min_length=1, max_length=160)
    prompt_note: str | None = Field(default=None, max_length=1000)


class SharedGalleryItemOrderPayload(BaseModel):
    category_id: str = Field(min_length=1, max_length=160)
    item_ids: list[str] = Field(min_length=1, max_length=500)


def install_shared_gallery_routes(
    app: FastAPI,
    *,
    shared_gallery: SharedGalleryRepository,
    shared_assets: SharedAssetRepository,
) -> None:
    @app.get("/api/shared-gallery/categories", response_model=None)
    def list_shared_gallery_categories() -> JSONResponse:
        return JSONResponse(content={"categories": _category_payloads(shared_gallery.list_categories())})

    @app.get("/api/shared-gallery/items", response_model=None)
    def list_shared_gallery_items(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        status = request.query_params.get("status", "active")
        if status not in {"active", "inactive", "all"}:
            return JSONResponse(status_code=422, content={"detail": "invalid_shared_gallery_status"})
        if status != "active" and session.user.role != "admin":
            return JSONResponse(status_code=403, content={"detail": "administrator_required"})
        category_id = request.query_params.get("category_id")
        query = str(request.query_params.get("query") or "").strip().casefold()
        assets = shared_assets.list_assets(include_inactive=status != "active", limit=500)
        items = [
            asset
            for asset in assets
            if asset.asset_kind in {"image", "reference"}
            and (status == "all" or asset.is_active == (status == "active"))
            and (not category_id or asset.category_id == category_id)
            and (
                not query
                or query in asset.name.casefold()
                or query in asset.prompt_note.casefold()
            )
        ]
        return JSONResponse(content={"items": [_shared_asset_payload(asset) for asset in items]})

    @app.post("/api/shared-gallery/items", response_model=None, status_code=201)
    async def create_shared_gallery_item(
        request: Request,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        parsed = await _parse_shared_gallery_item_request(request)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_shared_gallery_item_request"})
        name, category_id, prompt_note, filename, mime_type, content = parsed
        try:
            asset = shared_assets.create_asset(
                admin_session.user.user_id,
                actor_role=admin_session.user.role,
                asset_kind="image",
                name=name,
                original_filename=filename,
                mime_type=mime_type,
                content=content,
                category_id=category_id,
                prompt_note=prompt_note,
            )
        except SharedAssetConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"item": _shared_asset_payload(asset, include_versions=True)})

    @app.post("/api/shared-gallery/items/batch", response_model=None, status_code=207)
    async def create_shared_gallery_items_batch(
        request: Request,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        results = await _process_shared_gallery_batch_request(
            request,
            actor_user_id=admin_session.user.user_id,
            actor_role=admin_session.user.role,
            shared_assets=shared_assets,
        )
        if results is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_shared_gallery_batch_request"})
        shared_gallery.record_batch_completed(admin_session.user.user_id, results)
        return JSONResponse(status_code=207, content={"results": results})

    @app.patch("/api/shared-gallery/items/reorder", response_model=None)
    def reorder_shared_gallery_items(
        payload: SharedGalleryItemOrderPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            shared_gallery.reorder_items(
                admin_session.user.user_id,
                category_id=payload.category_id,
                item_ids=payload.item_ids,
            )
            items = [shared_assets.get_asset(asset_id, include_inactive=True) for asset_id in payload.item_ids]
        except (AssetNotFound, SharedGalleryNotFound) as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedGalleryValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(content={"items": [_shared_asset_payload(item) for item in items]})

    @app.patch("/api/shared-gallery/items/{asset_id}", response_model=None)
    def update_shared_gallery_item(
        asset_id: str,
        payload: SharedGalleryItemPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        if payload.name is None and payload.category_id is None and payload.prompt_note is None:
            return JSONResponse(status_code=422, content={"detail": "shared_gallery_item_update_is_empty"})
        try:
            existing = shared_assets.get_asset(asset_id, include_inactive=True)
            shared_gallery.update_item(
                admin_session.user.user_id,
                asset_id,
                name=payload.name if payload.name is not None else existing.name,
                category_id=payload.category_id if payload.category_id is not None else str(existing.category_id or ""),
                prompt_note=payload.prompt_note if payload.prompt_note is not None else existing.prompt_note,
            )
            updated = shared_assets.get_asset(asset_id, include_inactive=True)
        except (AssetNotFound, SharedGalleryNotFound) as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedGalleryConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        except SharedGalleryValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(content={"item": _shared_asset_payload(updated)})

    @app.post("/api/shared-gallery/categories", response_model=None, status_code=201)
    def create_shared_gallery_category(
        payload: SharedGalleryCategoryPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            category = shared_gallery.create_category(admin_session.user.user_id, name=payload.name)
        except SharedGalleryConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        except SharedGalleryValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"category": _category_payload(category)})

    @app.patch("/api/shared-gallery/categories/reorder", response_model=None)
    def reorder_shared_gallery_categories(
        payload: SharedGalleryCategoryOrderPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            categories = shared_gallery.reorder_categories(admin_session.user.user_id, payload.category_ids)
        except SharedGalleryNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedGalleryValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(content={"categories": _category_payloads(categories)})

    @app.patch("/api/shared-gallery/categories/{category_id}", response_model=None)
    def update_shared_gallery_category(
        category_id: str,
        payload: SharedGalleryCategoryPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            category = shared_gallery.update_category(
                admin_session.user.user_id,
                category_id,
                name=payload.name,
            )
        except SharedGalleryNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedGalleryConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        except SharedGalleryValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(content={"category": _category_payload(category)})

    @app.delete("/api/shared-gallery/categories/{category_id}", response_model=None)
    def delete_shared_gallery_category(
        category_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            categories = shared_gallery.delete_category(admin_session.user.user_id, category_id)
        except SharedGalleryNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedGalleryConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"categories": _category_payloads(categories)})


def _category_payload(category: SharedGalleryCategory) -> dict[str, object]:
    return {
        "id": category.category_id,
        "name": category.name,
        "order": category.sort_order,
        "system": category.is_system,
        "locked": category.is_system,
    }


def _category_payloads(categories: list[SharedGalleryCategory]) -> list[dict[str, object]]:
    return [_category_payload(category) for category in categories]


async def _parse_shared_gallery_item_request(
    request: Request,
) -> tuple[str, str, str, str, str, bytes] | None:
    try:
        async with request.form(max_part_size=MAX_ASSET_BYTES + 1) as form:
            name = form.get("name")
            category_id = form.get("category_id")
            prompt_note = form.get("prompt_note") or ""
            upload = form.get("file")
            if not isinstance(name, str) or not isinstance(category_id, str) or not isinstance(prompt_note, str):
                return None
            if not name.strip() or not category_id.strip() or not isinstance(upload, UploadFile):
                return None
            content = await upload.read(MAX_ASSET_BYTES + 1)
            return (
                name,
                category_id,
                prompt_note,
                upload.filename or "shared-gallery-image.bin",
                upload.content_type or "application/octet-stream",
                content,
            )
    except (MultiPartException, RuntimeError, UnicodeError):
        return None


async def _process_shared_gallery_batch_request(
    request: Request,
    *,
    actor_user_id: str,
    actor_role: str,
    shared_assets: SharedAssetRepository,
) -> list[dict[str, object]] | None:
    try:
        async with request.form(max_part_size=MAX_ASSET_BYTES + 1) as form:
            category_id = form.get("category_id")
            prompt_note = form.get("prompt_note") or ""
            raw_names = form.get("names") or "[]"
            files = form.getlist("files")
            if not isinstance(category_id, str) or not category_id.strip() or not isinstance(prompt_note, str):
                return None
            if not isinstance(raw_names, str) or not files or len(files) > 50:
                return None
            names = json.loads(raw_names)
            if not isinstance(names, list) or len(names) > len(files):
                return None
            results: list[dict[str, object]] = []
            for index, upload in enumerate(files):
                if not isinstance(upload, UploadFile):
                    return None
                filename = upload.filename or f"image-{index + 1}.bin"
                provided_name = names[index] if index < len(names) else ""
                if provided_name is not None and not isinstance(provided_name, str):
                    return None
                name = str(provided_name or Path(filename).stem).strip()
                content = await upload.read(MAX_ASSET_BYTES + 1)
                result: dict[str, object] = {"filename": filename, "name": name}
                try:
                    asset = shared_assets.create_asset(
                        actor_user_id,
                        actor_role=actor_role,
                        asset_kind="image",
                        name=name,
                        original_filename=filename,
                        mime_type=upload.content_type or "application/octet-stream",
                        content=content,
                        category_id=category_id,
                        prompt_note=prompt_note,
                    )
                    result.update(
                        {
                            "status": "created",
                            "asset_id": asset.asset_id,
                            "item": _shared_asset_payload(asset),
                        }
                    )
                except SharedAssetConflict:
                    result.update({"status": "failed", "error": "name_conflict"})
                except AssetQuotaExceeded:
                    result.update({"status": "failed", "error": "quota_exceeded"})
                except AssetValidationError as error:
                    message = str(error).lower()
                    if len(content) > MAX_ASSET_BYTES:
                        error_code = "file_too_large"
                    else:
                        error_code = "invalid_image" if any(
                            marker in message for marker in ("image", "media type", "content")
                        ) else "validation_error"
                    result.update({"status": "failed", "error": error_code})
                results.append(result)
            return results
    except (json.JSONDecodeError, MultiPartException, RuntimeError, UnicodeError):
        return None

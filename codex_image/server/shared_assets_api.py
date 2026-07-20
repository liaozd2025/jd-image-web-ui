from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .assets import AssetNotFound, AssetValidationError
from .assets_api import _kind, _limit, _parse_asset_request, _version_payload
from .auth import require_admin
from .content_thumbnails import ensure_image_thumbnail
from .identity import AuthenticatedSession
from .pagination import pagination_payload, parse_page_request
from .shared_assets import (
    SHARED_GALLERY_ASSET_KINDS,
    SharedAsset,
    SharedAssetConflict,
    SharedAssetForbidden,
    SharedAssetRepository,
    SharedAssetVersion,
)


class SharedAssetStatusPayload(BaseModel):
    is_active: bool


def install_shared_asset_routes(app: FastAPI, *, shared_assets: SharedAssetRepository) -> None:
    @app.get("/api/admin/shared-storage", response_model=None)
    def admin_shared_storage(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        usage = shared_assets.storage_usage()
        return JSONResponse(
            content={
                "storage": {
                    "unlimited": True,
                    "used_bytes": usage.used_bytes,
                    "asset_count": usage.asset_count,
                    "active_asset_count": usage.active_asset_count,
                    "version_count": usage.version_count,
                }
            }
        )

    @app.get("/api/admin/shared-assets", response_model=None)
    def admin_shared_assets(
        request: Request,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        page = parse_page_request(request)
        if page is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_page"})
        status = request.query_params.get("status", "active")
        if status not in {"active", "inactive", "all"}:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_status"})
        kind = _kind(request.query_params.get("kind"))
        if request.query_params.get("kind") is not None and kind is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_kind"})
        query = str(request.query_params.get("query") or "").strip()
        if len(query) > 200:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_query"})
        assets, total = shared_assets.list_assets_page(
            page=page.page,
            page_size=page.page_size,
            status=status,
            kind=kind,
            category_id=request.query_params.get("category_id"),
            query=query,
        )
        return JSONResponse(
            content={
                "assets": [
                    _admin_shared_asset_payload(shared_assets, asset)
                    for asset in assets
                ],
                "pagination": pagination_payload(page, total),
            }
        )

    @app.get("/api/admin/shared-assets/{asset_id}", response_model=None)
    def admin_shared_asset_detail(
        asset_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            asset = shared_assets.get_asset(asset_id, include_inactive=True)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(
            content={"asset": _admin_shared_asset_payload(shared_assets, asset, include_content=True)}
        )

    @app.get("/api/admin/shared-assets/{asset_id}/thumbnail")
    def admin_shared_asset_thumbnail(
        asset_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            asset = shared_assets.get_asset(asset_id, include_inactive=True)
            if asset.asset_kind not in SHARED_GALLERY_ASSET_KINDS or asset.current_version is None:
                raise AssetNotFound("shared asset thumbnail was not found")
            source = shared_assets.asset_path(asset.current_version)
            thumbnail = ensure_image_thumbnail(
                shared_assets.data_root,
                scope="shared",
                version_id=asset.current_version.asset_version_id,
                source_path=source,
            )
        except (AssetNotFound, FileNotFoundError, ValueError, OSError):
            return JSONResponse(status_code=404, content={"detail": "shared_asset_thumbnail_missing"})
        return FileResponse(
            thumbnail,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.get("/api/admin/shared-assets/{asset_id}/preview")
    def admin_shared_asset_preview(
        asset_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            asset = shared_assets.get_asset(asset_id, include_inactive=True)
            if asset.asset_kind not in SHARED_GALLERY_ASSET_KINDS or asset.current_version is None:
                raise AssetNotFound("shared asset preview was not found")
            path = shared_assets.asset_path(asset.current_version)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "shared_asset_file_missing"})
        return FileResponse(
            path,
            media_type=asset.current_version.mime_type,
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.get("/api/shared-assets", response_model=None)
    def list_shared_assets(request: Request) -> JSONResponse:
        kind = _kind(request.query_params.get("kind"))
        if request.query_params.get("kind") is not None and kind is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_kind"})
        limit = _limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_limit"})
        items = shared_assets.list_assets(limit=limit)
        if kind is not None:
            items = [asset for asset in items if asset.asset_kind == kind]
        return JSONResponse(content={"assets": [_shared_asset_payload(asset) for asset in items]})

    @app.post("/api/shared-assets", response_model=None, status_code=201)
    async def create_shared_asset(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        parsed = await _parse_asset_request(request, require_kind=True)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_shared_asset_request"})
        kind, name, filename, mime_type, content = parsed
        if kind in SHARED_GALLERY_ASSET_KINDS and session.user.role != "admin":
            return JSONResponse(status_code=403, content={"detail": "administrator_required"})
        try:
            asset = shared_assets.create_asset(
                session.user.user_id,
                actor_role=session.user.role,
                asset_kind=kind,
                name=name,
                original_filename=filename,
                mime_type=mime_type,
                content=content,
            )
        except SharedAssetForbidden as error:
            return JSONResponse(status_code=403, content={"detail": str(error)})
        except SharedAssetConflict as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"asset": _shared_asset_payload(asset, include_versions=True)})

    @app.get("/api/shared-assets/{asset_id}", response_model=None)
    def get_shared_asset(request: Request, asset_id: str) -> JSONResponse:
        try:
            asset = shared_assets.get_asset(asset_id)
            versions = shared_assets.list_versions(asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"asset": _shared_asset_payload(asset, versions=versions, include_versions=True)})

    @app.post("/api/shared-assets/{asset_id}/versions", response_model=None, status_code=201)
    async def create_shared_version(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        parsed = await _parse_asset_request(request, require_kind=False)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_shared_asset_request"})
        _, _, filename, mime_type, content = parsed
        try:
            asset = shared_assets.create_version(
                session.user.user_id,
                session.user.role,
                asset_id,
                original_filename=filename,
                mime_type=mime_type,
                content=content,
            )
            versions = shared_assets.list_versions(asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedAssetForbidden as error:
            return JSONResponse(status_code=403, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"asset": _shared_asset_payload(asset, versions=versions, include_versions=True)})

    @app.patch("/api/shared-assets/{asset_id}/status", response_model=None)
    def set_shared_status(request: Request, asset_id: str, payload: SharedAssetStatusPayload) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            asset = shared_assets.set_active(
                session.user.user_id,
                session.user.role,
                asset_id,
                is_active=payload.is_active,
            )
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except SharedAssetForbidden as error:
            return JSONResponse(status_code=403, content={"detail": str(error)})
        return JSONResponse(content={"asset": _shared_asset_payload(asset)})

    @app.get("/api/shared-assets/{asset_id}/download")
    def download_shared_asset(request: Request, asset_id: str):
        try:
            asset = shared_assets.get_asset(asset_id)
            if asset.current_version is None:
                raise AssetNotFound("shared asset has no current version")
            version = asset.current_version
            path = shared_assets.asset_path(version)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return _shared_file_response(path, version)

    @app.get("/api/shared-assets/{asset_id}/versions/{asset_version_id}/download")
    def download_shared_version(request: Request, asset_id: str, asset_version_id: str):
        try:
            version = shared_assets.get_version(asset_version_id, include_inactive=True)
            if version.asset_id != asset_id:
                raise AssetNotFound("shared asset version was not found")
            path = shared_assets.asset_path(version)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return _shared_file_response(path, version)


def _shared_file_response(path, version: SharedAssetVersion):
    if not path.is_file():
        return JSONResponse(status_code=404, content={"detail": "shared_asset_file_missing"})
    return FileResponse(
        path,
        media_type=version.mime_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="{version.original_filename}"',
        },
    )


def _shared_asset_payload(
    asset: SharedAsset,
    *,
    versions: list[SharedAssetVersion] | None = None,
    include_versions: bool = False,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "asset_id": asset.asset_id,
        "publisher_user_id": asset.publisher_user_id,
        "asset_kind": asset.asset_kind,
        "name": asset.name,
        "is_active": asset.is_active,
        "current_version_id": asset.current_version_id,
        "current_version": _version_payload(asset.current_version) if asset.current_version else None,
        "download_url": f"/api/shared-assets/{asset.asset_id}/download" if asset.is_active and asset.current_version_id else None,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "category_id": asset.category_id,
        "category_name": asset.category_name,
        "prompt_note": asset.prompt_note,
        "sort_order": asset.sort_order,
    }
    if include_versions:
        payload["versions"] = [
            {
                **_version_payload(version),
                "scope": "shared",
                "publisher_user_id": version.publisher_user_id,
            }
            for version in (versions or [])
        ]
    return payload


def _admin_shared_asset_payload(
    shared_assets: SharedAssetRepository,
    asset: SharedAsset,
    *,
    include_content: bool = False,
) -> dict[str, object]:
    payload = _shared_asset_payload(
        asset,
        versions=[asset.current_version] if asset.current_version is not None else [],
        include_versions=True,
    )
    path = None
    if asset.current_version is not None:
        try:
            candidate = shared_assets.asset_path(asset.current_version)
            if candidate.is_file():
                path = candidate
        except AssetNotFound:
            path = None
    payload["file_available"] = path is not None
    payload["thumbnail_url"] = (
        f"/api/admin/shared-assets/{asset.asset_id}/thumbnail"
        if path is not None and asset.asset_kind in SHARED_GALLERY_ASSET_KINDS
        else None
    )
    payload["preview_url"] = (
        f"/api/admin/shared-assets/{asset.asset_id}/preview"
        if path is not None and asset.asset_kind in SHARED_GALLERY_ASSET_KINDS
        else None
    )
    text = _text_content(path) if asset.asset_kind in {"prompt", "template"} else ""
    payload["content_excerpt"] = text[:500]
    if include_content:
        payload["content_text"] = text
        payload["content_truncated"] = len(text) >= 100_000
    return payload


def _text_content(path) -> str:
    if path is None:
        return ""
    try:
        return path.read_bytes()[:100_000].decode("utf-8", errors="replace").strip()
    except OSError:
        return ""

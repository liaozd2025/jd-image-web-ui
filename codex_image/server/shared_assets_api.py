from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .assets import AssetNotFound, AssetQuotaExceeded, AssetValidationError
from .assets_api import _kind, _limit, _parse_asset_request, _version_payload
from .auth import require_admin
from .identity import AuthenticatedSession
from .shared_assets import (
    SharedAsset,
    SharedAssetForbidden,
    SharedAssetRepository,
    SharedAssetVersion,
)


class SharedAssetStatusPayload(BaseModel):
    is_active: bool


class SharedQuotaPayload(BaseModel):
    quota_bytes: int = Field(ge=0, le=100 * 1024 * 1024 * 1024)


def install_shared_asset_routes(app: FastAPI, *, shared_assets: SharedAssetRepository) -> None:
    @app.get("/api/shared-assets/quota", response_model=None)
    def shared_quota(request: Request) -> JSONResponse:
        request.state.auth_session
        return JSONResponse(content={"quota": _quota_payload(shared_assets.quota())})

    @app.get("/api/admin/shared-storage-quota", response_model=None)
    def admin_shared_quota(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(content={"quota": _quota_payload(shared_assets.quota())})

    @app.patch("/api/admin/shared-storage-quota", response_model=None)
    def set_shared_quota(
        payload: SharedQuotaPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            quota = shared_assets.set_quota(payload.quota_bytes, actor_user_id=admin_session.user.user_id)
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(content={"quota": _quota_payload(quota)})

    @app.get("/api/admin/shared-assets", response_model=None)
    def admin_shared_assets(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(
            content={
                "assets": [
                    _shared_asset_payload(asset, versions=shared_assets.list_versions(asset.asset_id, include_inactive=True))
                    for asset in shared_assets.list_assets(include_inactive=True)
                ]
            }
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
        try:
            asset = shared_assets.create_asset(
                session.user.user_id,
                asset_kind=kind,
                name=name,
                original_filename=filename,
                mime_type=mime_type,
                content=content,
            )
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
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
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
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
            version = shared_assets.get_version(asset_version_id)
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


def _quota_payload(quota) -> dict[str, int]:
    return {
        "quota_bytes": quota.quota_bytes,
        "used_bytes": quota.used_bytes,
        "available_bytes": quota.available_bytes,
    }


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

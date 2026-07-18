from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from .assets import (
    ASSET_KINDS,
    MAX_ASSET_BYTES,
    Asset,
    AssetKind,
    AssetNotFound,
    AssetQuotaExceeded,
    AssetRepository,
    AssetValidationError,
    AssetVersion,
)
from .identity import AuthenticatedSession


def install_asset_routes(app: FastAPI, *, assets: AssetRepository) -> None:
    @app.get("/api/assets/quota", response_model=None)
    def get_quota(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"quota": _quota_payload(assets.quota(session.user.user_id))})

    @app.get("/api/assets/trash", response_model=None)
    def list_trash(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        limit = _limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_limit"})
        kind = _kind(request.query_params.get("kind"))
        if request.query_params.get("kind") is not None and kind is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_kind"})
        return JSONResponse(
            content={
                "assets": [
                    _asset_payload(asset, include_versions=False)
                    for asset in assets.list_assets(
                        session.user.user_id,
                        kind=kind,
                        include_deleted=True,
                        limit=limit,
                    )
                    if asset.deleted_at is not None
                ]
            }
        )

    @app.get("/api/assets", response_model=None)
    def list_assets(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        limit = _limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_limit"})
        kind = _kind(request.query_params.get("kind"))
        if request.query_params.get("kind") is not None and kind is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_kind"})
        return JSONResponse(
            content={
                "assets": [
                    _asset_payload(asset, include_versions=False)
                    for asset in assets.list_assets(session.user.user_id, kind=kind, limit=limit)
                ]
            }
        )

    @app.post("/api/assets", response_model=None, status_code=201)
    async def create_asset(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        parsed = await _parse_asset_request(request, require_kind=True)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_request"})
        kind, name, filename, mime_type, content = parsed
        try:
            asset = assets.create_asset(
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
        return JSONResponse(status_code=201, content={"asset": _asset_payload(asset, include_versions=True)})

    @app.get("/api/assets/{asset_id}", response_model=None)
    def get_asset(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            asset = assets.get_asset(session.user.user_id, asset_id)
            versions = assets.list_versions(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"asset": _asset_payload(asset, versions=versions, include_versions=True)})

    @app.post("/api/assets/{asset_id}/versions", response_model=None, status_code=201)
    async def create_asset_version(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        parsed = await _parse_asset_request(request, require_kind=False)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_request"})
        _, _, filename, mime_type, content = parsed
        try:
            asset = assets.create_version(
                session.user.user_id,
                asset_id,
                original_filename=filename,
                mime_type=mime_type,
                content=content,
            )
            versions = assets.list_versions(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except AssetQuotaExceeded as error:
            return JSONResponse(status_code=413, content={"detail": str(error)})
        except AssetValidationError as error:
            return JSONResponse(status_code=422, content={"detail": str(error)})
        return JSONResponse(
            status_code=201,
            content={"asset": _asset_payload(asset, versions=versions, include_versions=True)},
        )

    @app.delete("/api/assets/{asset_id}", response_model=None)
    def delete_asset(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            asset = assets.soft_delete(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"asset": _asset_payload(asset, include_versions=False)})

    @app.post("/api/assets/{asset_id}/restore", response_model=None)
    def restore_asset(request: Request, asset_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            asset = assets.restore(session.user.user_id, asset_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"asset": _asset_payload(asset, include_versions=False)})

    @app.get("/api/assets/{asset_id}/download")
    def download_current_asset(request: Request, asset_id: str):
        session: AuthenticatedSession = request.state.auth_session
        try:
            asset = assets.get_asset(session.user.user_id, asset_id)
            if asset.current_version is None:
                raise AssetNotFound("asset has no current version")
            version = asset.current_version
            path = assets.asset_path(version)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "asset_file_missing"})
        return FileResponse(
            path,
            media_type=version.mime_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'attachment; filename="{version.original_filename}"',
            },
        )

    @app.get("/api/assets/{asset_id}/versions/{asset_version_id}", response_model=None)
    def get_asset_version(request: Request, asset_id: str, asset_version_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            version = assets.get_version(session.user.user_id, asset_version_id)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if version.asset_id != asset_id:
            return JSONResponse(status_code=404, content={"detail": "asset version was not found"})
        return JSONResponse(content={"version": _version_payload(version)})

    @app.get("/api/assets/{asset_id}/versions/{asset_version_id}/download")
    def download_asset_version(request: Request, asset_id: str, asset_version_id: str):
        session: AuthenticatedSession = request.state.auth_session
        try:
            version = assets.get_version(session.user.user_id, asset_version_id)
            if version.asset_id != asset_id:
                raise AssetNotFound("asset version was not found")
            path = assets.asset_path(version)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "asset_file_missing"})
        return FileResponse(
            path,
            media_type=version.mime_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": f'attachment; filename="{version.original_filename}"',
            },
        )


async def _parse_asset_request(
    request: Request,
    *,
    require_kind: bool,
) -> tuple[str, str, str, str, bytes] | None:
    content_type = request.headers.get("content-type", "").lower()
    try:
        if content_type.startswith("multipart/form-data"):
            async with request.form(max_part_size=MAX_ASSET_BYTES) as form:
                raw_kind = form.get("asset_kind") or form.get("kind") or "reference"
                raw_name = form.get("name") or ""
                upload = form.get("file") or form.get("asset")
                if not isinstance(raw_kind, str) or not isinstance(raw_name, str):
                    return None
                if isinstance(upload, UploadFile):
                    content = await upload.read(MAX_ASSET_BYTES + 1)
                    filename = upload.filename or "asset.bin"
                    mime_type = upload.content_type or "application/octet-stream"
                else:
                    raw_content = form.get("content")
                    if not isinstance(raw_content, str):
                        return None
                    content = raw_content.encode("utf-8")
                    filename = "asset.txt"
                    mime_type = "text/plain"
        else:
            body = await request.json()
            if not isinstance(body, dict):
                return None
            raw_kind = body.get("asset_kind", body.get("kind", "prompt"))
            raw_name = body.get("name", "")
            raw_content = body.get("content")
            filename = body.get("filename", "asset.txt")
            mime_type = body.get("mime_type", "text/plain")
            if not isinstance(raw_content, str):
                return None
            content = raw_content.encode("utf-8")
        if require_kind and (not isinstance(raw_kind, str) or raw_kind not in ASSET_KINDS):
            return None
        if not isinstance(raw_kind, str) or raw_kind not in ASSET_KINDS:
            return None
        if not isinstance(raw_name, str) or not isinstance(filename, str) or not isinstance(mime_type, str):
            return None
        return raw_kind, raw_name, filename, mime_type, content
    except (MultiPartException, ValueError, RuntimeError, UnicodeError):
        return None


def _limit(request: Request) -> int | None:
    try:
        return min(max(int(request.query_params.get("limit", "50")), 1), 100)
    except ValueError:
        return None


def _kind(value: str | None) -> AssetKind | None:
    if value is None:
        return None
    return value if value in ASSET_KINDS else None  # type: ignore[return-value]


def _quota_payload(quota: Any) -> dict[str, int]:
    return {
        "quota_bytes": quota.quota_bytes,
        "used_bytes": quota.used_bytes,
        "available_bytes": quota.available_bytes,
    }


def _version_payload(version: AssetVersion) -> dict[str, object]:
    return {
        "asset_version_id": version.asset_version_id,
        "asset_id": version.asset_id,
        "version_number": version.version_number,
        "original_filename": version.original_filename,
        "mime_type": version.mime_type,
        "sha256": version.sha256,
        "byte_size": version.byte_size,
        "created_at": version.created_at,
        "download_url": f"/api/assets/{version.asset_id}/versions/{version.asset_version_id}/download",
    }


def _asset_payload(
    asset: Asset,
    *,
    versions: list[AssetVersion] | None = None,
    include_versions: bool,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "asset_id": asset.asset_id,
        "asset_kind": asset.asset_kind,
        "name": asset.name,
        "deleted": asset.deleted_at is not None,
        "deleted_at": asset.deleted_at,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "current_version_id": asset.current_version_id,
        "download_url": (
            f"/api/assets/{asset.asset_id}/download" if asset.current_version_id and asset.deleted_at is None else None
        ),
        "current_version": _version_payload(asset.current_version) if asset.current_version else None,
    }
    if include_versions:
        payload["versions"] = [_version_payload(version) for version in (versions or [])]
    return payload

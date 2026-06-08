from __future__ import annotations

import asyncio
import base64
import mimetypes
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .storage import GalleryStorage, ReferenceAssetStorage, TaskStorage
from .task_metadata import _dedupe_preserve_order, _gallery_ref_response, _reference_asset_response


def _file_to_data_url(path: Path, *, mime_type: str | None = None) -> str:
    data = path.read_bytes()
    resolved_mime_type = _image_mime_type(mime_type, path.name, data) or "application/octet-stream"
    return f"data:{resolved_mime_type};base64,{base64.b64encode(data).decode('ascii')}"


def _image_mime_type(declared_mime_type: str | None, filename: str, data: bytes) -> str | None:
    candidates = [
        str(declared_mime_type or "").strip(),
        str(mimetypes.guess_type(filename)[0] or "").strip(),
        _sniff_image_mime_type(data),
    ]
    for candidate in candidates:
        if candidate.startswith("image/"):
            return candidate
    return None


def _sniff_image_mime_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _resolve_reference_assets(
    storage: ReferenceAssetStorage,
    asset_ids: list[str],
    *,
    touch: bool = True,
) -> tuple[list[dict[str, Any]], list[str]]:
    refs: list[dict[str, Any]] = []
    data_urls: list[str] = []
    for asset_id in _dedupe_preserve_order(asset_ids):
        try:
            item = storage.touch(asset_id) if touch else storage.read_item(asset_id)
            path = storage.image_path(asset_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid reference asset id: {asset_id}") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Reference asset not found: {asset_id}") from exc
        refs.append(_reference_asset_response(item))
        data_urls.append(_file_to_data_url(path, mime_type=str(item.get("mime_type") or "")))
    return refs, data_urls


def _resolve_gallery_refs(gallery_storage: GalleryStorage, item_ids: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    refs: list[dict[str, Any]] = []
    data_urls: list[str] = []
    for item_id in _dedupe_preserve_order(item_ids):
        try:
            item = gallery_storage.read_item(item_id)
            path = gallery_storage.image_path(item_id)
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail=f"Gallery item not found: {item_id}") from exc
        refs.append(_gallery_ref_response(item))
        data_urls.append(_file_to_data_url(path, mime_type=str(item.get("mime_type") or "")))
    return refs, data_urls


def _task_cancel_requested(storage: TaskStorage, task_id: str) -> bool:
    try:
        metadata = storage.read_metadata(task_id)
    except FileNotFoundError:
        return True
    return bool(metadata.get("cancel_requested"))


def _raise_if_task_cancelled(storage: TaskStorage, task_id: str) -> None:
    if _task_cancel_requested(storage, task_id):
        raise asyncio.CancelledError()

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse

from codex_image.webui.context import WebUIContext
from codex_image.webui.reference_files import reference_file_task_record
from codex_image.webui.storage_utils import _safe_filename


def register_reference_file_routes(app: FastAPI, ctx: WebUIContext) -> None:
    @app.get("/api/reference-files/recent")
    def list_recent_reference_files(limit: int = Query(20, ge=1, le=100)) -> dict[str, Any]:
        items = []
        for item in ctx.reference_file_storage.list_recent(limit=limit):
            items.append(
                {
                    "id": item.get("id"),
                    "filename": item.get("last_filename"),
                    "mime_type": item.get("last_mime_type"),
                    "family": item.get("last_family"),
                    "size_bytes": item.get("size_bytes"),
                    "detail": item.get("detail"),
                    "created_at": item.get("created_at"),
                    "last_used_at": item.get("last_used_at"),
                    "used_count": item.get("used_count"),
                    "missing": False,
                }
            )
        return {"items": items}

    @app.get("/api/tasks/{task_id}/reference-files/{file_index}/download", response_class=FileResponse)
    def download_task_reference_file(task_id: str, file_index: int) -> FileResponse:
        if file_index < 1:
            raise HTTPException(status_code=404, detail="Reference file not found")
        try:
            metadata = ctx.storage.read_metadata(task_id)
            reference_files = metadata.get("reference_files")
            if not isinstance(reference_files, list) or file_index > len(reference_files):
                raise FileNotFoundError(file_index)
            raw_record = reference_files[file_index - 1]
            if not isinstance(raw_record, dict):
                raise ValueError("reference_file_invalid")
            record = reference_file_task_record(raw_record)
            path = ctx.reference_file_storage.verified_file_path(
                str(record["id"]),
                expected_size=int(record["size_bytes"]),
            )
        except (FileNotFoundError, OSError, ValueError):
            raise HTTPException(status_code=404, detail="Reference file not found") from None

        filename = str(record["filename"])
        ascii_filename = _safe_filename(filename)
        content_disposition = (
            f'attachment; filename="{ascii_filename}"; '
            f"filename*=UTF-8''{quote(filename, safe='')}"
        )
        return FileResponse(
            path,
            media_type=str(record["mime_type"]),
            headers={"Content-Disposition": content_disposition},
        )

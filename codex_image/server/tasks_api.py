from __future__ import annotations

from io import BytesIO
import json
from typing import Literal, cast
import zipfile

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from .identity import AuthenticatedSession
from .tasks import (
    GenerationTask,
    GenerationTaskRepository,
    TaskConfigurationError,
    TaskNotFound,
    TaskStatus,
    task_output_records,
)


MAX_TASK_INPUT_BYTES = 10 * 1024 * 1024
MAX_TASK_ARCHIVE_BYTES = 100 * 1024 * 1024
SUPPORTED_INPUT_MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp"}
TASK_STATUSES = {"queued", "running", "interrupted", "completed", "failed", "cancelled"}


class CreateTaskPayload(BaseModel):
    provider_version_id: str = Field(min_length=1, max_length=64)
    model_id: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=16_000)
    size: str = Field(default="1024x1024", pattern=r"^\d{2,5}x\d{2,5}$")
    quality: Literal["auto", "low", "medium", "high"] = "auto"
    output_format: Literal["png", "jpeg", "webp"] = "png"
    asset_version_ids: list[str] = Field(default_factory=list, max_length=16)
    shared_asset_version_ids: list[str] = Field(default_factory=list, max_length=16)
    provider_scope: Literal["personal", "department"] = "personal"


def install_task_routes(
    app: FastAPI,
    *,
    tasks: GenerationTaskRepository,
) -> None:
    @app.post("/api/tasks", response_model=None, status_code=201)
    async def create_task(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        parsed = await _parse_task_request(request)
        if parsed is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_request"})
        payload, input_bytes, input_media_type = parsed
        if session.user.role == "admin" and payload.provider_scope == "personal":
            return JSONResponse(status_code=403, content={"detail": "administrators_use_department_scope"})
        try:
            task = tasks.create_task(
                session.user.user_id,
                provider_version_id=payload.provider_version_id,
                model_id=payload.model_id,
                prompt=payload.prompt,
                request_parameters={
                    "size": payload.size,
                    "quality": payload.quality,
                    "output_format": payload.output_format,
                },
                input_bytes=input_bytes,
                input_media_type=input_media_type,
                asset_version_ids=payload.asset_version_ids,
                shared_asset_version_ids=payload.shared_asset_version_ids,
                provider_scope=payload.provider_scope,
            )
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"task": _task_payload(task)})

    @app.get("/api/tasks", response_model=None)
    def list_tasks(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        raw_status = request.query_params.get("status")
        if raw_status is not None and raw_status not in TASK_STATUSES:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_status"})
        try:
            limit = min(max(int(request.query_params.get("limit", "50")), 1), 100)
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_limit"})
        return JSONResponse(
            content={
                "tasks": [
                    _task_payload(task, attempts=tasks.list_attempts(session.user.user_id, task.task_id))
                    for task in tasks.list_tasks(
                        session.user.user_id,
                        status=raw_status if raw_status is None else _task_status(raw_status),
                        limit=limit,
                    )
                ]
            }
        )

    @app.get("/api/tasks/trash", response_model=None)
    def list_task_trash(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(
            content={
                "tasks": [
                    _task_payload(task)
                    for task in tasks.list_tasks(
                        session.user.user_id,
                        limit=100,
                        include_deleted=True,
                        only_deleted=True,
                    )
                    if task.deleted_at is not None
                ]
            }
        )

    @app.get("/api/tasks/archive")
    def archive_tasks(request: Request) -> Response:
        session: AuthenticatedSession = request.state.auth_session
        task_ids = [value for value in request.query_params.get("ids", "").split(",") if value]
        if not task_ids or len(task_ids) > 50:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_ids"})
        selected: list[tuple[GenerationTask, int, object, dict[str, object]]] = []
        archive_bytes = 0
        for task_id in task_ids:
            try:
                task = tasks.get_task(session.user.user_id, task_id)
            except TaskNotFound as error:
                return JSONResponse(status_code=404, content={"detail": str(error)})
            if task.status != "completed":
                return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
            for item in task_output_records(task):
                if bool(item.get("deleted")):
                    continue
                output_index = int(item.get("index") or 0)
                try:
                    path = tasks.result_path(task, output_index)
                except TaskNotFound as error:
                    return JSONResponse(status_code=404, content={"detail": str(error)})
                if not path.is_file():
                    return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
                archive_bytes += path.stat().st_size
                if archive_bytes > MAX_TASK_ARCHIVE_BYTES:
                    return JSONResponse(status_code=413, content={"detail": "task_archive_too_large"})
                selected.append((task, output_index, path, item))
        archive = BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for task, output_index, path, item in selected:
                active_output_count = len([item for item in task_output_records(task) if not bool(item.get("deleted"))])
                suffix = "" if active_output_count == 1 else f"-image-{output_index}"
                output.write(
                    path,
                    arcname=f"task-{task.task_id}{suffix}.{_output_extension(task, item)}",
                )
        return Response(
            content=archive.getvalue(),
            media_type="application/zip",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'attachment; filename="jd-image-tasks.zip"',
            },
        )

    @app.get("/api/tasks/{task_id}", response_model=None)
    def get_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(
            content={"task": _task_payload(task, attempts=tasks.list_attempts(session.user.user_id, task_id))}
        )

    @app.post("/api/tasks/{task_id}/cancel", response_model=None)
    def cancel_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.cancel_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.delete("/api/tasks/{task_id}", response_model=None)
    def delete_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.soft_delete_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/restore", response_model=None)
    def restore_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.restore_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.post("/api/tasks/{task_id}/resubmit", response_model=None, status_code=201)
    def resubmit_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.resubmit_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"task": _task_payload(task)})

    @app.get("/api/tasks/{task_id}/result")
    def get_task_result(request: Request, task_id: str):
        return _serve_task_file(request, task_id, kind="result", download=False)

    @app.get("/api/tasks/{task_id}/attempts/{attempt_id}/result")
    def get_attempt_result(request: Request, task_id: str, attempt_id: str):
        session: AuthenticatedSession = request.state.auth_session
        try:
            path = tasks.attempt_result_path(session.user.user_id, task_id, attempt_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "attempt_result_file_missing"})
        return FileResponse(path, media_type="image/*", headers={"Cache-Control": "no-store"})

    @app.get("/api/tasks/{task_id}/download")
    def download_task_result(request: Request, task_id: str):
        return _serve_task_file(request, task_id, kind="result", download=True)

    @app.get("/api/tasks/{task_id}/thumbnail")
    def get_task_thumbnail(request: Request, task_id: str):
        return _serve_task_file(request, task_id, kind="thumbnail", download=False)

    @app.get("/api/tasks/{task_id}/input")
    def get_task_input(request: Request, task_id: str):
        return _serve_task_file(request, task_id, kind="input", download=False)

    def _serve_task_file(request: Request, task_id: str, *, kind: str, download: bool):
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        try:
            if kind == "result":
                if task.status != "completed" or task.result_media_type is None:
                    return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
                result_path = tasks.result_path(task)
                media_type = task.result_media_type
                filename = f"task-{task.task_id}.{_output_extension(task)}"
            elif kind == "thumbnail":
                if task.status != "completed":
                    return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
                result_path = tasks.thumbnail_path(task)
                media_type = "image/jpeg"
                filename = f"task-{task.task_id}.thumb.jpg"
            else:
                result_path = tasks.input_path(task)
                media_type = task.input_media_type or "application/octet-stream"
                filename = f"task-{task.task_id}.input"
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not result_path.is_file():
            return JSONResponse(status_code=404, content={"detail": "task_file_missing"})
        headers = {"Cache-Control": "no-store"}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return FileResponse(
            result_path,
            media_type=media_type,
            headers=headers,
        )


def _task_payload(
    task: GenerationTask,
    *,
    attempts: list[dict[str, object]] | None = None,
    url_prefix: str = "/api/tasks",
) -> dict[str, object]:
    task_url = f"{url_prefix}/{task.task_id}"
    workspace_provider_id = f"{task.provider_scope}-{task.provider_version_id}"
    workspace_backend = (
        "openai_responses"
        if task.request_parameters.get("api_mode") == "responses"
        else "openai_images"
    )
    stored_outputs = task_output_records(task)
    active_outputs = [item for item in stored_outputs if not bool(item.get("deleted"))]
    requested_count = max(1, min(4, int(task.request_parameters.get("n") or 1)))
    output_count = len(stored_outputs) if stored_outputs else requested_count
    output_status = (
        task.status
        if task.status in {"queued", "running", "completed", "failed", "interrupted", "cancelled"}
        else "queued"
    )
    outputs = []
    for output_index in range(1, output_count + 1):
        record = stored_outputs[output_index - 1] if output_index <= len(stored_outputs) else {}
        file_available = bool(
            task.status == "completed"
            and record.get("relative_path")
            and not record.get("deleted")
            and not record.get("storage_purged_at")
            and not task.storage_purged_at
        )
        completed_url = (
            f"{task_url}/outputs/{output_index}/download"
            if file_available
            else None
        )
        thumbnail_url = (
            f"{task_url}/outputs/{output_index}/thumbnail"
            if file_available and record.get("thumbnail_relative_path")
            else None
        )
        preview_url = (
            f"{task_url}/outputs/{output_index}/preview"
            if url_prefix.startswith("/api/admin/")
            and file_available
            else None
        )
        outputs.append(
            {
                "index": output_index,
                "status": output_status,
                "url": completed_url,
                "thumbnail_url": thumbnail_url,
                "preview_url": preview_url,
                "file_available": file_available,
                "storage_purged": bool(record.get("storage_purged_at") or task.storage_purged_at),
                "size": str(task.request_parameters.get("size") or ""),
                "format": str(record.get("output_format") or task.request_parameters.get("output_format") or "png"),
                "quality": str(task.request_parameters.get("quality") or "auto"),
                "revised_prompt": record.get("revised_prompt") or task.revised_prompt,
                "error": task.error_message,
                "deleted": bool(record.get("deleted")),
                "deleted_at": record.get("deleted_at"),
                "purge_after": record.get("purge_after"),
            }
        )
    reference_files = [
        {
            "id": str(item.get("asset_id") or ""),
            "reference_file_id": str(item.get("asset_id") or ""),
            "filename": str(item.get("original_filename") or item.get("name") or "reference-file"),
            "mime_type": str(item.get("mime_type") or "application/octet-stream"),
            "size_bytes": int(item.get("byte_size") or 0),
            "family": _reference_file_family(str(item.get("original_filename") or "")),
        }
        for item in task.asset_versions
        if item.get("asset_kind") == "file"
    ]
    attempt_payload = []
    for attempt in attempts or []:
        item = dict(attempt)
        attempt_id = item.get("attempt_id")
        item["result_url"] = (
            f"{task_url}/attempts/{attempt_id}/result"
            if item.get("result_relative_path") and attempt_id
            else None
        )
        attempt_payload.append(item)
    return {
        "task_id": task.task_id,
        "provider_version_id": task.provider_version_id,
        "provider_scope": task.provider_scope,
        "model_id": task.model_id,
        "prompt": task.prompt,
        "request_parameters": task.request_parameters,
        "input_sha256": task.input_sha256,
        "input_bytes": task.input_bytes,
        "input_media_type": task.input_media_type,
        "asset_versions": task.asset_versions,
        "shared_asset_versions": task.shared_asset_versions,
        "reference_files": reference_files,
        "thumbnail_bytes": task.thumbnail_bytes,
        "deleted": task.deleted_at is not None,
        "deleted_at": task.deleted_at,
        "purge_after": task.purge_after,
        "storage_purged_at": task.storage_purged_at,
        "cancel_requested": task.cancel_requested,
        "cancel_requested_at": task.cancel_requested_at,
        "cancelled_at": task.cancelled_at,
        "attempts": attempt_payload,
        "quota_units": task.quota_units,
        "quota_period_start": task.quota_period_start,
        "status": task.status,
        "result_sha256": task.result_sha256,
        "result_bytes": task.result_bytes,
        "thumbnail_url": (
            f"{task_url}/thumbnail"
            if task.status == "completed" and task.thumbnail_relative_path and not task.storage_purged_at
            else None
        ),
        "input_url": f"{task_url}/input" if task.input_relative_path and not task.storage_purged_at else None,
        "revised_prompt": task.revised_prompt,
        "error_message": task.error_message,
        "created_at": task.created_at,
        "started_at": task.started_at,
        "completed_at": task.completed_at,
        "updated_at": task.updated_at,
        "result_url": (
            f"{task_url}/result"
            if task.status == "completed" and task.result_relative_path and not task.storage_purged_at
            else None
        ),
        "mode": str(task.request_parameters.get("mode") or ("edit" if task.input_relative_path else "generate")),
        "params": {
            **task.request_parameters,
            "model": task.model_id,
            "main_model": str(task.request_parameters.get("main_model") or task.model_id),
            "api_provider_id": workspace_provider_id,
        },
        "request": {
            **task.request_parameters,
            "model": task.model_id,
            "provider_version_id": task.provider_version_id,
            "provider_scope": task.provider_scope,
        },
        "queued_at": task.created_at,
        "output_size": str(task.request_parameters.get("size") or ""),
        "output_url": (
            f"{task_url}/result"
            if task.status == "completed" and task.result_relative_path and not task.storage_purged_at
            else None
        ),
        "output_urls": [item["url"] for item in outputs if item["url"]],
        "thumbnail_urls": [item["thumbnail_url"] for item in outputs if item["thumbnail_url"]],
        "input_urls": [f"{task_url}/input"] if task.input_relative_path and not task.storage_purged_at and (task.input_media_type or "").startswith("image/") else [],
        "outputs": outputs,
        "generated_count": len(active_outputs) if task.status == "completed" else 0,
        "failed_count": requested_count if task.status == "failed" else 0,
        "total_count": output_count,
        "last_error": task.error_message,
        "error": task.error_message,
        "backend": workspace_backend,
        "requested_backend": workspace_backend,
        "api_provider_id": workspace_provider_id,
        "archived_at": task.archived_at,
        "viewed_at": task.viewed_at,
        "retry_of_task_id": task.retry_of_task_id,
        "selected_output_indexes": [
            int(item.get("index") or index)
            for index, item in enumerate(stored_outputs, start=1)
            if bool(item.get("selected", True)) and not bool(item.get("deleted"))
        ] if task.status == "completed" else [],
        "deleted_output_indexes": [
            int(item.get("index") or index)
            for index, item in enumerate(stored_outputs, start=1)
            if bool(item.get("deleted"))
        ],
        "queue_position": task.queue_position,
    }


async def _parse_task_request(
    request: Request,
) -> tuple[CreateTaskPayload, bytes | None, str | None] | None:
    content_type = request.headers.get("content-type", "").lower()
    input_bytes: bytes | None = None
    input_media_type: str | None = None
    try:
        if content_type.startswith("multipart/form-data"):
            async with request.form(max_part_size=MAX_TASK_INPUT_BYTES) as form:
                values = {
                    key: form.get(key)
                    for key in ("provider_version_id", "model_id", "prompt", "size", "quality", "output_format")
                    if form.get(key) is not None
                }
                raw_asset_versions = form.get("asset_version_ids")
                if isinstance(raw_asset_versions, str):
                    try:
                        decoded_versions = json.loads(raw_asset_versions)
                    except ValueError:
                        decoded_versions = [value.strip() for value in raw_asset_versions.split(",") if value.strip()]
                    values["asset_version_ids"] = decoded_versions
                raw_shared_versions = form.get("shared_asset_version_ids")
                if isinstance(raw_shared_versions, str):
                    try:
                        decoded_shared_versions = json.loads(raw_shared_versions)
                    except ValueError:
                        decoded_shared_versions = [value.strip() for value in raw_shared_versions.split(",") if value.strip()]
                    values["shared_asset_version_ids"] = decoded_shared_versions
                if isinstance(form.get("provider_scope"), str):
                    values["provider_scope"] = form.get("provider_scope")
                upload = form.get("input_file")
                if upload is not None:
                    if not isinstance(upload, UploadFile):
                        return None
                    input_media_type = (upload.content_type or "").split(";", 1)[0].lower()
                    if input_media_type not in SUPPORTED_INPUT_MEDIA_TYPES:
                        return None
                    input_bytes = await upload.read(MAX_TASK_INPUT_BYTES + 1)
                    if not input_bytes or len(input_bytes) > MAX_TASK_INPUT_BYTES:
                        return None
        else:
            body = await request.json()
            if not isinstance(body, dict):
                return None
            values = body
        payload = CreateTaskPayload.model_validate(values)
    except (MultiPartException, ValueError, ValidationError, RuntimeError):
        return None
    return payload, input_bytes, input_media_type


def _task_status(value: str) -> TaskStatus:
    return cast(TaskStatus, value)


def _output_extension(task: GenerationTask, output: dict[str, object] | None = None) -> str:
    output_format = str((output or {}).get("output_format") or task.request_parameters.get("output_format") or "png")
    return output_format if output_format in {"png", "jpeg", "webp"} else "png"


def _reference_file_family(filename: str) -> str:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension == "pdf":
        return "pdf"
    if extension in {"csv", "tsv", "xls", "xlsx", "xla", "xlb", "xlc", "xlm", "xlt", "xlw", "iif"}:
        return "spreadsheet"
    if extension in {"doc", "docx", "dot", "odt", "rtf", "ppt", "pptx", "pps", "pot", "ppa", "pwz", "wiz"}:
        return "document"
    return "text"

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .identity import AuthenticatedSession
from .tasks import GenerationTask, GenerationTaskRepository, TaskConfigurationError, TaskNotFound


class CreateTaskPayload(BaseModel):
    provider_version_id: str = Field(min_length=1, max_length=64)
    model_id: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=16_000)
    size: str = Field(default="1024x1024", pattern=r"^\d{2,5}x\d{2,5}$")
    quality: Literal["auto", "low", "medium", "high"] = "auto"
    output_format: Literal["png", "jpeg", "webp"] = "png"


def install_task_routes(
    app: FastAPI,
    *,
    tasks: GenerationTaskRepository,
) -> None:
    @app.post("/api/tasks", response_model=None, status_code=201)
    def create_task(request: Request, payload: CreateTaskPayload) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
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
            )
        except TaskConfigurationError as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(status_code=201, content={"task": _task_payload(task)})

    @app.get("/api/tasks", response_model=None)
    def list_tasks(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(
            content={
                "tasks": [
                    _task_payload(task)
                    for task in tasks.list_tasks(session.user.user_id)
                ]
            }
        )

    @app.get("/api/tasks/{task_id}", response_model=None)
    def get_task(request: Request, task_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"task": _task_payload(task)})

    @app.get("/api/tasks/{task_id}/result")
    def get_task_result(request: Request, task_id: str):
        session: AuthenticatedSession = request.state.auth_session
        try:
            task = tasks.get_task(session.user.user_id, task_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if task.status != "completed" or task.result_media_type is None:
            return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
        try:
            result_path = tasks.result_path(task)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return FileResponse(
            result_path,
            media_type=task.result_media_type,
            headers={"Cache-Control": "no-store"},
        )


def _task_payload(task: GenerationTask) -> dict[str, object]:
    return {
        "task_id": task.task_id,
        "provider_version_id": task.provider_version_id,
        "model_id": task.model_id,
        "prompt": task.prompt,
        "request_parameters": task.request_parameters,
        "status": task.status,
        "result_sha256": task.result_sha256,
        "result_bytes": task.result_bytes,
        "revised_prompt": task.revised_prompt,
        "error_message": task.error_message,
        "created_at": task.created_at,
        "started_at": task.started_at,
        "completed_at": task.completed_at,
        "updated_at": task.updated_at,
        "result_url": (
            f"/api/tasks/{task.task_id}/result"
            if task.status == "completed" and task.result_relative_path
            else None
        ),
    }

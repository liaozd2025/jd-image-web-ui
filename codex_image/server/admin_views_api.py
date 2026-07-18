from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from psycopg.rows import dict_row

from .assets import AssetNotFound, AssetRepository
from .audit import record_audit_event
from .auth import require_admin
from .database import PostgresConnections
from .identity import AuthenticatedSession
from .department_providers import DepartmentProviderRepository, DepartmentQuotaExceeded
from .tasks import GenerationTaskRepository, TaskNotFound, task_output_records
from .tasks_api import _task_payload
from .assets_api import _asset_payload
from .maintenance import assert_writes_allowed


def install_admin_view_routes(
    app: FastAPI,
    *,
    connections: PostgresConnections,
    assets: AssetRepository,
    tasks: GenerationTaskRepository,
    departments: DepartmentProviderRepository,
) -> None:
    @app.get("/api/admin/users/{user_id}/tasks", response_model=None)
    def admin_tasks(
        request: Request,
        user_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        if not _user_exists(connections, user_id):
            return JSONResponse(status_code=404, content={"detail": "user was not found"})
        raw_status = request.query_params.get("status")
        if raw_status and raw_status not in {"queued", "running", "interrupted", "completed", "failed", "cancelled"}:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_status"})
        limit = _limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_task_limit"})
        task_list = tasks.list_tasks(
            user_id,
            status=raw_status if raw_status else None,  # type: ignore[arg-type]
            limit=limit,
            include_deleted=True,
        )
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_tasks",
            details={"count": len(task_list)},
        )
        return JSONResponse(
            content={
                "viewer": _viewer_payload(admin_session, user_id),
                "tasks": [
                    _task_payload(task, url_prefix=f"/api/admin/users/{user_id}/tasks")
                    for task in task_list
                ],
            }
        )

    @app.get("/api/admin/users/{user_id}/tasks/{task_id}", response_model=None)
    def admin_task_detail(
        user_id: str,
        task_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            task = tasks.get_task(user_id, task_id, include_deleted=True)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_task",
            details={"task_id": task_id},
        )
        return JSONResponse(
            content={
                "viewer": _viewer_payload(admin_session, user_id),
                "task": _task_payload(
                    task,
                    attempts=tasks.list_attempts(user_id, task_id),
                    url_prefix=f"/api/admin/users/{user_id}/tasks",
                ),
            }
        )

    @app.get("/api/admin/users/{user_id}/tasks/{task_id}/attempts/{attempt_id}/result")
    def admin_attempt_result(
        user_id: str,
        task_id: str,
        attempt_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            path = tasks.attempt_result_path(user_id, task_id, attempt_id)
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "attempt_result_file_missing"})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_task_artifact",
            details={"task_id": task_id, "attempt_id": attempt_id},
        )
        return FileResponse(path, media_type="image/*", headers={"Cache-Control": "no-store"})

    @app.get("/api/admin/users/{user_id}/tasks/{task_id}/outputs/{output_index}/{artifact}")
    def admin_task_output(
        user_id: str,
        task_id: str,
        output_index: int,
        artifact: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        if artifact not in {"download", "thumbnail"}:
            return JSONResponse(status_code=404, content={"detail": "artifact_not_found"})
        try:
            task = tasks.get_task(user_id, task_id, include_deleted=True)
            if task.status != "completed":
                return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
            outputs = task_output_records(task)
            if output_index < 1 or output_index > len(outputs):
                raise TaskNotFound("task output was not found")
            output = outputs[output_index - 1]
            if bool(output.get("deleted")):
                raise TaskNotFound("task output was not found")
            if artifact == "thumbnail":
                path = tasks.thumbnail_path(task, output_index)
                media_type = "image/jpeg"
                filename = f"task-{task.task_id}-image-{output_index}.thumb.jpg"
                disposition = False
            else:
                path = tasks.result_path(task, output_index)
                media_type = str(output.get("media_type") or "application/octet-stream")
                extension = str(output.get("output_format") or "png")
                filename = f"task-{task.task_id}-image-{output_index}.{extension}"
                disposition = True
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "task_file_missing"})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_task_artifact",
            details={"task_id": task_id, "artifact": artifact, "output_index": output_index},
        )
        headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
        if disposition:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return FileResponse(path, media_type=media_type, headers=headers)

    @app.get("/api/admin/users/{user_id}/tasks/{task_id}/{artifact}")
    def admin_task_artifact(
        user_id: str,
        task_id: str,
        artifact: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            task = tasks.get_task(user_id, task_id, include_deleted=True)
            if artifact in {"result", "download"}:
                if task.status != "completed":
                    return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
                path = tasks.result_path(task)
                media_type = task.result_media_type or "application/octet-stream"
                filename = f"task-{task.task_id}.png"
                disposition = artifact == "download"
            elif artifact == "thumbnail":
                if task.status != "completed":
                    return JSONResponse(status_code=409, content={"detail": "task_result_not_ready"})
                path = tasks.thumbnail_path(task)
                media_type = "image/jpeg"
                filename = f"task-{task.task_id}.thumb.jpg"
                disposition = False
            elif artifact == "input":
                path = tasks.input_path(task)
                media_type = task.input_media_type or "application/octet-stream"
                filename = f"task-{task.task_id}.input"
                disposition = False
            else:
                return JSONResponse(status_code=404, content={"detail": "artifact_not_found"})
        except TaskNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "task_file_missing"})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_task_artifact",
            details={"task_id": task_id, "artifact": artifact},
        )
        headers = {"Cache-Control": "no-store"}
        if disposition:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return FileResponse(path, media_type=media_type, headers=headers)

    @app.get("/api/admin/users/{user_id}/assets", response_model=None)
    def admin_assets(
        request: Request,
        user_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        if not _user_exists(connections, user_id):
            return JSONResponse(status_code=404, content={"detail": "user was not found"})
        limit = _limit(request)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_asset_limit"})
        asset_list = assets.list_assets(user_id, include_deleted=True, limit=limit)
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_assets",
            details={"count": len(asset_list)},
        )
        return JSONResponse(
            content={
                "viewer": _viewer_payload(admin_session, user_id),
                "assets": [
                    _asset_payload(
                        asset,
                        include_versions=False,
                        url_prefix=f"/api/admin/users/{user_id}/assets",
                    )
                    for asset in asset_list
                ],
            }
        )

    @app.get("/api/admin/users/{user_id}/assets/{asset_id}/download")
    def admin_asset_download(
        user_id: str,
        asset_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            asset = assets.get_asset(user_id, asset_id, include_deleted=True)
            if asset.current_version is None:
                raise TaskNotFound("asset has no current version")
            path = assets.asset_path(asset.current_version)
        except (AssetNotFound, TaskNotFound) as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "asset_file_missing"})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_asset_artifact",
            details={"asset_id": asset_id},
        )
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=asset.current_version.original_filename,
            content_disposition_type="attachment",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.get("/api/admin/users/{user_id}/assets/{asset_id}/versions/{asset_version_id}/download")
    def admin_asset_version_download(
        user_id: str,
        asset_id: str,
        asset_version_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ):
        try:
            version = assets.get_version(user_id, asset_version_id, include_deleted=True)
        except AssetNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        if version.asset_id != asset_id:
            return JSONResponse(status_code=404, content={"detail": "asset version was not found"})
        path = assets.asset_path(version)
        if not path.is_file():
            return JSONResponse(status_code=404, content={"detail": "asset_file_missing"})
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_asset_artifact",
            details={"asset_id": asset_id, "asset_version_id": asset_version_id},
        )
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=version.original_filename,
            content_disposition_type="attachment",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @app.get("/api/admin/users/{user_id}/usage", response_model=None)
    def admin_usage(
        user_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        if not _user_exists(connections, user_id):
            return JSONResponse(status_code=404, content={"detail": "user was not found"})
        with connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT status, COUNT(*)
                    FROM server_generation_tasks
                    WHERE user_id = %s AND deleted_at IS NULL
                    GROUP BY status
                    ORDER BY status
                    """,
                    (user_id,),
                )
                task_counts = {str(status): int(count) for status, count in cursor.fetchall()}
        try:
            department_quota = _department_quota_payload(departments.quota(user_id))
        except DepartmentQuotaExceeded:
            department_quota = None
        _record_view(
            connections,
            admin_session.user.user_id,
            user_id,
            action="admin.view_user_usage",
            details={"task_counts": task_counts},
        )
        quota = assets.quota(user_id)
        return JSONResponse(
            content={
                "viewer": _viewer_payload(admin_session, user_id),
                "usage": {
                    "storage": {
                        "quota_bytes": quota.quota_bytes,
                        "used_bytes": quota.used_bytes,
                        "available_bytes": quota.available_bytes,
                    },
                    "department_quota": department_quota,
                    "tasks": task_counts,
                },
            }
        )

    @app.get("/api/admin/audit", response_model=None)
    def admin_audit(
        request: Request,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        limit = _limit(request, default=100, maximum=200)
        if limit is None:
            return JSONResponse(status_code=422, content={"detail": "invalid_audit_limit"})
        conditions = ["TRUE"]
        values: list[object] = []
        for key, column in (("actor_user_id", "actor_user_id"), ("subject_user_id", "subject_user_id"), ("action", "action")):
            value = request.query_params.get(key)
            if value:
                conditions.append(f"{column} = %s")
                values.append(value)
        for key, operator in (("occurred_after", ">="), ("occurred_before", "<=")):
            value = request.query_params.get(key)
            if value:
                conditions.append(f"occurred_at {operator} %s::timestamptz")
                values.append(value)
        with connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT event_id, action, outcome, actor_user_id, subject_user_id,
                           details, occurred_at
                    FROM server_audit_events
                    WHERE {' AND '.join(conditions)}
                    ORDER BY occurred_at DESC, event_id DESC
                    LIMIT %s
                    """,
                    (*values, limit),
                )
                rows = cursor.fetchall()
        return JSONResponse(
            content={
                "viewer": _viewer_payload(admin_session, None),
                "events": [
                    {
                        **row,
                        "occurred_at": row["occurred_at"].isoformat(),
                    }
                    for row in rows
                ],
            }
        )


def _user_exists(connections: PostgresConnections, user_id: str) -> bool:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM server_users WHERE user_id = %s", (user_id,))
            return cursor.fetchone() is not None


def _record_view(
    connections: PostgresConnections,
    actor_user_id: str,
    subject_user_id: str,
    *,
    action: str,
    details: dict[str, object],
) -> None:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            assert_writes_allowed(cursor)
            record_audit_event(
                cursor,
                action=action,
                actor_user_id=actor_user_id,
                subject_user_id=subject_user_id,
                details=details,
            )


def _viewer_payload(admin_session: AuthenticatedSession, target_user_id: str | None) -> dict[str, object]:
    return {
        "mode": "admin_read_only",
        "admin_user_id": admin_session.user.user_id,
        "target_user_id": target_user_id,
    }


def _limit(request: Request, *, default: int = 50, maximum: int = 100) -> int | None:
    try:
        return min(max(int(request.query_params.get("limit", str(default))), 1), maximum)
    except ValueError:
        return None


def _department_quota_payload(quota: object) -> dict[str, object]:
    return {
        "period_start": quota.period_start,
        "period_end": quota.period_end,
        "global_quota_units": quota.global_quota_units,
        "user_quota_units": quota.user_quota_units,
        "reserved_units": quota.reserved_units,
        "consumed_units": quota.consumed_units,
        "available_units": quota.available_units,
    }

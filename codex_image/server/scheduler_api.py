from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .audit import record_audit_event
from .auth import require_admin
from .database import PostgresConnections
from .identity import AuthenticatedSession
from .maintenance import assert_writes_allowed


class SchedulerLimitsPayload(BaseModel):
    global_concurrency: int = Field(ge=1, le=128)
    per_user_concurrency: int = Field(ge=1, le=32)


def install_scheduler_routes(app: FastAPI, *, connections: PostgresConnections) -> None:
    @app.get("/api/admin/scheduler", response_model=None)
    def get_scheduler_limits(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(content={"scheduler": _read_limits(connections)})

    @app.patch("/api/admin/scheduler", response_model=None)
    def set_scheduler_limits(
        payload: SchedulerLimitsPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        with connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_scheduler_settings
                    SET global_concurrency = %s,
                        per_user_concurrency = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE singleton
                    """,
                    (payload.global_concurrency, payload.per_user_concurrency),
                )
                record_audit_event(
                    cursor,
                    action="scheduler.limits_updated",
                    actor_user_id=admin_session.user.user_id,
                    subject_user_id=None,
                    details={
                        "global_concurrency": payload.global_concurrency,
                        "per_user_concurrency": payload.per_user_concurrency,
                    },
                )
        return JSONResponse(content={"scheduler": _read_limits(connections)})


def _read_limits(connections: PostgresConnections) -> dict[str, object]:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT global_concurrency, per_user_concurrency FROM server_scheduler_settings WHERE singleton")
            row = cursor.fetchone()
            limits = (
                {"global_concurrency": 1, "per_user_concurrency": 1}
                if row is None
                else {"global_concurrency": int(row[0]), "per_user_concurrency": int(row[1])}
            )
            cursor.execute(
                """
                SELECT status, COUNT(*)
                FROM server_generation_tasks
                WHERE deleted_at IS NULL
                GROUP BY status
                """
            )
            counts = {str(status): int(count) for status, count in cursor.fetchall()}
            cursor.execute(
                """
                SELECT reason, COUNT(*)
                FROM (
                    SELECT CASE
                        WHEN NOT users.is_active THEN 'inactive_user'
                        WHEN NOT versions.is_active THEN 'inactive_provider_version'
                        WHEN tasks.provider_scope = 'personal' AND personal_credentials.encrypted_api_key IS NULL
                            THEN 'missing_personal_credential'
                        WHEN tasks.provider_scope = 'department' AND department_credentials.encrypted_api_key IS NULL
                            THEN 'missing_department_credential'
                        ELSE NULL
                    END AS reason
                    FROM server_generation_tasks AS tasks
                    JOIN server_users AS users ON users.user_id = tasks.user_id
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = tasks.provider_version_id
                    LEFT JOIN personal_provider_credentials AS personal_credentials
                      ON personal_credentials.provider_version_id = tasks.provider_version_id
                     AND personal_credentials.user_id = tasks.user_id
                     AND personal_credentials.is_active = TRUE
                    LEFT JOIN department_provider_credentials AS department_credentials
                      ON department_credentials.provider_version_id = tasks.provider_version_id
                     AND department_credentials.is_active = TRUE
                    WHERE tasks.status = 'queued' AND tasks.deleted_at IS NULL
                ) AS blocked
                WHERE reason IS NOT NULL
                GROUP BY reason
                ORDER BY reason
                """
            )
            blocked = [{"reason": reason, "count": int(count)} for reason, count in cursor.fetchall()]
            cursor.execute(
                """
                SELECT user_id,
                       COUNT(*) FILTER (WHERE status = 'queued') AS queued,
                       COUNT(*) FILTER (WHERE status = 'running') AS running
                FROM server_generation_tasks
                WHERE deleted_at IS NULL
                GROUP BY user_id
                ORDER BY user_id
                """
            )
            users = [
                {"user_id": user_id, "queued": int(queued), "running": int(running)}
                for user_id, queued, running in cursor.fetchall()
            ]
    limits["queue"] = {
        "queued": counts.get("queued", 0),
        "running": counts.get("running", 0),
        "blocked": blocked,
        "users": users,
    }
    return limits

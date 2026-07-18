from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .audit import record_audit_event
from .auth import require_admin
from .database import PostgresConnections
from .identity import AuthenticatedSession


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


def _read_limits(connections: PostgresConnections) -> dict[str, int]:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT global_concurrency, per_user_concurrency FROM server_scheduler_settings WHERE singleton")
            row = cursor.fetchone()
    if row is None:
        return {"global_concurrency": 1, "per_user_concurrency": 1}
    return {"global_concurrency": int(row[0]), "per_user_concurrency": int(row[1])}

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import ServerSettings
from .database import ServerDatabase
from .volume import check_file_volume


def create_server_app(settings: ServerSettings) -> FastAPI:
    database = ServerDatabase(
        settings.database_url,
        connect_timeout_seconds=settings.database_connect_timeout_seconds,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            database.ensure_schema()
        except Exception:
            pass
        yield

    app = FastAPI(title="jd-image-web-ui server", lifespan=lifespan)

    @app.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "ok", "component": "web"}

    @app.get("/health/ready", response_model=None)
    def ready() -> JSONResponse:
        file_volume = check_file_volume(settings.data_root)
        database_status, worker = database.health(
            volume_id=file_volume.get("volume_id"),
            worker_heartbeat_ttl_seconds=settings.worker_heartbeat_ttl_seconds,
        )
        components: dict[str, Any] = {
            "database": database_status,
            "file_volume": file_volume,
            "worker": worker,
        }
        is_ready = all(component["status"] == "ready" for component in components.values())
        return JSONResponse(
            status_code=200 if is_ready else 503,
            content={
                "status": "ready" if is_ready else "not_ready",
                "components": components,
            },
        )

    return app

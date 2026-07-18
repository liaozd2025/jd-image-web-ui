from __future__ import annotations

from contextlib import asynccontextmanager
import threading
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .auth import install_authentication
from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .health import HealthStatus, ReadyComponents
from .identity import IdentityRepository
from .migrations import MigrationRunner
from .volume import check_file_volume


def create_server_app(settings: ServerSettings) -> FastAPI:
    connections = PostgresConnections(
        settings.database_url,
        connect_timeout_seconds=settings.database_connect_timeout_seconds,
    )
    migrations = MigrationRunner(connections)
    runtime = ServerRuntimeRepository(connections)
    identity = IdentityRepository(connections)
    migration_lock = threading.Lock()
    schema_ready = False

    def ensure_schema() -> None:
        nonlocal schema_ready
        if schema_ready:
            return
        with migration_lock:
            if not schema_ready:
                schema_ready = migrations.try_apply()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        ensure_schema()
        yield

    app = FastAPI(title="jd-image-web-ui server", lifespan=lifespan)

    @app.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "ok", "component": "web"}

    @app.get("/health/ready", response_model=None)
    def ready() -> JSONResponse:
        ensure_schema()
        file_volume = check_file_volume(settings.data_root)
        database_status, worker = runtime.health(
            volume_id=file_volume.get("volume_id"),
            worker_heartbeat_ttl_seconds=settings.worker_heartbeat_ttl_seconds,
        )
        components: ReadyComponents = {
            "database": database_status,
            "file_volume": file_volume,
            "worker": worker,
        }
        is_ready = all(component["status"] == HealthStatus.READY for component in components.values())
        return JSONResponse(
            status_code=200 if is_ready else 503,
            content={
                "status": "ready" if is_ready else "not_ready",
                "components": components,
            },
        )

    install_authentication(app, settings=settings, identity=identity)
    return app

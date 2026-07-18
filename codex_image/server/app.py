from __future__ import annotations

from contextlib import asynccontextmanager
import threading
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .auth import install_authentication
from .assets import AssetRepository
from .assets_api import install_asset_routes
from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .department_providers import DepartmentProviderRepository
from .department_providers_api import install_department_provider_routes
from .health import HealthStatus, ReadyComponents
from .identity import IdentityRepository
from .migrations import MigrationRunner
from .provider_secrets import ProviderSecretCipher
from .providers import ProviderRepository
from .providers_api import install_provider_routes
from .shared_assets import SharedAssetRepository
from .shared_assets_api import install_shared_asset_routes
from .tasks import GenerationTaskRepository
from .tasks_api import install_task_routes
from .volume import check_file_volume


def create_server_app(settings: ServerSettings) -> FastAPI:
    connections = PostgresConnections(
        settings.database_url,
        connect_timeout_seconds=settings.database_connect_timeout_seconds,
    )
    migrations = MigrationRunner(connections)
    runtime = ServerRuntimeRepository(connections)
    identity = IdentityRepository(connections)
    provider_cipher = ProviderSecretCipher.from_encoded_key(settings.master_key)
    asset_repository = AssetRepository(connections, settings.data_root)
    shared_asset_repository = SharedAssetRepository(connections, settings.data_root)
    department_provider_repository = DepartmentProviderRepository(connections, provider_cipher)
    task_repository = GenerationTaskRepository(
        connections,
        provider_cipher,
        settings.data_root,
        assets=asset_repository,
        shared_assets=shared_asset_repository,
        departments=department_provider_repository,
    )
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
        provider_cipher.ensure_database_key(connections)
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
    install_provider_routes(
        app,
        providers=ProviderRepository(connections, provider_cipher),
    )
    install_asset_routes(app, assets=asset_repository)
    install_shared_asset_routes(app, shared_assets=shared_asset_repository)
    install_department_provider_routes(app, departments=department_provider_repository)
    install_task_routes(app, tasks=task_repository)
    return app

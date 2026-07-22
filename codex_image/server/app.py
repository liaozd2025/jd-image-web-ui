from __future__ import annotations

from contextlib import asynccontextmanager
import threading
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .auth import install_authentication
from .assets import AssetRepository
from .assets_api import install_asset_routes
from .admin_views_api import install_admin_view_routes
from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .department_providers import DepartmentProviderRepository
from .department_providers_api import install_department_provider_routes
from .health import HealthStatus, ReadyComponents
from .identity import IdentityRepository
from .migrations import MigrationRunner
from .maintenance import MaintenanceLockError, is_locked
from .model_capabilities_api import install_model_capability_routes
from .provider_secrets import ProviderSecretCipher
from .providers import ProviderRepository
from .providers_api import install_provider_routes
from .shared_assets import SharedAssetRepository
from .shared_assets_api import install_shared_asset_routes
from .shared_gallery import SharedGalleryRepository
from .shared_gallery_api import install_shared_gallery_routes
from .scheduler_api import install_scheduler_routes
from .tasks import GenerationTaskRepository
from .tasks_api import install_task_routes
from .volume import check_file_volume
from .workspace_api import install_workspace_routes


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
    shared_gallery_repository = SharedGalleryRepository(connections)
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

    app = FastAPI(title="九典制药图片内容生产平台", lifespan=lifespan)

    @app.exception_handler(MaintenanceLockError)
    async def maintenance_lock_error_handler(_, __):
        return JSONResponse(status_code=503, content={"detail": "maintenance_in_progress"})

    @app.middleware("http")
    async def maintenance_guard(request, call_next):
        health_request = request.url.path in {"/health/live", "/health/ready"}
        if not health_request:
            try:
                if is_locked(connections):
                    return JSONResponse(status_code=503, content={"detail": "maintenance_in_progress"})
            except Exception:
                # Database health and authentication handlers provide the authoritative error response.
                pass
        return await call_next(request)

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
    provider_repository = ProviderRepository(connections, provider_cipher)
    install_model_capability_routes(app)
    install_provider_routes(app, providers=provider_repository)
    install_asset_routes(app, assets=asset_repository)
    install_admin_view_routes(
        app,
        connections=connections,
        assets=asset_repository,
        tasks=task_repository,
        departments=department_provider_repository,
    )
    install_shared_asset_routes(app, shared_assets=shared_asset_repository)
    install_shared_gallery_routes(
        app,
        shared_gallery=shared_gallery_repository,
        shared_assets=shared_asset_repository,
    )
    install_department_provider_routes(app, departments=department_provider_repository)
    install_scheduler_routes(app, connections=connections)
    install_workspace_routes(
        app,
        providers=provider_repository,
        departments=department_provider_repository,
        assets=asset_repository,
        shared_assets=shared_asset_repository,
        tasks=task_repository,
    )
    install_task_routes(app, tasks=task_repository)
    return app

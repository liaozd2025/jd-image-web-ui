from __future__ import annotations

from enum import StrEnum
from typing import NotRequired, TypedDict


class HealthStatus(StrEnum):
    READY = "ready"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


class SchemaMigrationHealth(TypedDict):
    version: str
    applied_at: str


class DatabaseHealth(TypedDict):
    status: HealthStatus
    schema_versions: list[str]
    schema_migrations: list[SchemaMigrationHealth]
    database_id: NotRequired[str]


class FileVolumeHealth(TypedDict):
    status: HealthStatus
    volume_id: NotRequired[str]


class WorkerHealth(TypedDict):
    status: HealthStatus
    instance_id: NotRequired[str]
    last_heartbeat: NotRequired[str]


class ReadyComponents(TypedDict):
    database: DatabaseHealth
    file_volume: FileVolumeHealth
    worker: WorkerHealth

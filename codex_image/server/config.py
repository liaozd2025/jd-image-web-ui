from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class ServerSettings:
    database_url: str
    data_root: Path
    database_connect_timeout_seconds: int = 2
    worker_heartbeat_interval_seconds: float = 2.0
    worker_heartbeat_ttl_seconds: float = 10.0

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ServerSettings":
        values = os.environ if environ is None else environ
        database_url = values.get("JD_IMAGE_DATABASE_URL", "").strip()
        data_root = values.get("JD_IMAGE_DATA_ROOT", "").strip()
        if not data_root:
            raise ValueError("JD_IMAGE_DATA_ROOT is required")
        return cls(
            database_url=database_url,
            data_root=Path(data_root),
            database_connect_timeout_seconds=int(
                values.get("JD_IMAGE_DATABASE_CONNECT_TIMEOUT_SECONDS", "2")
            ),
            worker_heartbeat_interval_seconds=float(
                values.get("JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS", "2")
            ),
            worker_heartbeat_ttl_seconds=float(
                values.get("JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS", "10")
            ),
        )

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise ValueError("database_url is required")
        if self.database_connect_timeout_seconds <= 0:
            raise ValueError("database_connect_timeout_seconds must be positive")
        if self.worker_heartbeat_interval_seconds <= 0:
            raise ValueError("worker_heartbeat_interval_seconds must be positive")
        if self.worker_heartbeat_ttl_seconds <= 0:
            raise ValueError("worker_heartbeat_ttl_seconds must be positive")

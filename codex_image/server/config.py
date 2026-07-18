from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class ServerSettings:
    database_url: str
    data_root: Path
    master_key: str
    database_connect_timeout_seconds: int = 2
    worker_heartbeat_interval_seconds: float = 2.0
    worker_heartbeat_ttl_seconds: float = 10.0
    session_ttl_seconds: int = 12 * 60 * 60
    session_cookie_secure: bool = False
    login_failure_limit: int = 5
    login_lock_seconds: int = 5 * 60

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ServerSettings":
        values = os.environ if environ is None else environ
        database_url = values.get("JD_IMAGE_DATABASE_URL", "").strip()
        data_root = values.get("JD_IMAGE_DATA_ROOT", "").strip()
        master_key = values.get("JD_IMAGE_MASTER_KEY", "").strip()
        if not data_root:
            raise ValueError("JD_IMAGE_DATA_ROOT is required")
        if not master_key:
            raise ValueError("JD_IMAGE_MASTER_KEY is required")
        return cls(
            database_url=database_url,
            data_root=Path(data_root),
            master_key=master_key,
            database_connect_timeout_seconds=int(
                values.get("JD_IMAGE_DATABASE_CONNECT_TIMEOUT_SECONDS", "2")
            ),
            worker_heartbeat_interval_seconds=float(
                values.get("JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS", "2")
            ),
            worker_heartbeat_ttl_seconds=float(
                values.get("JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS", "10")
            ),
            session_ttl_seconds=int(values.get("JD_IMAGE_SESSION_TTL_SECONDS", str(12 * 60 * 60))),
            session_cookie_secure=_environment_bool(
                values.get("JD_IMAGE_SESSION_COOKIE_SECURE", "false")
            ),
            login_failure_limit=int(values.get("JD_IMAGE_LOGIN_FAILURE_LIMIT", "5")),
            login_lock_seconds=int(values.get("JD_IMAGE_LOGIN_LOCK_SECONDS", str(5 * 60))),
        )

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise ValueError("database_url is required")
        if not self.master_key.strip():
            raise ValueError("master_key is required")
        if self.database_connect_timeout_seconds <= 0:
            raise ValueError("database_connect_timeout_seconds must be positive")
        if self.worker_heartbeat_interval_seconds <= 0:
            raise ValueError("worker_heartbeat_interval_seconds must be positive")
        if self.worker_heartbeat_ttl_seconds <= 0:
            raise ValueError("worker_heartbeat_ttl_seconds must be positive")
        if self.session_ttl_seconds <= 0:
            raise ValueError("session_ttl_seconds must be positive")
        if self.login_failure_limit <= 0:
            raise ValueError("login_failure_limit must be positive")
        if self.login_lock_seconds <= 0:
            raise ValueError("login_lock_seconds must be positive")


def _environment_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"invalid boolean value: {value}")

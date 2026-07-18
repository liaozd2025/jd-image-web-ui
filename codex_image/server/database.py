from __future__ import annotations

from pathlib import Path
from typing import Any

import psycopg


MIGRATION_LOCK_ID = 4_607_322_026


class ServerDatabase:
    def __init__(self, database_url: str, *, connect_timeout_seconds: int) -> None:
        self.database_url = database_url
        self.connect_timeout_seconds = connect_timeout_seconds
        self.migrations_root = Path(__file__).with_name("migrations")

    def _connect(self) -> psycopg.Connection[Any]:
        return psycopg.connect(
            self.database_url,
            connect_timeout=self.connect_timeout_seconds,
        )

    def ensure_schema(self) -> list[str]:
        migration_files = sorted(self.migrations_root.glob("*.sql"))
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS server_schema_migrations (
                        version TEXT PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                cursor.execute("SELECT version FROM server_schema_migrations")
                applied = {row[0] for row in cursor.fetchall()}
                for migration_file in migration_files:
                    version = migration_file.stem
                    if version in applied:
                        continue
                    cursor.execute(migration_file.read_text(encoding="utf-8"))
                    cursor.execute(
                        "INSERT INTO server_schema_migrations (version) VALUES (%s)",
                        (version,),
                    )
                    applied.add(version)
        return sorted(applied)

    def health(
        self,
        *,
        volume_id: str | None,
        worker_heartbeat_ttl_seconds: float,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        try:
            versions = self.ensure_schema()
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT version, applied_at FROM server_schema_migrations ORDER BY version"
                    )
                    schema_migrations = [
                        {"version": row[0], "applied_at": row[1].isoformat()}
                        for row in cursor.fetchall()
                    ]
                    database = {
                        "status": "ready",
                        "schema_versions": versions,
                        "schema_migrations": schema_migrations,
                    }
                    if volume_id is None:
                        return database, {"status": "unknown"}
                    cursor.execute(
                        """
                        SELECT
                            instance_id,
                            ready,
                            heartbeat_at,
                            heartbeat_at >= CURRENT_TIMESTAMP - (%s * INTERVAL '1 second')
                        FROM server_component_heartbeats
                        WHERE component = 'worker' AND volume_id = %s
                        """,
                        (worker_heartbeat_ttl_seconds, volume_id),
                    )
                    row = cursor.fetchone()
            if row is None:
                return database, {"status": "unavailable"}
            return database, {
                "status": "ready" if row[1] and row[3] else "unavailable",
                "instance_id": row[0],
                "last_heartbeat": row[2].isoformat(),
            }
        except (OSError, psycopg.Error):
            return {"status": "unavailable", "schema_versions": []}, {"status": "unknown"}

    def record_worker_heartbeat(
        self,
        *,
        volume_id: str,
        instance_id: str,
        ready: bool,
    ) -> None:
        self.ensure_schema()
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO server_component_heartbeats (
                        component,
                        volume_id,
                        instance_id,
                        ready,
                        heartbeat_at
                    ) VALUES ('worker', %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (component, volume_id) DO UPDATE SET
                        instance_id = EXCLUDED.instance_id,
                        ready = EXCLUDED.ready,
                        heartbeat_at = EXCLUDED.heartbeat_at
                    """,
                    (volume_id, instance_id, ready),
                )

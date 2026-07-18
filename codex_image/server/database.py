from __future__ import annotations

from typing import Any

import psycopg

from .health import DatabaseHealth, HealthStatus, SchemaMigrationHealth, WorkerHealth


class PostgresConnections:
    def __init__(self, database_url: str, *, connect_timeout_seconds: int) -> None:
        self.database_url = database_url
        self.connect_timeout_seconds = connect_timeout_seconds

    def connect(self) -> psycopg.Connection[Any]:
        return psycopg.connect(
            self.database_url,
            connect_timeout=self.connect_timeout_seconds,
        )


class ServerRuntimeRepository:
    def __init__(self, connections: PostgresConnections) -> None:
        self.connections = connections

    def health(
        self,
        *,
        volume_id: str | None,
        worker_heartbeat_ttl_seconds: float,
    ) -> tuple[DatabaseHealth, WorkerHealth]:
        try:
            with self.connections.connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT version, applied_at FROM server_schema_migrations ORDER BY version"
                    )
                    schema_migrations: list[SchemaMigrationHealth] = [
                        {"version": row[0], "applied_at": row[1].isoformat()}
                        for row in cursor.fetchall()
                    ]
                    cursor.execute(
                        "SELECT database_id FROM server_runtime_identity WHERE singleton = 1"
                    )
                    identity = cursor.fetchone()
                    if identity is None:
                        return self._database_unavailable(), {"status": HealthStatus.UNKNOWN}
                    database: DatabaseHealth = {
                        "status": HealthStatus.READY,
                        "database_id": identity[0],
                        "schema_versions": [migration["version"] for migration in schema_migrations],
                        "schema_migrations": schema_migrations,
                    }
                    if volume_id is None:
                        return database, {"status": HealthStatus.UNKNOWN}
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
                return database, {"status": HealthStatus.UNAVAILABLE}
            return database, {
                "status": HealthStatus.READY if row[1] and row[3] else HealthStatus.UNAVAILABLE,
                "instance_id": row[0],
                "last_heartbeat": row[2].isoformat(),
            }
        except (OSError, psycopg.Error):
            return self._database_unavailable(), {"status": HealthStatus.UNKNOWN}

    def record_worker_heartbeat(
        self,
        *,
        volume_id: str,
        instance_id: str,
        ready: bool,
    ) -> None:
        with self.connections.connect() as connection:
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

    @staticmethod
    def _database_unavailable() -> DatabaseHealth:
        return {
            "status": HealthStatus.UNAVAILABLE,
            "schema_versions": [],
            "schema_migrations": [],
        }

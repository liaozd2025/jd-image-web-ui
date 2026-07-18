from __future__ import annotations

from pathlib import Path

import psycopg

from .database import PostgresConnections


MIGRATION_LOCK_ID = 4_607_322_026


class MigrationRunner:
    def __init__(self, connections: PostgresConnections) -> None:
        self.connections = connections
        self.migrations_root = Path(__file__).with_name("migrations")

    def try_apply(self) -> bool:
        try:
            self.apply()
        except (OSError, psycopg.Error):
            return False
        return True

    def apply(self) -> list[str]:
        migration_files = sorted(self.migrations_root.glob("*.sql"))
        with self.connections.connect() as connection:
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

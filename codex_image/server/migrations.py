from __future__ import annotations

from pathlib import Path
import hashlib

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
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        checksum TEXT
                    )
                    """
                )
                cursor.execute("ALTER TABLE server_schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT")
                cursor.execute("SELECT version, checksum FROM server_schema_migrations")
                applied = {row[0]: row[1] for row in cursor.fetchall()}
                for migration_file in migration_files:
                    version = migration_file.stem
                    checksum = hashlib.sha256(migration_file.read_bytes()).hexdigest()
                    if version in applied:
                        if applied[version] and applied[version] != checksum:
                            raise ValueError(f"migration checksum mismatch: {version}")
                        if not applied[version]:
                            cursor.execute(
                                "UPDATE server_schema_migrations SET checksum = %s WHERE version = %s",
                                (checksum, version),
                            )
                            applied[version] = checksum
                        continue
                    cursor.execute(migration_file.read_text(encoding="utf-8"))
                    cursor.execute(
                        "INSERT INTO server_schema_migrations (version, checksum) VALUES (%s, %s)",
                        (version, checksum),
                    )
                    applied[version] = checksum
        return sorted(applied)

from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerMaintenanceTests(unittest.TestCase):
    def test_maintenance_lock_blocks_writes_and_storage_reconcile_reports_orphans(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.maintenance import acquire_lock, reconcile_storage, release_lock
        from codex_image.server.database import PostgresConnections

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    logged_in = login(admin, "admin", temporary_password, user_agent="Maintenance test")
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=logged_in["csrf_token"],
                    )
                    lock = acquire_lock(
                        PostgresConnections(database_url, connect_timeout_seconds=2),
                        purpose="test maintenance",
                    )
                    blocked = admin.post(
                        "/api/admin/users",
                        json={"username": "blocked"},
                        headers={"X-CSRF-Token": changed["csrf_token"]},
                    )
                    self.assertEqual(blocked.status_code, 503, blocked.text)
                    release_lock(PostgresConnections(database_url, connect_timeout_seconds=2), lock.token)
                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "after-maintenance"},
                        headers={"X-CSRF-Token": changed["csrf_token"]},
                    )
                    self.assertEqual(created.status_code, 201, created.text)

                orphan = data_root / "tasks" / "orphan.txt"
                orphan.parent.mkdir(parents=True, exist_ok=True)
                orphan.write_text("orphan", encoding="utf-8")
                report = reconcile_storage(
                    PostgresConnections(database_url, connect_timeout_seconds=2),
                    data_root=data_root,
                )
                self.assertIn("tasks/orphan.txt", report["orphaned"])

    def test_backup_manifest_and_restore_round_trip_database_and_files(self) -> None:
        if shutil.which("pg_dump") is None or shutil.which("pg_restore") is None:
            self.skipTest("postgresql client tools are required")
        from codex_image.server.maintenance import (
            acquire_lock,
            create_backup,
            release_lock,
            restore_backup,
        )
        from codex_image.server.database import PostgresConnections

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data_root = root / "data"
                backup_root = root / "backup"
                _, _ = bootstrap_admin(database_url, data_root)
                original = data_root / "tasks" / "restore-check.txt"
                original.parent.mkdir(parents=True, exist_ok=True)
                original.write_text("restore me", encoding="utf-8")
                connections = PostgresConnections(database_url, connect_timeout_seconds=2)
                lock = acquire_lock(connections, purpose="backup test")
                try:
                    manifest = create_backup(connections, data_root=data_root, output_root=backup_root)
                finally:
                    release_lock(connections, lock.token)
                self.assertEqual(manifest["format"], 1)
                self.assertTrue((backup_root / "manifest.json").is_file())
                original.unlink()
                lock = acquire_lock(connections, purpose="restore test")
                try:
                    restored = restore_backup(connections, backup_root=backup_root, data_root=data_root)
                finally:
                    release_lock(connections, lock.token)
                self.assertEqual(restored["files"], 1)
                self.assertEqual(original.read_text(encoding="utf-8"), "restore me")


if __name__ == "__main__":
    unittest.main()

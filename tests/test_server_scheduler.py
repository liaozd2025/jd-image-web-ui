from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerSchedulerTests(unittest.TestCase):
    def test_admin_can_observe_and_update_scheduler_limits(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                )
                with ExitStack() as stack:
                    client = stack.enter_context(TestClient(create_server_app(settings)))
                    logged_in = login(client, "admin", temporary_password, user_agent="Scheduler test")
                    changed = change_password(
                        client,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=logged_in["csrf_token"],
                    )
                    csrf_token = changed["csrf_token"]

                    initial = client.get("/api/admin/scheduler")
                    self.assertEqual(initial.status_code, 200, initial.text)
                    initial_scheduler = initial.json()["scheduler"]
                    self.assertEqual(initial_scheduler["global_concurrency"], 1)
                    self.assertEqual(initial_scheduler["per_user_concurrency"], 1)
                    self.assertEqual(initial_scheduler["queue"]["queued"], 0)
                    self.assertEqual(initial_scheduler["queue"]["running"], 0)

                    updated = client.patch(
                        "/api/admin/scheduler",
                        json={"global_concurrency": 4, "per_user_concurrency": 2},
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(updated.status_code, 200, updated.text)
                    updated_scheduler = updated.json()["scheduler"]
                    self.assertEqual(updated_scheduler["global_concurrency"], 4)
                    self.assertEqual(updated_scheduler["per_user_concurrency"], 2)
                    self.assertIn("blocked", updated_scheduler["queue"])


if __name__ == "__main__":
    unittest.main()

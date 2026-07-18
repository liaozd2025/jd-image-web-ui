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
class ServerAdminViewTests(unittest.TestCase):
    def test_admin_read_only_user_views_are_scoped_and_audited(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    logged_in = login(admin, "admin", temporary_password, user_agent="Admin view test")
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=logged_in["csrf_token"],
                    )
                    csrf_token = changed["csrf_token"]
                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "view-target"},
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    target_user_id = created.json()["user"]["user_id"]

                    viewed_tasks = admin.get(f"/api/admin/users/{target_user_id}/tasks")
                    self.assertEqual(viewed_tasks.status_code, 200, viewed_tasks.text)
                    self.assertEqual(viewed_tasks.json()["viewer"]["mode"], "admin_read_only")
                    self.assertEqual(viewed_tasks.json()["viewer"]["target_user_id"], target_user_id)
                    viewed_assets = admin.get(f"/api/admin/users/{target_user_id}/assets")
                    self.assertEqual(viewed_assets.status_code, 200, viewed_assets.text)
                    viewed_usage = admin.get(f"/api/admin/users/{target_user_id}/usage")
                    self.assertEqual(viewed_usage.status_code, 200, viewed_usage.text)
                    self.assertEqual(viewed_usage.json()["viewer"]["mode"], "admin_read_only")

                    events = admin.get(f"/api/admin/audit?subject_user_id={target_user_id}")
                    self.assertEqual(events.status_code, 200, events.text)
                    actions = {event["action"] for event in events.json()["events"]}
                    self.assertIn("admin.view_user_tasks", actions)
                    self.assertIn("admin.view_user_assets", actions)
                    self.assertIn("admin.view_user_usage", actions)
                    self.assertNotIn("password", events.text.lower())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_providers import provider_payload
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "department-provider-user-password"
DEPARTMENT_KEY = "department-provider-test-secret-1234"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerDepartmentProviderTests(unittest.TestCase):
    def test_department_credential_selection_and_quota_are_explicit(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", admin_temporary_password, user_agent="Department Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "department-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(user, "department-user", created["temporary_password"], user_agent="Department User")
                    user_changed = change_password(
                        user,
                        current_password=created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]
                    provider = admin.post(
                        "/api/admin/provider-catalog",
                        json=provider_payload(display_name="Department Provider", models=["department-image"]),
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()["provider"]
                    provider_id = provider["provider_version_id"]
                    saved = admin.put(
                        f"/api/admin/providers/department/{provider_id}",
                        json={"api_key": DEPARTMENT_KEY},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(saved.status_code, 200, saved.text)
                    self.assertNotIn(DEPARTMENT_KEY, saved.text)
                    listed = user.get("/api/providers/department")
                    self.assertEqual(listed.status_code, 200)
                    self.assertNotIn(DEPARTMENT_KEY, listed.text)
                    quota = admin.patch(
                        f"/api/admin/quotas/department/users/{created['user']['user_id']}",
                        json={"quota_units": 1},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(quota.status_code, 200, quota.text)
                    first = user.post(
                        "/api/tasks",
                        json={
                            "provider_version_id": provider_id,
                            "model_id": "department-image",
                            "prompt": "department quota task",
                            "provider_scope": "department",
                        },
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(first.status_code, 201, first.text)
                    second = user.post(
                        "/api/tasks",
                        json={
                            "provider_version_id": provider_id,
                            "model_id": "department-image",
                            "prompt": "department quota task two",
                            "provider_scope": "department",
                        },
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(second.status_code, 409, second.text)

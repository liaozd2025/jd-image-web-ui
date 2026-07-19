from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_providers import provider_payload
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "department-provider-user-password"
DEPARTMENT_KEY = "department-provider-test-secret-1234"
PERSONAL_KEY = "personal-provider-test-secret-5678"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerDepartmentProviderTests(unittest.TestCase):
    def test_workspace_api_settings_save_department_and_personal_credentials(self) -> None:
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
                    admin_login = login(admin, "admin", admin_temporary_password, user_agent="Workspace Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]

                    admin_saved = admin.patch(
                        "/api/api-settings",
                        json={
                            "active_provider_id": "provider-volcengine",
                            "providers": [
                                {
                                    "id": "provider-volcengine",
                                    "name": "Volcengine Ark",
                                    "base_url": "https://ark.example.invalid/api/v3",
                                    "api_mode": "images",
                                    "image_model": "seedream-test-model",
                                    "images_concurrency": 1,
                                    "api_key": DEPARTMENT_KEY,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(admin_saved.status_code, 200, admin_saved.text)
                    self.assertNotIn(DEPARTMENT_KEY, admin_saved.text)
                    department_provider = next(
                        item
                        for item in admin_saved.json()["settings"]["providers"]
                        if item["provider_scope"] == "department"
                    )
                    self.assertTrue(department_provider["api_key_set"])
                    self.assertEqual(department_provider["image_model"], "seedream-test-model")

                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "workspace-provider-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_id = created["user"]["user_id"]
                    user_login = login(
                        user,
                        "workspace-provider-user",
                        created["temporary_password"],
                        user_agent="Workspace User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]
                    personal_provider_id = f"personal-{department_provider['provider_version_id']}"
                    user_saved = user.patch(
                        "/api/api-settings",
                        json={
                            "active_provider_id": personal_provider_id,
                            "providers": [
                                {
                                    "id": personal_provider_id,
                                    "api_key": PERSONAL_KEY,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(user_saved.status_code, 200, user_saved.text)
                    self.assertNotIn(PERSONAL_KEY, user_saved.text)
                    personal_provider = next(
                        item
                        for item in user_saved.json()["settings"]["providers"]
                        if item["id"] == personal_provider_id
                    )
                    self.assertTrue(personal_provider["api_key_set"])

                    with psycopg.connect(database_url) as connection:
                        catalog_row = connection.execute(
                            """
                            SELECT display_name, base_url, api_mode, models
                            FROM provider_catalog_versions
                            WHERE provider_version_id = %s
                            """,
                            (department_provider["provider_version_id"],),
                        ).fetchone()
                        department_secret = connection.execute(
                            """
                            SELECT encrypted_api_key
                            FROM department_provider_credentials
                            WHERE provider_version_id = %s AND is_active = TRUE
                            """,
                            (department_provider["provider_version_id"],),
                        ).fetchone()
                        personal_secret = connection.execute(
                            """
                            SELECT encrypted_api_key
                            FROM personal_provider_credentials
                            WHERE user_id = %s AND provider_version_id = %s AND is_active = TRUE
                            """,
                            (user_id, department_provider["provider_version_id"]),
                        ).fetchone()

                    self.assertEqual(catalog_row[:3], ("Volcengine Ark", "https://ark.example.invalid/api/v3", "images"))
                    self.assertEqual(catalog_row[3][0]["model_id"], "seedream-test-model")
                    self.assertIsNotNone(department_secret)
                    self.assertIsNotNone(personal_secret)
                    self.assertNotIn(DEPARTMENT_KEY, department_secret[0])
                    self.assertNotIn(PERSONAL_KEY, personal_secret[0])

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

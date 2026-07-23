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
    def test_department_provider_soft_delete_preserves_history_and_last_provider(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(
                        admin,
                        "admin",
                        admin_temporary_password,
                        user_agent="Provider Delete Admin",
                    )
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created_user = admin.post(
                        "/api/admin/users",
                        json={"username": "provider-delete-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(
                        user,
                        "provider-delete-user",
                        created_user["temporary_password"],
                        user_agent="Provider Delete User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created_user["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]
                    first = admin.post(
                        "/api/admin/provider-catalog",
                        json=provider_payload(
                            display_name="Provider To Delete",
                            models=["delete-image", "removable-image"],
                        ),
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()["provider"]
                    second_payload = provider_payload(
                        display_name="Provider To Keep",
                        models=["keep-image"],
                    )
                    second_payload["provider_key"] = "provider-to-keep"
                    second = admin.post(
                        "/api/admin/provider-catalog",
                        json=second_payload,
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()["provider"]
                    first_id = first["provider_version_id"]
                    second_id = second["provider_version_id"]
                    forbidden_delete = user.delete(
                        f"/api/admin/provider-catalog/{first_id}",
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden_delete.status_code, 403, forbidden_delete.text)
                    saved_key = admin.put(
                        f"/api/admin/providers/department/{first_id}",
                        json={"api_key": DEPARTMENT_KEY},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(saved_key.status_code, 200, saved_key.text)
                    queued_validation = admin.post(
                        f"/api/admin/generation-models/{first['models'][0]['generation_model_id']}/validate",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(
                        queued_validation.status_code,
                        202,
                        queued_validation.text,
                    )
                    personal_credential = user.put(
                        f"/api/providers/personal/{first_id}",
                        json={"api_key": PERSONAL_KEY},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(
                        personal_credential.status_code,
                        200,
                        personal_credential.text,
                    )
                    personal_models = user.put(
                        f"/api/providers/personal/{first_id}/models",
                        json={
                            "models": [
                                {
                                    "display_name": "Delete User Default",
                                    "model_id": "delete-user-default",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                                {
                                    "display_name": "Delete User Secondary",
                                    "model_id": "delete-user-secondary",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": False,
                                    "is_enabled": True,
                                },
                            ]
                        },
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(personal_models.status_code, 200, personal_models.text)
                    personal_secondary_id = next(
                        item["generation_model_id"]
                        for item in personal_models.json()["models"]
                        if item["model_id"] == "delete-user-secondary"
                    )
                    task = admin.post(
                        "/api/tasks",
                        json={
                            "provider_version_id": first_id,
                            "generation_model_id": first["models"][0]["generation_model_id"],
                            "model_id": "delete-image",
                            "prompt": "preserve provider history",
                            "provider_scope": "department",
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(task.status_code, 201, task.text)
                    task_id = task.json()["task"]["task_id"]
                    referenced_model_removal = admin.patch(
                        "/api/api-settings",
                        json={
                            "providers": [
                                {
                                    "id": f"department-{first_id}",
                                    "provider_version_id": first_id,
                                    "provider_key": first["provider_key"],
                                    "name": first["display_name"],
                                    "base_url": first["base_url"],
                                    "api_mode": first["api_mode"],
                                    "models": [
                                        {
                                            **first["models"][1],
                                            "is_default": True,
                                            "is_enabled": True,
                                        }
                                    ],
                                }
                            ]
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(
                        referenced_model_removal.status_code,
                        409,
                        referenced_model_removal.text,
                    )
                    disabled = admin.patch(
                        f"/api/admin/provider-catalog/{first_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(disabled.status_code, 200, disabled.text)

                    deleted = admin.delete(
                        f"/api/admin/provider-catalog/{first_id}",
                        headers={"X-CSRF-Token": admin_csrf},
                    )

                    self.assertEqual(deleted.status_code, 200, deleted.text)
                    self.assertEqual(
                        deleted.json(),
                        {"provider_version_id": first_id, "deleted": True},
                    )
                    catalog_ids = {
                        item["provider_version_id"]
                        for item in admin.get("/api/admin/provider-catalog").json()["providers"]
                    }
                    self.assertEqual(catalog_ids, {second_id})
                    generation_provider_ids = {
                        item["provider_version_id"]
                        for item in admin.get("/api/generation-catalog").json()["providers"]
                    }
                    self.assertNotIn(first_id, generation_provider_ids)
                    deleted_validation = admin.get(
                        f"/api/admin/generation-models/{first['models'][0]['generation_model_id']}/validation"
                    )
                    self.assertEqual(
                        deleted_validation.status_code,
                        404,
                        deleted_validation.text,
                    )
                    deleted_personal_model = user.delete(
                        f"/api/providers/personal/{first_id}/models/{personal_secondary_id}",
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(
                        deleted_personal_model.status_code,
                        404,
                        deleted_personal_model.text,
                    )
                    recent_ids = {
                        item["task_id"]
                        for item in admin.get("/api/tasks/recent?limit=50").json()["tasks"]
                    }
                    self.assertIn(task_id, recent_ids)
                    deleted_runtime = admin.post(
                        "/api/tasks",
                        json={
                            "provider_version_id": first_id,
                            "generation_model_id": first["models"][0]["generation_model_id"],
                            "model_id": "delete-image",
                            "prompt": "deleted provider must not enter runtime",
                            "provider_scope": "department",
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deleted_runtime.status_code, 409, deleted_runtime.text)
                    repeated = admin.delete(
                        f"/api/admin/provider-catalog/{first_id}",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(repeated.status_code, 404, repeated.text)
                    deleted_status = admin.patch(
                        f"/api/admin/provider-catalog/{first_id}/status",
                        json={"is_active": True},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deleted_status.status_code, 404, deleted_status.text)
                    deleted_credential = admin.put(
                        f"/api/admin/providers/department/{first_id}",
                        json={"api_key": "deleted-provider-key"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(
                        deleted_credential.status_code,
                        404,
                        deleted_credential.text,
                    )
                    deleted_edit = admin.patch(
                        "/api/api-settings",
                        json={
                            "providers": [
                                {
                                    "id": f"department-{first_id}",
                                    "provider_version_id": first_id,
                                    "name": "Deleted Provider Edit",
                                    "base_url": "https://deleted-provider.invalid/v1",
                                    "api_mode": "responses",
                                    "models": first["models"],
                                }
                            ]
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deleted_edit.status_code, 409, deleted_edit.text)
                    last_provider = admin.delete(
                        f"/api/admin/provider-catalog/{second_id}",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(last_provider.status_code, 409, last_provider.text)
                    with psycopg.connect(database_url) as connection:
                        deleted_audits = connection.execute(
                            """
                            SELECT COUNT(*)
                            FROM server_audit_events
                            WHERE action = 'provider.version_deleted'
                              AND details ->> 'provider_version_id' = %s
                            """,
                            (first_id,),
                        ).fetchone()[0]
                    self.assertEqual(deleted_audits, 1)

    def test_inactive_department_provider_is_updated_in_place(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                )
                with TestClient(create_server_app(settings)) as admin:
                    admin_login = login(
                        admin,
                        "admin",
                        admin_temporary_password,
                        user_agent="Inactive Provider Admin",
                    )
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    patch_create = admin.patch(
                        "/api/api-settings",
                        json={
                            "providers": [
                                {
                                    "id": "new-provider-through-patch",
                                    "name": "PATCH Must Not Create",
                                    "base_url": "https://patch-create.invalid/v1",
                                    "api_mode": "images",
                                    "models": [
                                        {
                                            "display_name": "PATCH Model",
                                            "model_id": "patch-model",
                                            "capability_profile_id": "generic-basic",
                                            "is_default": True,
                                            "is_enabled": True,
                                        }
                                    ],
                                    "api_key": "patch-must-not-create-secret",
                                }
                            ]
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(patch_create.status_code, 409, patch_create.text)
                    self.assertEqual(
                        admin.get("/api/admin/provider-catalog").json()["providers"],
                        [],
                    )
                    created = admin.post(
                        "/api/admin/provider-catalog",
                        json=provider_payload(
                            display_name="Inactive Provider",
                            models=["inactive-image"],
                        ),
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    provider = created.json()["provider"]
                    provider_id = provider["provider_version_id"]
                    generation_model_id = provider["models"][0]["generation_model_id"]
                    saved_key = admin.put(
                        f"/api/admin/providers/department/{provider_id}",
                        json={"api_key": DEPARTMENT_KEY},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(saved_key.status_code, 200, saved_key.text)
                    active_updated = admin.patch(
                        "/api/api-settings",
                        json={
                            "providers": [
                                {
                                    "id": f"department-{provider_id}",
                                    "provider_version_id": provider_id,
                                    "provider_key": provider["provider_key"],
                                    "name": "Active Provider Renamed",
                                    "base_url": provider["base_url"],
                                    "api_mode": provider["api_mode"],
                                    "models": provider["models"],
                                }
                            ]
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(active_updated.status_code, 200, active_updated.text)
                    active_current = admin.get(
                        "/api/admin/provider-catalog"
                    ).json()["providers"][0]
                    self.assertEqual(active_current["provider_version_id"], provider_id)
                    self.assertEqual(active_current["version_number"], 1)
                    self.assertEqual(active_current["display_name"], "Active Provider Renamed")
                    self.assertTrue(active_current["is_active"])
                    disabled = admin.patch(
                        f"/api/admin/provider-catalog/{provider_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(disabled.status_code, 200, disabled.text)

                    updated_key = "inactive-provider-updated-key-9876"
                    updated = admin.patch(
                        "/api/api-settings",
                        json={
                            "providers": [
                                {
                                    "id": f"department-{provider_id}",
                                    "provider_version_id": provider_id,
                                    "provider_key": provider["provider_key"],
                                    "name": "Inactive Provider Renamed",
                                    "base_url": "https://updated-provider.invalid/v1",
                                    "api_mode": "responses",
                                    "models": [
                                        {
                                            **provider["models"][0],
                                            "generation_model_id": generation_model_id,
                                            "display_name": "Updated Image Model",
                                            "model_id": "inactive-image-updated",
                                            "is_default": True,
                                            "is_enabled": True,
                                        }
                                    ],
                                    "api_key": updated_key,
                                }
                            ]
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )

                    self.assertEqual(updated.status_code, 200, updated.text)
                    self.assertNotIn(updated_key, updated.text)
                    catalog = admin.get("/api/admin/provider-catalog").json()["providers"]
                    self.assertEqual(len(catalog), 1)
                    current = catalog[0]
                    self.assertEqual(current["provider_version_id"], provider_id)
                    self.assertEqual(current["version_number"], 1)
                    self.assertEqual(current["display_name"], "Inactive Provider Renamed")
                    self.assertEqual(current["base_url"], "https://updated-provider.invalid/v1")
                    self.assertFalse(current["is_active"])
                    self.assertEqual(
                        current["models"][0]["generation_model_id"],
                        generation_model_id,
                    )
                    self.assertEqual(current["models"][0]["model_id"], "inactive-image-updated")
                    self.assertEqual(current["models"][0]["validation_status"], "unverified")
                    credential = next(
                        item
                        for item in admin.get("/api/admin/providers/department").json()["providers"]
                        if item["provider_version_id"] == provider_id
                    )
                    self.assertTrue(credential["has_credential"])
                    self.assertTrue(credential["api_key_mask"].endswith("9876"))
                    self.assertFalse(credential["provider_is_active"])

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

                    created_provider = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "provider-volcengine",
                            "display_name": "Volcengine Ark",
                            "base_url": "https://ark.example.invalid/api/v3",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "seedream-test-model",
                                    "model_id": "seedream-test-model",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(created_provider.status_code, 201, created_provider.text)
                    created_provider_id = created_provider.json()["provider"]["provider_version_id"]
                    saved_credential = admin.put(
                        f"/api/admin/providers/department/{created_provider_id}",
                        json={"api_key": DEPARTMENT_KEY},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(saved_credential.status_code, 200, saved_credential.text)
                    admin_saved = admin.get("/api/api-settings")
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
                    with psycopg.connect(database_url) as connection:
                        connection.execute(
                            """
                            UPDATE generation_models
                            SET validation_status = 'verified', validated_at = CURRENT_TIMESTAMP
                            WHERE provider_version_id = %s AND owner_user_id IS NULL
                            """,
                            (provider_id,),
                        )
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

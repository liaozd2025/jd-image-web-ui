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
USER_PASSWORD = "asset-user-password"
OTHER_PASSWORD = "asset-other-password"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerPersonalAssetTests(unittest.TestCase):
    def test_assets_versions_quota_trash_and_ownership(self) -> None:
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    other = stack.enter_context(TestClient(create_server_app(settings)))

                    admin_login = login(admin, "admin", admin_temporary_password, user_agent="Asset Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "asset-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    user_id = created.json()["user"]["user_id"]
                    user_temporary_password = created.json()["temporary_password"]
                    other_created = admin.post(
                        "/api/admin/users",
                        json={"username": "asset-other"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    other_temporary_password = other_created.json()["temporary_password"]

                    user_login = login(user, "asset-user", user_temporary_password, user_agent="Asset User")
                    user_changed = change_password(
                        user,
                        current_password=user_temporary_password,
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]
                    created_asset = user.post(
                        "/api/assets",
                        data={"asset_kind": "image", "name": "Portrait"},
                        files={"file": ("portrait.png", b"asset-v1", "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(created_asset.status_code, 201, created_asset.text)
                    asset = created_asset.json()["asset"]
                    asset_id = asset["asset_id"]
                    first_version_id = asset["current_version_id"]
                    self.assertEqual(asset["current_version"]["version_number"], 1)
                    self.assertEqual(user.get(f"/api/assets/{asset_id}/download").content, b"asset-v1")

                    second = user.post(
                        f"/api/assets/{asset_id}/versions",
                        files={"file": ("portrait-v2.png", b"asset-v2", "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(second.status_code, 201, second.text)
                    self.assertEqual(second.json()["asset"]["current_version"]["version_number"], 2)
                    second_version_id = second.json()["asset"]["current_version_id"]
                    self.assertNotEqual(first_version_id, second_version_id)
                    self.assertEqual(
                        user.get(f"/api/assets/{asset_id}/versions/{first_version_id}/download").content,
                        b"asset-v1",
                    )

                    quota = user.get("/api/assets/quota").json()["quota"]
                    self.assertEqual(quota["used_bytes"], len(b"asset-v1") + len(b"asset-v2"))
                    quota_update = admin.patch(
                        f"/api/admin/users/{user_id}/storage-quota",
                        json={"quota_bytes": quota["used_bytes"]},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(quota_update.status_code, 200, quota_update.text)
                    over_quota = user.post(
                        f"/api/assets/{asset_id}/versions",
                        files={"file": ("too-large.png", b"asset-v3", "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(over_quota.status_code, 413)
                    self.assertEqual(user.get("/api/assets/quota").json()["quota"]["used_bytes"], quota["used_bytes"])

                    deleted = user.delete(
                        f"/api/assets/{asset_id}",
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(deleted.status_code, 200)
                    self.assertEqual(user.get("/api/assets").json()["assets"], [])
                    self.assertEqual(user.get("/api/assets/trash").json()["assets"][0]["asset_id"], asset_id)
                    self.assertEqual(user.get(f"/api/assets/{asset_id}").status_code, 404)
                    self.assertEqual(user.get(f"/api/assets/{asset_id}/download").status_code, 404)

                    other_login = login(other, "asset-other", other_temporary_password, user_agent="Other Asset User")
                    other_changed = change_password(
                        other,
                        current_password=other_temporary_password,
                        new_password=OTHER_PASSWORD,
                        csrf_token=other_login["csrf_token"],
                    )
                    self.assertEqual(other.get(f"/api/assets/{asset_id}").status_code, 404)
                    self.assertEqual(other.get(f"/api/assets/{asset_id}/download").status_code, 404)
                    self.assertEqual(other.get("/api/assets/trash").json()["assets"], [])

                    restored = user.post(
                        f"/api/assets/{asset_id}/restore",
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(restored.status_code, 200)
                    self.assertEqual(user.get(f"/api/assets/{asset_id}/download").content, b"asset-v2")

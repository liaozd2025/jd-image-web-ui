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
USER_PASSWORD = "shared-asset-user-password"
OTHER_PASSWORD = "shared-asset-other-password"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerSharedAssetTests(unittest.TestCase):
    def test_shared_asset_visibility_versioning_and_deactivation(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    owner = stack.enter_context(TestClient(create_server_app(settings)))
                    viewer = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", admin_temporary_password, user_agent="Shared Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    owner_created = admin.post(
                        "/api/admin/users",
                        json={"username": "shared-owner"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    viewer_created = admin.post(
                        "/api/admin/users",
                        json={"username": "shared-viewer"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    owner_login = login(owner, "shared-owner", owner_created["temporary_password"], user_agent="Shared Owner")
                    owner_changed = change_password(
                        owner,
                        current_password=owner_created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=owner_login["csrf_token"],
                    )
                    owner_csrf = owner_changed["csrf_token"]
                    viewer_login = login(viewer, "shared-viewer", viewer_created["temporary_password"], user_agent="Shared Viewer")
                    viewer_changed = change_password(
                        viewer,
                        current_password=viewer_created["temporary_password"],
                        new_password=OTHER_PASSWORD,
                        csrf_token=viewer_login["csrf_token"],
                    )
                    viewer_csrf = viewer_changed["csrf_token"]

                    created = owner.post(
                        "/api/shared-assets",
                        data={"asset_kind": "image", "name": "Brand mark"},
                        files={"file": ("brand.png", b"shared-v1", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    asset = created.json()["asset"]
                    asset_id = asset["asset_id"]
                    version_id = asset["current_version_id"]
                    visible = viewer.get("/api/shared-assets")
                    self.assertEqual(visible.status_code, 200)
                    self.assertEqual(visible.json()["assets"][0]["asset_id"], asset_id)
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}/download").content, b"shared-v1")
                    self.assertEqual(
                        viewer.get(f"/api/shared-assets/{asset_id}/versions/{version_id}/download").content,
                        b"shared-v1",
                    )
                    forbidden = viewer.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden.status_code, 403)
                    second = owner.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("brand-v2.png", b"shared-v2", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(second.status_code, 201, second.text)
                    self.assertEqual(second.json()["asset"]["current_version"]["version_number"], 2)
                    deactivated = owner.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(deactivated.status_code, 200)
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}").status_code, 404)
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}/download").status_code, 404)
                    admin_view = admin.get("/api/admin/shared-assets")
                    self.assertEqual(admin_view.status_code, 200)
                    self.assertFalse(admin_view.json()["assets"][0]["is_active"])

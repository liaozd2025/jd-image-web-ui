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
from tests.test_server_shared_gallery import PNG_IMAGE


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "shared-asset-user-password"
OTHER_PASSWORD = "shared-asset-other-password"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerSharedAssetTests(unittest.TestCase):
    def test_shared_image_writes_require_an_administrator(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.database import PostgresConnections
        from codex_image.server.shared_assets import SharedAssetRepository

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

                    forbidden_create = owner.post(
                        "/api/shared-assets",
                        data={"asset_kind": "image", "name": "Brand mark"},
                        files={"file": ("brand.png", b"shared-v1", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(forbidden_create.status_code, 403, forbidden_create.text)
                    forbidden_reference_create = owner.post(
                        "/api/shared-assets",
                        data={"asset_kind": "reference", "name": "Reference bypass"},
                        files={"file": ("reference.png", b"reference-image", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(forbidden_reference_create.status_code, 403, forbidden_reference_create.text)
                    anonymous = stack.enter_context(TestClient(create_server_app(settings)))
                    unauthenticated_create = anonymous.post(
                        "/api/shared-assets",
                        data={"asset_kind": "image", "name": "Anonymous image"},
                        files={"file": ("anonymous.png", b"anonymous-image", "image/png")},
                    )
                    self.assertEqual(unauthenticated_create.status_code, 401, unauthenticated_create.text)

                    created = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "Brand mark", "category_id": "uncategorized"},
                        files={"file": ("brand.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    asset = created.json()["item"]
                    asset_id = asset["asset_id"]
                    version_id = asset["current_version_id"]
                    visible = viewer.get("/api/shared-assets")
                    self.assertEqual(visible.status_code, 200)
                    self.assertEqual(visible.json()["assets"][0]["asset_id"], asset_id)
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}/download").content, PNG_IMAGE)
                    self.assertEqual(
                        viewer.get(f"/api/shared-assets/{asset_id}/versions/{version_id}/download").content,
                        PNG_IMAGE,
                    )
                    workspace_gallery = viewer.get("/api/gallery")
                    self.assertEqual(workspace_gallery.status_code, 200, workspace_gallery.text)
                    shared_gallery_item = workspace_gallery.json()["items"][0]
                    self.assertEqual(shared_gallery_item["id"], f"shared:{asset_id}")
                    self.assertEqual(shared_gallery_item["scope"], "shared")
                    self.assertTrue(shared_gallery_item["read_only"])
                    forbidden = viewer.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden.status_code, 403)
                    forbidden_gallery_delete = viewer.delete(
                        f"/api/gallery/shared:{asset_id}",
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden_gallery_delete.status_code, 403)
                    forbidden_gallery_update = viewer.patch(
                        f"/api/gallery/shared:{asset_id}",
                        json={"name": "Viewer rename"},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden_gallery_update.status_code, 403, forbidden_gallery_update.text)
                    forbidden_gallery_replace = viewer.put(
                        f"/api/gallery/shared:{asset_id}/image",
                        files={"image": ("viewer-replace.png", b"viewer-replace", "image/png")},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden_gallery_replace.status_code, 403, forbidden_gallery_replace.text)
                    forbidden_gallery_reorder = viewer.patch(
                        "/api/gallery/reorder",
                        json={"category": "portrait", "item_ids": [f"shared:{asset_id}"]},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden_gallery_reorder.status_code, 403, forbidden_gallery_reorder.text)
                    forbidden_version = owner.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("brand-v2.png", b"shared-v2", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(forbidden_version.status_code, 403, forbidden_version.text)
                    second = admin.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("brand-v2.png", PNG_IMAGE + b"shared-v2", "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(second.status_code, 201, second.text)
                    self.assertEqual(second.json()["asset"]["current_version"]["version_number"], 2)
                    deactivated = admin.delete(
                        f"/api/gallery/shared:{asset_id}",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deactivated.status_code, 200)
                    self.assertTrue(deactivated.json()["ok"])
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}").status_code, 404)
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}/download").status_code, 404)
                    admin_view = admin.get("/api/admin/shared-assets")
                    self.assertEqual(admin_view.status_code, 200)
                    self.assertFalse(admin_view.json()["assets"][0]["is_active"])
                    restored = admin.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": True},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(restored.status_code, 200, restored.text)
                    self.assertTrue(restored.json()["asset"]["is_active"])
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}").status_code, 200)

                    historical = SharedAssetRepository(
                        PostgresConnections(database_url, connect_timeout_seconds=5),
                        data_root,
                    ).create_asset(
                        owner_created["user"]["user_id"],
                        actor_role="admin",
                        asset_kind="image",
                        name="Historical contribution",
                        original_filename="historical.png",
                        mime_type="image/png",
                        content=PNG_IMAGE + b"historical-image",
                        category_id="uncategorized",
                    )
                    historical_version = owner.post(
                        f"/api/shared-assets/{historical.asset_id}/versions",
                        files={"file": ("historical-v2.png", b"historical-v2", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(historical_version.status_code, 403, historical_version.text)
                    historical_status = owner.patch(
                        f"/api/shared-assets/{historical.asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(historical_status.status_code, 403, historical_status.text)
                    historical_delete = owner.delete(
                        f"/api/gallery/shared:{historical.asset_id}",
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(historical_delete.status_code, 403, historical_delete.text)

                    historical_reference = SharedAssetRepository(
                        PostgresConnections(database_url, connect_timeout_seconds=5),
                        data_root,
                    ).create_asset(
                        owner_created["user"]["user_id"],
                        actor_role="admin",
                        asset_kind="reference",
                        name="Historical reference contribution",
                        original_filename="historical-reference.png",
                        mime_type="image/png",
                        content=PNG_IMAGE + b"historical-reference",
                        category_id="uncategorized",
                    )
                    historical_reference_version = owner.post(
                        f"/api/shared-assets/{historical_reference.asset_id}/versions",
                        files={"file": ("historical-reference-v2.png", b"historical-reference-v2", "image/png")},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(historical_reference_version.status_code, 403, historical_reference_version.text)
                    historical_reference_status = owner.patch(
                        f"/api/shared-assets/{historical_reference.asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": owner_csrf},
                    )
                    self.assertEqual(historical_reference_status.status_code, 403, historical_reference_status.text)

    def test_non_gallery_shared_assets_keep_publisher_permissions(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    publisher = stack.enter_context(TestClient(create_server_app(settings)))
                    viewer = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", admin_temporary_password, user_agent="Shared Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=admin_temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    publisher_created = admin.post(
                        "/api/admin/users",
                        json={"username": "prompt-publisher"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    viewer_created = admin.post(
                        "/api/admin/users",
                        json={"username": "prompt-viewer"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    publisher_login = login(
                        publisher,
                        "prompt-publisher",
                        publisher_created["temporary_password"],
                        user_agent="Prompt Publisher",
                    )
                    publisher_changed = change_password(
                        publisher,
                        current_password=publisher_created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=publisher_login["csrf_token"],
                    )
                    publisher_csrf = publisher_changed["csrf_token"]
                    viewer_login = login(
                        viewer,
                        "prompt-viewer",
                        viewer_created["temporary_password"],
                        user_agent="Prompt Viewer",
                    )
                    viewer_changed = change_password(
                        viewer,
                        current_password=viewer_created["temporary_password"],
                        new_password=OTHER_PASSWORD,
                        csrf_token=viewer_login["csrf_token"],
                    )
                    viewer_csrf = viewer_changed["csrf_token"]

                    created = publisher.post(
                        "/api/shared-assets",
                        data={"asset_kind": "prompt", "name": "Product prompt"},
                        files={"file": ("product-prompt.txt", b"describe the product", "text/plain")},
                        headers={"X-CSRF-Token": publisher_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    asset_id = created.json()["asset"]["asset_id"]
                    self.assertEqual(viewer.get(f"/api/shared-assets/{asset_id}/download").content, b"describe the product")

                    forbidden_version = viewer.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("viewer-edit.txt", b"viewer edit", "text/plain")},
                        headers={"X-CSRF-Token": viewer_csrf},
                    )
                    self.assertEqual(forbidden_version.status_code, 403, forbidden_version.text)
                    updated = publisher.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("publisher-edit.txt", b"publisher edit", "text/plain")},
                        headers={"X-CSRF-Token": publisher_csrf},
                    )
                    self.assertEqual(updated.status_code, 201, updated.text)
                    deactivated = publisher.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": publisher_csrf},
                    )
                    self.assertEqual(deactivated.status_code, 200, deactivated.text)
                    self.assertFalse(deactivated.json()["asset"]["is_active"])

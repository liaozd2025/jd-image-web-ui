from __future__ import annotations

from contextlib import ExitStack
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "shared-gallery-user-password"
PNG_IMAGE = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerSharedGalleryTests(unittest.TestCase):
    def test_legacy_shared_images_migrate_to_uncategorized_without_losing_identity_or_history(self) -> None:
        from codex_image.server.database import PostgresConnections
        from codex_image.server.migrations import MigrationRunner

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            migration_root = Path("codex_image/server/migrations")
            legacy_migrations = sorted(migration_root.glob("*.sql"))[:-1]
            with psycopg.connect(database_url) as connection:
                connection.execute(
                    """
                    CREATE TABLE server_schema_migrations (
                        version TEXT PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        checksum TEXT
                    )
                    """
                )
                for migration in legacy_migrations:
                    connection.execute(migration.read_text(encoding="utf-8"))
                    connection.execute(
                        "INSERT INTO server_schema_migrations (version, checksum) VALUES (%s, %s)",
                        (migration.stem, hashlib.sha256(migration.read_bytes()).hexdigest()),
                    )
                connection.execute(
                    """
                    INSERT INTO server_users (
                        user_id, username, normalized_username, role, password_hash
                    ) VALUES
                        ('legacy-admin', 'legacy-admin', 'legacy-admin', 'admin', 'unused'),
                        ('legacy-user', 'legacy-user', 'legacy-user', 'user', 'unused')
                    """
                )
                connection.execute(
                    """
                    INSERT INTO server_shared_assets (
                        asset_id, publisher_user_id, asset_kind, name, current_version_id, is_active,
                        created_at, updated_at
                    ) VALUES (
                        'legacy-image', 'legacy-admin', 'image', '历史产品图', 'legacy-version', FALSE,
                        '2024-01-02 03:04:05+00', '2024-02-03 04:05:06+00'
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO server_shared_assets (
                        asset_id, publisher_user_id, asset_kind, name, current_version_id, is_active,
                        created_at, updated_at
                    ) VALUES (
                        'legacy-user-image', 'legacy-user', 'image', '用户历史产品图',
                        'legacy-user-version', TRUE,
                        '2024-03-04 05:06:07+00', '2024-04-05 06:07:08+00'
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO server_shared_asset_versions (
                        asset_version_id, asset_id, publisher_user_id, version_number,
                        original_filename, mime_type, stored_relative_path, sha256, byte_size
                    ) VALUES (
                        'legacy-user-version', 'legacy-user-image', 'legacy-user', 1,
                        'legacy-user.png', 'image/png', 'shared/legacy-user.png', 'legacy-user-sha', 68
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO server_shared_asset_versions (
                        asset_version_id, asset_id, publisher_user_id, version_number,
                        original_filename, mime_type, stored_relative_path, sha256, byte_size
                    ) VALUES (
                        'legacy-version', 'legacy-image', 'legacy-admin', 1,
                        'legacy.png', 'image/png', 'shared/legacy.png', 'legacy-sha', 68
                    )
                    """
                )

            applied = MigrationRunner(PostgresConnections(database_url, connect_timeout_seconds=5)).apply()
            self.assertIn("0024_shared_gallery", applied)
            with psycopg.connect(database_url) as connection:
                migrated = connection.execute(
                    """
                    SELECT
                        assets.asset_id,
                        assets.publisher_user_id,
                        assets.current_version_id,
                        assets.is_active,
                        assets.created_at,
                        assets.updated_at,
                        items.category_id,
                        versions.original_filename,
                        versions.stored_relative_path
                    FROM server_shared_assets AS assets
                    JOIN server_shared_gallery_items AS items USING (asset_id)
                    JOIN server_shared_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    WHERE assets.asset_id IN ('legacy-image', 'legacy-user-image')
                    ORDER BY assets.asset_id
                    """
                ).fetchall()
            self.assertEqual(
                migrated,
                [
                    (
                        "legacy-image",
                        "legacy-admin",
                        "legacy-version",
                        False,
                        datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
                        datetime(2024, 2, 3, 4, 5, 6, tzinfo=timezone.utc),
                        "uncategorized",
                        "legacy.png",
                        "shared/legacy.png",
                    ),
                    (
                        "legacy-user-image",
                        "legacy-user",
                        "legacy-user-version",
                        True,
                        datetime(2024, 3, 4, 5, 6, 7, tzinfo=timezone.utc),
                        datetime(2024, 4, 5, 6, 7, 8, tzinfo=timezone.utc),
                        "uncategorized",
                        "legacy-user.png",
                        "shared/legacy-user.png",
                    ),
                ],
            )

    def test_shared_categories_are_persistent_admin_managed_and_personal_categories_stay_independent(self) -> None:
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))

                    admin_login = login(admin, "admin", temporary_password, user_agent="Shared Gallery Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created_user = admin.post(
                        "/api/admin/users",
                        json={"username": "shared-gallery-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(
                        user,
                        "shared-gallery-user",
                        created_user["temporary_password"],
                        user_agent="Shared Gallery User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created_user["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]

                    initial = user.get("/api/shared-gallery/categories")
                    self.assertEqual(initial.status_code, 200, initial.text)
                    self.assertEqual(
                        [category["name"] for category in initial.json()["categories"]],
                        ["未分类", "产品图片", "品牌素材", "人物形象", "场景参考"],
                    )
                    self.assertTrue(initial.json()["categories"][0]["system"])

                    forbidden = user.post(
                        "/api/shared-gallery/categories",
                        json={"name": "活动素材"},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden.status_code, 403, forbidden.text)

                    created = admin.post(
                        "/api/shared-gallery/categories",
                        json={"name": "活动素材"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    category_id = created.json()["category"]["id"]

                    personal = user.post(
                        "/api/gallery/categories",
                        json={"name": "活动素材", "prompt_role": "个人活动"},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(personal.status_code, 201, personal.text)
                    self.assertEqual(personal.json()["category"]["name"], "活动素材")

                    renamed = admin.patch(
                        f"/api/shared-gallery/categories/{category_id}",
                        json={"name": "营销活动"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(renamed.status_code, 200, renamed.text)
                    self.assertEqual(renamed.json()["category"]["name"], "营销活动")

                    reordered = admin.patch(
                        "/api/shared-gallery/categories/reorder",
                        json={"category_ids": [category_id, "uncategorized"]},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(reordered.status_code, 200, reordered.text)
                    self.assertEqual(reordered.json()["categories"][0]["id"], category_id)
                    self.assertEqual(reordered.json()["categories"][1]["id"], "uncategorized")

                    protected = admin.delete(
                        "/api/shared-gallery/categories/uncategorized",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(protected.status_code, 409, protected.text)

                    deleted = admin.delete(
                        f"/api/shared-gallery/categories/{category_id}",
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deleted.status_code, 200, deleted.text)
                    self.assertNotIn(category_id, [item["id"] for item in deleted.json()["categories"]])

                    fresh_client = stack.enter_context(TestClient(create_server_app(settings)))
                    fresh_login = login(
                        fresh_client,
                        "shared-gallery-user",
                        USER_PASSWORD,
                        user_agent="Shared Gallery User Reload",
                    )
                    self.assertTrue(fresh_login["csrf_token"])
                    reloaded = fresh_client.get("/api/shared-gallery/categories").json()["categories"]
                    self.assertEqual([item["name"] for item in reloaded], ["未分类", "产品图片", "品牌素材", "人物形象", "场景参考"])
                    personal_reloaded = fresh_client.get("/api/gallery/categories").json()["categories"]
                    self.assertIn("活动素材", [item["name"] for item in personal_reloaded])

    def test_admin_manages_a_validated_versioned_shared_gallery_item_while_users_are_read_only(self) -> None:
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Shared Item Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created_user = admin.post(
                        "/api/admin/users",
                        json={"username": "shared-item-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(
                        user,
                        "shared-item-user",
                        created_user["temporary_password"],
                        user_agent="Shared Item User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created_user["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]

                    missing_category = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "九典产品"},
                        files={"file": ("product.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(missing_category.status_code, 422, missing_category.text)

                    fake_image = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "伪造图片", "category_id": "product-images"},
                        files={"file": ("fake.png", b"%PDF-1.7 not an image", "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(fake_image.status_code, 422, fake_image.text)

                    forbidden_create = user.post(
                        "/api/shared-gallery/items",
                        data={"name": "用户图片", "category_id": "product-images"},
                        files={"file": ("user.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden_create.status_code, 403, forbidden_create.text)

                    created = admin.post(
                        "/api/shared-gallery/items",
                        data={
                            "name": "九典产品",
                            "category_id": "product-images",
                            "prompt_note": "保持包装文字与颜色",
                        },
                        files={"file": ("product.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    item = created.json()["item"]
                    asset_id = item["asset_id"]
                    first_version_id = item["current_version_id"]
                    self.assertEqual(item["category_id"], "product-images")
                    self.assertEqual(item["category_name"], "产品图片")
                    self.assertEqual(item["prompt_note"], "保持包装文字与颜色")

                    duplicate = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "九典产品", "category_id": "brand-assets"},
                        files={"file": ("duplicate.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(duplicate.status_code, 409, duplicate.text)

                    personal_same_name = user.post(
                        "/api/gallery",
                        data={"name": "九典产品", "category": "product"},
                        files={"image": ("personal.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(personal_same_name.status_code, 201, personal_same_name.text)

                    visible = user.get("/api/gallery")
                    self.assertEqual(visible.status_code, 200, visible.text)
                    shared_item = next(value for value in visible.json()["items"] if value["id"] == f"shared:{asset_id}")
                    self.assertEqual(shared_item["category"], "product-images")
                    self.assertEqual(shared_item["prompt_note"], "保持包装文字与颜色")
                    self.assertEqual(shared_item["asset_version_id"], first_version_id)

                    forbidden_update = user.patch(
                        f"/api/shared-gallery/items/{asset_id}",
                        json={"name": "用户改名", "category_id": "brand-assets", "prompt_note": "越权"},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden_update.status_code, 403, forbidden_update.text)

                    updated = admin.patch(
                        f"/api/shared-gallery/items/{asset_id}",
                        json={"name": "九典品牌产品", "category_id": "brand-assets", "prompt_note": "仅参考包装"},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(updated.status_code, 200, updated.text)
                    self.assertEqual(updated.json()["item"]["name"], "九典品牌产品")
                    self.assertEqual(updated.json()["item"]["category_id"], "brand-assets")
                    self.assertEqual(updated.json()["item"]["prompt_note"], "仅参考包装")

                    invalid_replacement = admin.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("replacement.png", b"plain text", "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(invalid_replacement.status_code, 422, invalid_replacement.text)

                    replacement = admin.post(
                        f"/api/shared-assets/{asset_id}/versions",
                        files={"file": ("replacement.png", PNG_IMAGE + b"v2", "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(replacement.status_code, 201, replacement.text)
                    self.assertEqual(replacement.json()["asset"]["current_version"]["version_number"], 2)
                    self.assertEqual(
                        user.get(f"/api/shared-assets/{asset_id}/versions/{first_version_id}/download").content,
                        PNG_IMAGE,
                    )

                    deactivated = admin.patch(
                        f"/api/shared-assets/{asset_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deactivated.status_code, 200, deactivated.text)
                    inactive_duplicate = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "九典品牌产品", "category_id": "brand-assets"},
                        files={"file": ("duplicate-inactive.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(inactive_duplicate.status_code, 409, inactive_duplicate.text)

                    audit = admin.get("/api/admin/audit?limit=100")
                    self.assertEqual(audit.status_code, 200, audit.text)
                    actions = {event["action"] for event in audit.json()["events"]}
                    self.assertTrue(
                        {
                            "shared_gallery.item_created",
                            "shared_gallery.item_updated",
                            "shared_asset.version_created",
                            "shared_asset.deactivated",
                        }.issubset(actions),
                        actions,
                    )

    def test_admin_batch_add_returns_per_file_results_without_rolling_back_valid_images(self) -> None:
        from codex_image.server.assets import MAX_ASSET_BYTES
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Batch Gallery Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created_user = admin.post(
                        "/api/admin/users",
                        json={"username": "batch-gallery-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(
                        user,
                        "batch-gallery-user",
                        created_user["temporary_password"],
                        user_agent="Batch Gallery User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created_user["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]

                    existing = admin.post(
                        "/api/shared-gallery/items",
                        data={"name": "已有名称", "category_id": "brand-assets"},
                        files={"file": ("existing.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(existing.status_code, 201, existing.text)

                    forbidden = user.post(
                        "/api/shared-gallery/items/batch",
                        data={"category_id": "brand-assets", "names": json.dumps(["越权"])},
                        files=[("files", ("user.png", PNG_IMAGE, "image/png"))],
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden.status_code, 403, forbidden.text)

                    batch = admin.post(
                        "/api/shared-gallery/items/batch",
                        data={
                            "category_id": "brand-assets",
                            "prompt_note": "统一品牌参考",
                            "names": json.dumps(["批量甲", "已有名称", "非法文件", ""]),
                        },
                        files=[
                            ("files", ("alpha.png", PNG_IMAGE + b"alpha", "image/png")),
                            ("files", ("duplicate.png", PNG_IMAGE + b"duplicate", "image/png")),
                            ("files", ("fake.png", b"plain text", "image/png")),
                            ("files", ("beta.png", PNG_IMAGE + b"beta", "image/png")),
                        ],
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(batch.status_code, 207, batch.text)
                    results = batch.json()["results"]
                    self.assertEqual([result["status"] for result in results], ["created", "failed", "failed", "created"])
                    self.assertEqual(results[0]["name"], "批量甲")
                    self.assertEqual(results[1]["error"], "name_conflict")
                    self.assertEqual(results[2]["error"], "invalid_image")
                    self.assertEqual(results[3]["name"], "beta")

                    visible_names = {
                        item["name"]
                        for item in user.get("/api/gallery").json()["items"]
                        if item["scope"] == "shared"
                    }
                    self.assertEqual(visible_names, {"已有名称", "批量甲", "beta"})
                    shared_items = [
                        item
                        for item in user.get("/api/gallery").json()["items"]
                        if item["scope"] == "shared" and item["name"] in {"批量甲", "beta"}
                    ]
                    self.assertTrue(all(item["category"] == "brand-assets" for item in shared_items))
                    self.assertTrue(all(item["prompt_note"] == "统一品牌参考" for item in shared_items))

                    oversized_batch = admin.post(
                        "/api/shared-gallery/items/batch",
                        data={
                            "category_id": "brand-assets",
                            "names": json.dumps(["大小合法", "大小超限"]),
                        },
                        files=[
                            ("files", ("size-ok.png", PNG_IMAGE + b"size-ok", "image/png")),
                            ("files", ("too-large.png", PNG_IMAGE + bytes(MAX_ASSET_BYTES + 1 - len(PNG_IMAGE)), "image/png")),
                        ],
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(oversized_batch.status_code, 207, oversized_batch.text)
                    oversized_results = oversized_batch.json()["results"]
                    self.assertEqual([result["status"] for result in oversized_results], ["created", "failed"])
                    self.assertEqual(oversized_results[1]["error"], "file_too_large")
                    self.assertIn(
                        "大小合法",
                        {
                            item["name"]
                            for item in user.get("/api/gallery").json()["items"]
                            if item["scope"] == "shared"
                        },
                    )

                    quota = admin.get("/api/admin/shared-storage-quota").json()["quota"]
                    limited = admin.patch(
                        "/api/admin/shared-storage-quota",
                        json={"quota_bytes": quota["used_bytes"]},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(limited.status_code, 200, limited.text)
                    quota_batch = admin.post(
                        "/api/shared-gallery/items/batch",
                        data={"category_id": "brand-assets", "names": json.dumps(["超额图片"])},
                        files=[("files", ("quota.png", PNG_IMAGE, "image/png"))],
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(quota_batch.status_code, 207, quota_batch.text)
                    self.assertEqual(quota_batch.json()["results"][0]["error"], "quota_exceeded")

                    audit = admin.get("/api/admin/audit?limit=100").json()["events"]
                    batch_events = [event for event in audit if event["action"] == "shared_gallery.batch_completed"]
                    self.assertEqual(len(batch_events), 3)
                    self.assertNotIn("content", json.dumps(batch_events, ensure_ascii=False))

    def test_shared_item_order_deactivation_and_restore_preserve_historical_versions(self) -> None:
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Order Gallery Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created_user = admin.post(
                        "/api/admin/users",
                        json={"username": "order-gallery-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    user_login = login(
                        user,
                        "order-gallery-user",
                        created_user["temporary_password"],
                        user_agent="Order Gallery User",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created_user["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]

                    created_items = []
                    for index, name in enumerate(("排序甲", "排序乙", "排序丙"), start=1):
                        response = admin.post(
                            "/api/shared-gallery/items",
                            data={"name": name, "category_id": "scenes"},
                            files={"file": (f"scene-{index}.png", PNG_IMAGE + bytes([index]), "image/png")},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(response.status_code, 201, response.text)
                        created_items.append(response.json()["item"])

                    reordered_ids = [
                        created_items[2]["asset_id"],
                        created_items[0]["asset_id"],
                        created_items[1]["asset_id"],
                    ]
                    forbidden = user.patch(
                        "/api/shared-gallery/items/reorder",
                        json={"category_id": "scenes", "item_ids": reordered_ids},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(forbidden.status_code, 403, forbidden.text)

                    reordered = admin.patch(
                        "/api/shared-gallery/items/reorder",
                        json={"category_id": "scenes", "item_ids": reordered_ids},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(reordered.status_code, 200, reordered.text)
                    self.assertEqual(
                        [item["asset_id"] for item in reordered.json()["items"]],
                        reordered_ids,
                    )
                    user_list = user.get("/api/shared-gallery/items?category_id=scenes")
                    self.assertEqual(user_list.status_code, 200, user_list.text)
                    self.assertEqual([item["asset_id"] for item in user_list.json()["items"]], reordered_ids)

                    target = created_items[0]
                    target_id = target["asset_id"]
                    target_version_id = target["current_version_id"]
                    deactivated = admin.patch(
                        f"/api/shared-assets/{target_id}/status",
                        json={"is_active": False},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(deactivated.status_code, 200, deactivated.text)
                    self.assertNotIn(target_id, [item["asset_id"] for item in user.get("/api/shared-gallery/items").json()["items"]])
                    self.assertEqual(user.get(f"/api/shared-assets/{target_id}/download").status_code, 404)
                    historical = user.get(
                        f"/api/shared-assets/{target_id}/versions/{target_version_id}/download"
                    )
                    self.assertEqual(historical.status_code, 200, historical.text)
                    self.assertEqual(historical.content, PNG_IMAGE + b"\x01")
                    self.assertEqual(user.get("/api/shared-gallery/items?status=inactive").status_code, 403)

                    inactive = admin.get("/api/shared-gallery/items?status=inactive")
                    self.assertEqual(inactive.status_code, 200, inactive.text)
                    self.assertEqual([item["asset_id"] for item in inactive.json()["items"]], [target_id])

                    restored = admin.patch(
                        f"/api/shared-assets/{target_id}/status",
                        json={"is_active": True},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(restored.status_code, 200, restored.text)
                    restored_order = [
                        item["asset_id"]
                        for item in user.get("/api/shared-gallery/items?category_id=scenes").json()["items"]
                    ]
                    self.assertEqual(restored_order, reordered_ids)

                    audit_actions = {
                        event["action"] for event in admin.get("/api/admin/audit?limit=100").json()["events"]
                    }
                    self.assertTrue(
                        {
                            "shared_gallery.items_reordered",
                            "shared_asset.deactivated",
                            "shared_asset.activated",
                        }.issubset(audit_actions),
                        audit_actions,
                    )

    def test_personal_and_shared_search_are_isolated_and_cross_gallery_names_resolve_by_id_and_version(self) -> None:
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
                    session_cookie_secure=False,
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    first = stack.enter_context(TestClient(create_server_app(settings)))
                    second = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Search Gallery Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    first_created = admin.post(
                        "/api/admin/users",
                        json={"username": "search-first"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    second_created = admin.post(
                        "/api/admin/users",
                        json={"username": "search-second"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    first_login = login(first, "search-first", first_created["temporary_password"], user_agent="Search First")
                    first_changed = change_password(
                        first,
                        current_password=first_created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=first_login["csrf_token"],
                    )
                    first_csrf = first_changed["csrf_token"]
                    second_login = login(second, "search-second", second_created["temporary_password"], user_agent="Search Second")
                    second_changed = change_password(
                        second,
                        current_password=second_created["temporary_password"],
                        new_password=USER_PASSWORD,
                        csrf_token=second_login["csrf_token"],
                    )
                    second_csrf = second_changed["csrf_token"]

                    shared = admin.post(
                        "/api/shared-gallery/items",
                        data={
                            "name": "同名素材",
                            "category_id": "brand-assets",
                            "prompt_note": "蓝色包装和品牌标识",
                        },
                        files={"file": ("shared.png", PNG_IMAGE + b"shared", "image/png")},
                        headers={"X-CSRF-Token": admin_csrf},
                    )
                    self.assertEqual(shared.status_code, 201, shared.text)
                    shared_item = shared.json()["item"]

                    personal = first.post(
                        "/api/gallery",
                        data={"name": "同名素材", "category": "product", "prompt_note": "暖色个人版本"},
                        files={"image": ("personal.png", PNG_IMAGE + b"personal", "image/png")},
                        headers={"X-CSRF-Token": first_csrf},
                    )
                    self.assertEqual(personal.status_code, 201, personal.text)
                    personal_item = personal.json()["item"]
                    self.assertNotEqual(personal_item["id"], f"shared:{shared_item['asset_id']}")
                    self.assertNotEqual(personal_item["asset_version_id"], shared_item["current_version_id"])

                    personal_duplicate = first.post(
                        "/api/gallery",
                        data={"name": "同名素材", "category": "portrait"},
                        files={"image": ("duplicate.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": first_csrf},
                    )
                    self.assertEqual(personal_duplicate.status_code, 409, personal_duplicate.text)

                    other_same_name = second.post(
                        "/api/gallery",
                        data={"name": "同名素材", "category": "product", "prompt_note": "第二用户"},
                        files={"image": ("other.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": second_csrf},
                    )
                    self.assertEqual(other_same_name.status_code, 201, other_same_name.text)

                    shared_search = first.get("/api/shared-gallery/items?query=蓝色&category_id=brand-assets")
                    self.assertEqual(shared_search.status_code, 200, shared_search.text)
                    self.assertEqual([item["asset_id"] for item in shared_search.json()["items"]], [shared_item["asset_id"]])

                    personal_search = first.get("/api/gallery?scope=personal&query=暖色&category_id=product")
                    self.assertEqual(personal_search.status_code, 200, personal_search.text)
                    self.assertEqual([item["id"] for item in personal_search.json()["items"]], [personal_item["id"]])
                    self.assertTrue(all(item["scope"] == "personal" for item in personal_search.json()["items"]))

                    combined = first.get("/api/gallery?query=同名素材")
                    self.assertEqual(combined.status_code, 200, combined.text)
                    matches = combined.json()["items"]
                    self.assertEqual({item["scope"] for item in matches}, {"personal", "shared"})
                    self.assertEqual(
                        {item["asset_version_id"] for item in matches},
                        {personal_item["asset_version_id"], shared_item["current_version_id"]},
                    )

                    second_personal_search = second.get("/api/gallery?scope=personal&query=暖色")
                    self.assertEqual(second_personal_search.status_code, 200, second_personal_search.text)
                    self.assertEqual(second_personal_search.json()["items"], [])

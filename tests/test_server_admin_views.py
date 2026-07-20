from __future__ import annotations

from contextlib import ExitStack
import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_shared_gallery import PNG_IMAGE
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
                    user = stack.enter_context(TestClient(create_server_app(settings)))
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
                    target_temporary_password = created.json()["temporary_password"]

                    target_login = login(user, "view-target", target_temporary_password, user_agent="Admin view target")
                    target_changed = change_password(
                        user,
                        current_password=target_temporary_password,
                        new_password="view-target-password",
                        csrf_token=target_login["csrf_token"],
                    )
                    uploaded_html = user.post(
                        "/api/assets",
                        data={"asset_kind": "file", "name": "Reference HTML"},
                        files={"file": ("reference.html", b"<script src='/api/admin/users'></script>", "text/html")},
                        headers={"X-CSRF-Token": target_changed["csrf_token"]},
                    )
                    self.assertEqual(uploaded_html.status_code, 201, uploaded_html.text)
                    html_asset_id = uploaded_html.json()["asset"]["asset_id"]

                    viewed_tasks = admin.get(f"/api/admin/users/{target_user_id}/tasks")
                    self.assertEqual(viewed_tasks.status_code, 200, viewed_tasks.text)
                    self.assertEqual(viewed_tasks.json()["viewer"]["mode"], "admin_read_only")
                    self.assertEqual(viewed_tasks.json()["viewer"]["target_user_id"], target_user_id)
                    viewed_assets = admin.get(f"/api/admin/users/{target_user_id}/assets")
                    self.assertEqual(viewed_assets.status_code, 200, viewed_assets.text)
                    downloaded_asset = admin.get(
                        f"/api/admin/users/{target_user_id}/assets/{html_asset_id}/download"
                    )
                    self.assertEqual(downloaded_asset.status_code, 200, downloaded_asset.text)
                    self.assertEqual(downloaded_asset.headers["content-type"], "application/octet-stream")
                    self.assertIn("attachment", downloaded_asset.headers["content-disposition"])
                    self.assertEqual(downloaded_asset.headers["x-content-type-options"], "nosniff")
                    viewed_usage = admin.get(f"/api/admin/users/{target_user_id}/usage")
                    self.assertEqual(viewed_usage.status_code, 200, viewed_usage.text)
                    self.assertEqual(viewed_usage.json()["viewer"]["mode"], "admin_read_only")

                    events = admin.get(f"/api/admin/audit?subject_user_id={target_user_id}")
                    self.assertEqual(events.status_code, 200, events.text)
                    actions = {event["action"] for event in events.json()["events"]}
                    self.assertIn("admin.view_user_tasks_page", actions)
                    self.assertIn("admin.view_user_assets_page", actions)
                    self.assertIn("admin.view_user_usage", actions)
                    self.assertNotIn(target_temporary_password, events.text)
                    self.assertNotIn("view-target-password", events.text)

    def test_user_tasks_and_assets_are_independently_paginated_previewed_and_audited(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.database import PostgresConnections
        from codex_image.server.maintenance import purge_expired_trash

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(database_url=database_url, data_root=data_root, master_key=TEST_MASTER_KEY)
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    user = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Content page admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    created = admin.post(
                        "/api/admin/users",
                        json={"username": "content-page-user"},
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()
                    target_user_id = created["user"]["user_id"]
                    user_login = login(
                        user,
                        "content-page-user",
                        created["temporary_password"],
                        user_agent="Content page user",
                    )
                    user_changed = change_password(
                        user,
                        current_password=created["temporary_password"],
                        new_password="content-page-password",
                        csrf_token=user_login["csrf_token"],
                    )
                    user_csrf = user_changed["csrf_token"]

                    for index in range(21):
                        uploaded = user.post(
                            "/api/assets",
                            data={"asset_kind": "prompt", "name": f"个人提示词 {index:02d}"},
                            files={
                                "file": (
                                    f"personal-{index:02d}.txt",
                                    f"个人提示词正文 {index:02d}".encode(),
                                    "text/plain",
                                )
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(uploaded.status_code, 201, uploaded.text)
                    image = user.post(
                        "/api/assets",
                        data={"asset_kind": "image", "name": "个人预览图片"},
                        files={"file": ("personal.png", PNG_IMAGE, "image/png")},
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(image.status_code, 201, image.text)
                    image_id = image.json()["asset"]["asset_id"]

                    with PostgresConnections(database_url, connect_timeout_seconds=5).connect() as connection:
                        with connection.cursor() as cursor:
                            provider_version_id = "content-page-provider-v1"
                            cursor.execute(
                                """
                                INSERT INTO provider_catalog_versions (
                                    provider_version_id, provider_key, version_number, display_name,
                                    base_url, api_mode, models, created_by_user_id
                                )
                                SELECT %s, 'content-page-provider', 1, 'Content page provider',
                                       'https://example.invalid', 'images', '[]'::jsonb, user_id
                                FROM server_users WHERE role = 'admin' LIMIT 1
                                """,
                                (provider_version_id,),
                            )
                            for index in range(22):
                                cursor.execute(
                                    """
                                    INSERT INTO server_generation_tasks (
                                        task_id, user_id, provider_version_id, model_id, prompt,
                                        request_parameters, status, queue_position, deleted_at
                                    ) VALUES (%s, %s, %s, %s, %s, '{}'::jsonb, 'failed', %s, %s)
                                    """,
                                    (
                                        f"content-page-task-{index:02d}",
                                        target_user_id,
                                        provider_version_id,
                                        "content-page-model",
                                        f"分页任务提示词 {index:02d}",
                                        index + 1,
                                        None,
                                    ),
                                )
                            for task_status in ("cancelled", "interrupted"):
                                cursor.execute(
                                    """
                                    INSERT INTO server_generation_tasks (
                                        task_id, user_id, provider_version_id, model_id, prompt,
                                        request_parameters, status, queue_position
                                    ) VALUES (%s, %s, %s, %s, %s, '{"n":2}'::jsonb, %s, 40)
                                    """,
                                    (
                                        f"content-page-task-{task_status}",
                                        target_user_id,
                                        provider_version_id,
                                        "content-page-model",
                                        f"{task_status} 状态占位",
                                        task_status,
                                    ),
                                )
                            cursor.execute(
                                """
                                UPDATE server_generation_tasks
                                SET deleted_at = CURRENT_TIMESTAMP
                                WHERE task_id = 'content-page-task-21'
                                """
                            )
                            purged_output = [{
                                "index": 1,
                                "relative_path": f"tasks/{target_user_id}/purged-task.png",
                                "thumbnail_relative_path": f"tasks/{target_user_id}/purged-task.thumb.jpg",
                                "media_type": "image/png",
                                "output_format": "png",
                                "byte_size": 10,
                                "thumbnail_bytes": 5,
                            }]
                            cursor.execute(
                                """
                                INSERT INTO server_generation_tasks (
                                    task_id, user_id, provider_version_id, model_id, prompt,
                                    request_parameters, status, queue_position, output_files,
                                    result_relative_path, thumbnail_relative_path, result_media_type,
                                    result_bytes, thumbnail_bytes, completed_at, storage_purged_at
                                ) VALUES (
                                    %s, %s, %s, %s, %s, '{"n":1}'::jsonb, 'completed', 30,
                                    %s::jsonb, %s, %s, 'image/png', 10, 5,
                                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                                )
                                """,
                                (
                                    "content-page-task-purged",
                                    target_user_id,
                                    provider_version_id,
                                    "content-page-model",
                                    "整任务文件已清理",
                                    json.dumps(purged_output),
                                    purged_output[0]["relative_path"],
                                    purged_output[0]["thumbnail_relative_path"],
                                ),
                            )
                            purged_output[0]["storage_purged_at"] = "2000-01-01T00:00:00+00:00"
                            purged_output[0]["deleted"] = True
                            purged_output[0]["deleted_at"] = "2000-01-01T00:00:00+00:00"
                            cursor.execute(
                                """
                                INSERT INTO server_generation_tasks (
                                    task_id, user_id, provider_version_id, model_id, prompt,
                                    request_parameters, status, queue_position, output_files,
                                    result_relative_path, thumbnail_relative_path, result_media_type,
                                    result_bytes, thumbnail_bytes, completed_at
                                ) VALUES (
                                    %s, %s, %s, %s, %s, '{"n":1}'::jsonb, 'completed', 31,
                                    %s::jsonb, %s, %s, 'image/png', 10, 5, CURRENT_TIMESTAMP
                                )
                                """,
                                (
                                    "content-page-output-purged",
                                    target_user_id,
                                    provider_version_id,
                                    "content-page-model",
                                    "单结果文件已清理",
                                    json.dumps(purged_output),
                                    purged_output[0]["relative_path"],
                                    purged_output[0]["thumbnail_relative_path"],
                                ),
                            )

                    task_page = admin.get(
                        f"/api/admin/users/{target_user_id}/tasks?page=2&page_size=20&state=active&status=failed"
                    )
                    self.assertEqual(task_page.status_code, 200, task_page.text)
                    self.assertEqual(task_page.json()["pagination"], {
                        "page": 2,
                        "page_size": 20,
                        "total_items": 21,
                        "total_pages": 2,
                    })
                    self.assertEqual(len(task_page.json()["tasks"]), 1)
                    searched_task = admin.get(
                        f"/api/admin/users/{target_user_id}/tasks?page=1&page_size=20&state=active&query=分页任务提示词%2020"
                    )
                    self.assertEqual(searched_task.status_code, 200, searched_task.text)
                    self.assertEqual(searched_task.json()["pagination"]["total_items"], 1)
                    deleted_tasks = admin.get(
                        f"/api/admin/users/{target_user_id}/tasks?page=1&page_size=20&state=deleted"
                    )
                    self.assertEqual(deleted_tasks.json()["pagination"]["total_items"], 1)
                    for purged_task_id in (
                        "content-page-task-purged",
                        "content-page-output-purged",
                    ):
                        purged_task = admin.get(
                            f"/api/admin/users/{target_user_id}/tasks?page=1&page_size=20&query={purged_task_id}"
                        ).json()["tasks"][0]
                        self.assertIsNone(purged_task["outputs"][0]["thumbnail_url"])
                        self.assertIsNone(purged_task["outputs"][0]["preview_url"])
                        self.assertFalse(purged_task["outputs"][0]["file_available"])
                        self.assertTrue(purged_task["outputs"][0]["storage_purged"])

                    for task_status in ("cancelled", "interrupted"):
                        status_task = admin.get(
                            f"/api/admin/users/{target_user_id}/tasks?page=1&page_size=20"
                            f"&status={task_status}&query=content-page-task-{task_status}"
                        ).json()["tasks"]
                        self.assertEqual(len(status_task), 1)
                        self.assertEqual(
                            [output["status"] for output in status_task[0]["outputs"]],
                            [task_status, task_status],
                        )

                    asset_page = admin.get(
                        f"/api/admin/users/{target_user_id}/assets?page=2&page_size=20&state=active&kind=prompt"
                    )
                    self.assertEqual(asset_page.status_code, 200, asset_page.text)
                    self.assertEqual(asset_page.json()["pagination"]["total_items"], 21)
                    self.assertEqual(len(asset_page.json()["assets"]), 1)
                    searched_asset = admin.get(
                        f"/api/admin/users/{target_user_id}/assets?page=1&page_size=20&state=active&kind=prompt&query=个人提示词%2020"
                    )
                    self.assertEqual(searched_asset.status_code, 200, searched_asset.text)
                    self.assertEqual(searched_asset.json()["pagination"]["total_items"], 1)
                    self.assertIn("个人提示词正文 20", searched_asset.json()["assets"][0]["content_excerpt"])

                    image_page = admin.get(
                        f"/api/admin/users/{target_user_id}/assets?page=1&page_size=20&state=active&kind=image"
                    )
                    image_item = image_page.json()["assets"][0]
                    self.assertEqual(image_item["asset_id"], image_id)
                    thumbnail = admin.get(image_item["thumbnail_url"])
                    self.assertEqual(thumbnail.status_code, 200, thumbnail.text)
                    self.assertEqual(thumbnail.headers["content-type"], "image/jpeg")
                    self.assertEqual(thumbnail.headers["x-content-type-options"], "nosniff")
                    thumbnail_path = (
                        data_root
                        / "content-thumbnails"
                        / "personal"
                        / f"{image_item['current_version']['asset_version_id']}.jpg"
                    )
                    self.assertTrue(thumbnail_path.is_file())

                    before_detail = admin.get(
                        f"/api/admin/audit?subject_user_id={target_user_id}&limit=200"
                    ).json()["events"]
                    self.assertFalse(any(event["action"] == "admin.view_user_asset" for event in before_detail))
                    detail = admin.get(
                        f"/api/admin/users/{target_user_id}/assets/{image_id}"
                    )
                    self.assertEqual(detail.status_code, 200, detail.text)
                    self.assertEqual(detail.json()["viewer"]["mode"], "admin_read_only")
                    after_detail = admin.get(
                        f"/api/admin/audit?subject_user_id={target_user_id}&limit=200"
                    ).json()["events"]
                    actions = [event["action"] for event in after_detail]
                    self.assertIn("admin.view_user_tasks_page", actions)
                    self.assertIn("admin.view_user_assets_page", actions)
                    self.assertIn("admin.view_user_asset", actions)

                    forbidden = user.get(
                        f"/api/admin/users/{target_user_id}/assets?page=1&page_size=20"
                    )
                    self.assertEqual(forbidden.status_code, 403, forbidden.text)

                    deleted_image = user.delete(
                        f"/api/assets/{image_id}",
                        headers={"X-CSRF-Token": user_csrf},
                    )
                    self.assertEqual(deleted_image.status_code, 200, deleted_image.text)
                    with PostgresConnections(database_url, connect_timeout_seconds=5).connect() as connection:
                        with connection.cursor() as cursor:
                            cursor.execute(
                                "UPDATE server_assets SET purge_after = '2000-01-01' WHERE asset_id = %s",
                                (image_id,),
                            )
                    purged = purge_expired_trash(
                        PostgresConnections(database_url, connect_timeout_seconds=5),
                        data_root=data_root,
                    )
                    self.assertEqual(purged["assets"], 1)
                    self.assertFalse(thumbnail_path.exists())


if __name__ == "__main__":
    unittest.main()

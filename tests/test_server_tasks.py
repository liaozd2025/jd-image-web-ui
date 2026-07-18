from __future__ import annotations

import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
TASK_USER_PASSWORD = "task-user-password"
TASK_API_KEY = "provider-test-task-key-1234"
FAKE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class FakeProviderHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, object]] = []

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        if self.headers.get("Content-Type", "").startswith("multipart/"):
            body: object = raw_body
            should_fail = False
            count_match = re.search(br'name="n"\r\n\r\n(\d+)', raw_body)
            output_count = int(count_match.group(1)) if count_match else 1
        else:
            body = json.loads(raw_body)
            should_fail = isinstance(body, dict) and body.get("prompt") == "force provider failure"
            output_count = int(body.get("n", 1)) if isinstance(body, dict) else 1
            if isinstance(body, dict) and body.get("prompt") == "hold provider for cancellation":
                time.sleep(5.0)
        type(self).requests.append(
            {
                "authorization": self.headers.get("Authorization"),
                "body": body,
                "path": self.path,
            }
        )
        if self.path.endswith("/responses"):
            response = (
                "data: "
                + json.dumps(
                    {
                        "type": "response.completed",
                        "response": {
                            "output": [
                                {
                                    "type": "image_generation_call",
                                    "result": base64.b64encode(FAKE_PNG).decode("ascii"),
                                    "revised_prompt": "fake responses revised prompt",
                                    "output_format": "png",
                                    "size": "1024x1024",
                                    "quality": "auto",
                                }
                            ]
                        },
                    }
                )
                + "\n\ndata: [DONE]\n\n"
            ).encode("utf-8")
            self.send_response(200)
            content_type = "text/event-stream"
        elif should_fail:
            response = json.dumps({"error": {"message": "fake provider failure"}}).encode("utf-8")
            self.send_response(502)
            content_type = "application/json"
        else:
            response = json.dumps(
                {
                    "data": [
                        {
                            "b64_json": base64.b64encode(FAKE_PNG).decode("ascii"),
                            "revised_prompt": f"fake revised prompt {index + 1}",
                        }
                        for index in range(output_count)
                    ]
                }
            ).encode("utf-8")
            self.send_response(200)
            content_type = "application/json"
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, *_: object) -> None:
        return


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerGenerationTaskTests(unittest.TestCase):
    def test_http_submission_is_queued_then_worker_writes_protected_result(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.database import PostgresConnections
        from codex_image.server.maintenance import purge_expired_trash

        FakeProviderHandler.requests = []
        fake_server = ThreadingHTTPServer(("127.0.0.1", 0), FakeProviderHandler)
        fake_thread = threading.Thread(target=fake_server.serve_forever, daemon=True)
        fake_thread.start()
        worker: subprocess.Popen[str] | None = None
        try:
            with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
                with tempfile.TemporaryDirectory() as tmp:
                    data_root = Path(tmp) / "data"
                    _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                    settings = ServerSettings(
                        database_url=database_url,
                        data_root=data_root,
                        master_key=TEST_MASTER_KEY,
                        worker_heartbeat_interval_seconds=0.1,
                        worker_heartbeat_ttl_seconds=1.0,
                    )
                    with TestClient(create_server_app(settings)) as admin:
                        admin_login = login(
                            admin,
                            "admin",
                            admin_temporary_password,
                            user_agent="Task Admin Browser",
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
                            json={"username": "task-user"},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        task_user_id = created_user.json()["user"]["user_id"]
                        user_temporary_password = created_user.json()["temporary_password"]
                        second_user = admin.post(
                            "/api/admin/users",
                            json={"username": "other-task-user"},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        second_user_temporary_password = second_user.json()["temporary_password"]
                        second_user_id = second_user.json()["user"]["user_id"]
                        provider = admin.post(
                            "/api/admin/provider-catalog",
                            json={
                                "provider_key": "fake-task-provider",
                                "display_name": "Fake Task Provider",
                                "base_url": f"http://127.0.0.1:{fake_server.server_port}/v1",
                                "api_mode": "images",
                                "models": [{
                                    "model_id": "fake-image-1",
                                    "capabilities": ["image_generation"],
                                }],
                                "parameter_constraints": {},
                            },
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        provider_version_id = provider.json()["provider"]["provider_version_id"]
                        responses_provider = admin.post(
                            "/api/admin/provider-catalog",
                            json={
                                "provider_key": "fake-responses-provider",
                                "display_name": "Fake Responses Provider",
                                "base_url": f"http://127.0.0.1:{fake_server.server_port}/v1",
                                "api_mode": "responses",
                                "models": [{
                                    "model_id": "fake-image-1",
                                    "capabilities": ["image_generation"],
                                }],
                                "parameter_constraints": {},
                            },
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        responses_provider_version_id = responses_provider.json()["provider"]["provider_version_id"]

                    with TestClient(create_server_app(settings)) as user:
                        user_login = login(
                            user,
                            "task-user",
                            user_temporary_password,
                            user_agent="Task User Browser",
                        )
                        user_changed = change_password(
                            user,
                            current_password=user_temporary_password,
                            new_password=TASK_USER_PASSWORD,
                            csrf_token=user_login["csrf_token"],
                        )
                        user_csrf = user_changed["csrf_token"]
                        credential = user.put(
                            f"/api/providers/personal/{provider_version_id}",
                            json={"api_key": TASK_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(credential.status_code, 200)
                        responses_credential = user.put(
                            f"/api/providers/personal/{responses_provider_version_id}",
                            json={"api_key": TASK_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(responses_credential.status_code, 200)
                        workspace_health = user.get("/api/health")
                        self.assertEqual(workspace_health.status_code, 200, workspace_health.text)
                        self.assertTrue(workspace_health.json()["auth_available"])
                        workspace_settings = user.get("/api/api-settings")
                        self.assertEqual(workspace_settings.status_code, 200, workspace_settings.text)
                        workspace_provider_id = f"personal-{provider_version_id}"
                        self.assertIn(
                            workspace_provider_id,
                            [item["id"] for item in workspace_settings.json()["settings"]["providers"]],
                        )
                        reference_file_task = user.post(
                            "/api/generate",
                            data={
                                "api_provider_id": f"personal-{responses_provider_version_id}",
                                "model": "fake-image-1",
                                "main_model": "fake-main-1",
                                "prompt": "use reference document",
                                "api_mode": "responses",
                            },
                            files=[
                                ("reference_files", ("brief.txt", b"server reference text", "text/plain")),
                                ("reference_files", ("facts.csv", b"name,value\nalpha,1", "text/csv")),
                            ],
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(reference_file_task.status_code, 201, reference_file_task.text)
                        reference_file_task_id = reference_file_task.json()["task"]["task_id"]
                        self.assertEqual(
                            [item["filename"] for item in reference_file_task.json()["task"]["reference_files"]],
                            ["brief.txt", "facts.csv"],
                        )
                        self.assertEqual(reference_file_task.json()["task"]["request_parameters"]["main_model"], "fake-main-1")
                        self.assertEqual(reference_file_task.json()["task"]["params"]["main_model"], "fake-main-1")
                        submitted = user.post(
                            "/api/generate",
                            data={
                                "api_provider_id": workspace_provider_id,
                                "model": "fake-image-1",
                                "prompt": "a test image",
                                "size": "1024x1024",
                                "quality": "auto",
                                "output_format": "png",
                                "moderation": "low",
                                "n": "2",
                                "prompt_fidelity": "original",
                                "web_search": "true",
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(submitted.status_code, 201)
                        task_id = submitted.json()["task"]["task_id"]
                        self.assertEqual(submitted.json()["task"]["status"], "queued")
                        self.assertEqual(submitted.json()["task"]["total_count"], 2)
                        self.assertGreater(submitted.json()["task"]["input_bytes"], 0)
                        self.assertTrue(submitted.json()["task"]["input_sha256"])
                        recent = user.get("/api/tasks/recent?limit=50")
                        self.assertEqual(recent.status_code, 200, recent.text)
                        self.assertEqual(recent.json()["tasks"][0]["task_id"], task_id)
                        self.assertEqual(recent.json()["tasks"][0]["output_urls"], [])
                        queue = user.get("/api/queue")
                        self.assertEqual(queue.status_code, 200, queue.text)
                        self.assertIn(task_id, [item["task_id"] for item in queue.json()["waiting"]])
                        queued_for_order = []
                        for prompt in ("queue order one", "queue order two"):
                            queued_for_order.append(
                                user.post(
                                    "/api/tasks",
                                    json={
                                        "provider_version_id": provider_version_id,
                                        "model_id": "fake-image-1",
                                        "prompt": prompt,
                                    },
                                    headers={"X-CSRF-Token": user_csrf},
                                ).json()["task"]["task_id"]
                            )
                        promoted = user.post(
                            f"/api/queue/{queued_for_order[1]}/promote",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(promoted.status_code, 200, promoted.text)
                        self.assertEqual(promoted.json()["waiting"][0]["task_id"], queued_for_order[1])
                        reordered = user.patch(
                            "/api/queue/reorder",
                            json={"task_ids": [task_id, reference_file_task_id, *queued_for_order]},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(reordered.status_code, 200, reordered.text)
                        self.assertEqual(
                            [item["task_id"] for item in reordered.json()["waiting"]],
                            [task_id, reference_file_task_id, *queued_for_order],
                        )
                        for queued_task_id in queued_for_order:
                            self.assertEqual(
                                user.delete(
                                    f"/api/queue/{queued_task_id}",
                                    headers={"X-CSRF-Token": user_csrf},
                                ).status_code,
                                200,
                            )
                        with psycopg.connect(database_url) as connection:
                            input_relative_path = connection.execute(
                                "SELECT input_relative_path FROM server_generation_tasks WHERE task_id = %s",
                                (task_id,),
                            ).fetchone()[0]
                        self.assertEqual((data_root / input_relative_path).read_text(encoding="utf-8"), "a test image")
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/result").status_code, 409)
                        cancellable = user.post(
                            "/api/tasks",
                            json={
                                "provider_version_id": provider_version_id,
                                "model_id": "fake-image-1",
                                "prompt": "cancel before worker",
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(cancellable.status_code, 201, cancellable.text)
                        cancellable_id = cancellable.json()["task"]["task_id"]
                        cancelled = user.post(
                            f"/api/tasks/{cancellable_id}/cancel",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(cancelled.status_code, 200, cancelled.text)
                        self.assertEqual(cancelled.json()["task"]["status"], "cancelled")
                        self.assertEqual(cancelled.json()["task"]["cancel_requested"], False)
                        self.assertEqual(user.get(f"/api/tasks/{cancellable_id}").json()["task"]["attempts"], [])
                        cancelled_retry = user.post(
                            f"/api/tasks/{cancellable_id}/resubmit",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(cancelled_retry.status_code, 201, cancelled_retry.text)
                        cancelled_retry_id = cancelled_retry.json()["task"]["task_id"]

                        worker_environment = os.environ.copy()
                        worker_environment.update(
                            {
                                "JD_IMAGE_DATABASE_URL": database_url,
                                "JD_IMAGE_DATA_ROOT": str(data_root),
                                "JD_IMAGE_MASTER_KEY": TEST_MASTER_KEY,
                                "JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS": "0.1",
                                "JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS": "1",
                            }
                        )
                        worker = subprocess.Popen(
                            [os.sys.executable, "-m", "codex_image.server.worker"],
                            env=worker_environment,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE,
                            text=True,
                        )
                        completed = self._wait_for_status(user, task_id, "completed")
                        reference_completed = self._wait_for_status(user, reference_file_task_id, "completed")
                        self._wait_for_status(user, cancelled_retry_id, "completed")
                        self.assertEqual(reference_completed.json()["task"]["generated_count"], 1)
                        responses_request = next(
                            item for item in FakeProviderHandler.requests if str(item["path"]).endswith("/responses")
                        )
                        responses_content = responses_request["body"]["input"][0]["content"]
                        self.assertEqual(responses_request["body"]["model"], "fake-main-1")
                        self.assertEqual(
                            [item["filename"] for item in responses_content if item["type"] == "input_file"],
                            ["brief.txt", "facts.csv"],
                        )
                        attempts = user.get(f"/api/tasks/{task_id}").json()["task"]["attempts"]
                        self.assertEqual(len(attempts), 1)
                        self.assertEqual(attempts[0]["status"], "completed")
                        result = user.get(f"/api/tasks/{task_id}/result")
                        self.assertEqual(result.status_code, 200)
                        self.assertEqual(result.content, FAKE_PNG)
                        thumbnail = user.get(f"/api/tasks/{task_id}/thumbnail")
                        self.assertEqual(thumbnail.status_code, 200)
                        self.assertTrue(thumbnail.headers["content-type"].startswith("image/jpeg"))
                        download = user.get(f"/api/tasks/{task_id}/download")
                        self.assertEqual(download.status_code, 200)
                        self.assertIn("attachment", download.headers["content-disposition"])
                        workspace_download = user.get(f"/api/tasks/{task_id}/outputs/1/download")
                        self.assertEqual(workspace_download.status_code, 200)
                        self.assertEqual(workspace_download.content, FAKE_PNG)
                        second_workspace_download = user.get(f"/api/tasks/{task_id}/outputs/2/download")
                        self.assertEqual(second_workspace_download.status_code, 200)
                        self.assertEqual(second_workspace_download.content, FAKE_PNG)
                        self.assertEqual(completed.json()["task"]["total_count"], 2)
                        self.assertEqual(completed.json()["task"]["generated_count"], 2)
                        self.assertEqual(len(completed.json()["task"]["outputs"]), 2)
                        deselected = user.patch(
                            f"/api/tasks/{task_id}/outputs/2/selected",
                            json={"selected": False},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(deselected.status_code, 200, deselected.text)
                        self.assertEqual(deselected.json()["task"]["selected_output_indexes"], [1])
                        reselected = user.patch(
                            f"/api/tasks/{task_id}/outputs/2/selected",
                            json={"selected": True},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(reselected.status_code, 200, reselected.text)
                        self.assertEqual(reselected.json()["task"]["selected_output_indexes"], [1, 2])
                        workspace_zip = user.get(f"/api/tasks/{task_id}/outputs.zip")
                        self.assertEqual(workspace_zip.status_code, 200)
                        deselected_for_delete = user.patch(
                            f"/api/tasks/{task_id}/outputs/2/selected",
                            json={"selected": False},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(deselected_for_delete.status_code, 200)
                        soft_deleted_output = user.post(
                            f"/api/tasks/{task_id}/outputs/delete-unselected",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(soft_deleted_output.status_code, 200, soft_deleted_output.text)
                        self.assertEqual(soft_deleted_output.json()["task"]["deleted_output_indexes"], [2])
                        self.assertEqual(len(soft_deleted_output.json()["task"]["outputs"]), 2)
                        self.assertTrue(soft_deleted_output.json()["task"]["outputs"][1]["deleted"])
                        self.assertIsNotNone(soft_deleted_output.json()["task"]["outputs"][1]["purge_after"])
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/outputs/2/download").status_code, 404)
                        restored_output = user.post(
                            f"/api/tasks/{task_id}/outputs/2/restore",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(restored_output.status_code, 200, restored_output.text)
                        self.assertEqual(restored_output.json()["task"]["deleted_output_indexes"], [])
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/outputs/2/download").status_code, 200)
                        history_summary = user.get("/api/task-history/summary")
                        self.assertEqual(history_summary.status_code, 200, history_summary.text)
                        self.assertGreaterEqual(history_summary.json()["total"], 1)
                        history_page = user.get("/api/task-history/tasks?limit=50&sort=newest")
                        self.assertEqual(history_page.status_code, 200, history_page.text)
                        self.assertIn(task_id, [item["task_id"] for item in history_page.json()["tasks"]])
                        archived = user.patch(
                            f"/api/tasks/{task_id}/archive",
                            json={"archived": True},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(archived.status_code, 200, archived.text)
                        self.assertTrue(archived.json()["task"]["archived_at"])
                        self.assertGreaterEqual(user.get("/api/task-history/summary").json()["archived_total"], 1)
                        restored_archive = user.patch(
                            f"/api/tasks/{task_id}/archive",
                            json={"archived": False},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(restored_archive.status_code, 200, restored_archive.text)
                        viewed = user.patch(
                            f"/api/tasks/{task_id}/viewed",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(viewed.status_code, 200, viewed.text)
                        self.assertTrue(viewed.json()["task"]["viewed_at"])
                        archive = user.get(f"/api/tasks/archive?ids={task_id}")
                        self.assertEqual(archive.status_code, 200)
                        self.assertIn(f"task-{task_id}-image-1.png".encode(), archive.content)
                        self.assertIn(f"task-{task_id}-image-2.png".encode(), archive.content)
                        stolen_path = data_root / "tasks" / second_user_id / f"{task_id}.png"
                        stolen_path.parent.mkdir(parents=True, exist_ok=True)
                        stolen_path.write_bytes(FAKE_PNG)
                        with psycopg.connect(database_url) as connection:
                            connection.execute(
                                "UPDATE server_generation_tasks SET result_relative_path = %s WHERE task_id = %s",
                                (f"tasks/{second_user_id}/{task_id}.png", task_id),
                            )
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/result").status_code, 404)
                        self.assertEqual(completed.json()["task"]["model_id"], "fake-image-1")
                        self.assertEqual(completed.json()["task"]["request_parameters"]["output_format"], "png")
                        self.assertEqual(completed.json()["task"]["request_parameters"]["n"], 2)
                        self.assertEqual(completed.json()["task"]["request_parameters"]["moderation"], "low")
                        self.assertEqual(completed.json()["task"]["request_parameters"]["prompt_fidelity"], "original")
                        self.assertTrue(completed.json()["task"]["request_parameters"]["web_search"])
                        images_request = next(
                            item
                            for item in FakeProviderHandler.requests
                            if str(item["path"]).endswith("/images/generations")
                            and item["body"].get("prompt") == "a test image"
                        )
                        self.assertEqual(images_request["body"]["n"], 2)
                        self.assertEqual(images_request["authorization"], f"Bearer {TASK_API_KEY}")

                        with psycopg.connect(database_url) as connection:
                            asset_bytes = connection.execute(
                                "SELECT COALESCE(SUM(byte_size), 0) FROM server_asset_versions WHERE user_id = %s",
                                (task_user_id,),
                            ).fetchone()[0]
                            task_rows = connection.execute(
                                """
                                SELECT input_bytes, result_bytes, thumbnail_bytes, output_files
                                FROM server_generation_tasks
                                WHERE user_id = %s AND storage_purged_at IS NULL
                                """,
                                (task_user_id,),
                            ).fetchall()
                        expected_task_bytes = sum(
                            int(input_bytes or 0)
                            + (
                                sum(
                                    int(item.get("byte_size") or 0) + int(item.get("thumbnail_bytes") or 0)
                                    for item in output_files
                                )
                                if output_files
                                else int(result_bytes or 0) + int(thumbnail_bytes or 0)
                            )
                            for input_bytes, result_bytes, thumbnail_bytes, output_files in task_rows
                        )
                        expected_used_bytes = int(asset_bytes) + expected_task_bytes
                        self.assertEqual(
                            user.get("/api/assets/quota").json()["quota"]["used_bytes"],
                            expected_used_bytes,
                        )

                        with TestClient(create_server_app(settings)) as admin_view:
                            login(admin_view, "admin", ADMIN_PASSWORD, user_agent="Task admin result view")
                            admin_tasks = admin_view.get(f"/api/admin/users/{task_user_id}/tasks?limit=100")
                            self.assertEqual(admin_tasks.status_code, 200, admin_tasks.text)
                            admin_task = next(
                                item for item in admin_tasks.json()["tasks"] if item["task_id"] == task_id
                            )
                            self.assertEqual(len(admin_task["output_urls"]), 2)
                            admin_second_output = admin_view.get(
                                f"/api/admin/users/{task_user_id}/tasks/{task_id}/outputs/2/download"
                            )
                            self.assertEqual(admin_second_output.status_code, 200, admin_second_output.text)
                            self.assertEqual(admin_second_output.content, FAKE_PNG)

                        uploaded = user.post(
                            "/api/edit",
                            data={
                                "api_provider_id": workspace_provider_id,
                                "model": "fake-image-1",
                                "prompt": "an image edit",
                                "size": "1024x1024",
                                "quality": "auto",
                                "output_format": "png",
                            },
                            files={"images": ("input.png", FAKE_PNG, "image/png")},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(uploaded.status_code, 201)
                        uploaded_task_id = uploaded.json()["task"]["task_id"]
                        self._wait_for_status(user, uploaded_task_id, "completed")
                        self.assertIn(b"image-1.png", FakeProviderHandler.requests[-1]["body"])
                        self.assertIn(FAKE_PNG, FakeProviderHandler.requests[-1]["body"])
                        deleted_task = user.delete(
                            f"/api/tasks/{uploaded_task_id}",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(deleted_task.status_code, 200)
                        self.assertEqual(
                            user.get("/api/tasks/trash").json()["tasks"][0]["task_id"],
                            uploaded_task_id,
                        )
                        self.assertEqual(user.get(f"/api/tasks/{uploaded_task_id}").status_code, 404)
                        self.assertEqual(user.get(f"/api/tasks/{uploaded_task_id}/result").status_code, 404)
                        restored_task = user.post(
                            f"/api/tasks/{uploaded_task_id}/restore",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(restored_task.status_code, 200)
                        self.assertEqual(user.get(f"/api/tasks/{uploaded_task_id}/result").status_code, 200)

                        failed_task = user.post(
                            "/api/tasks",
                            json={
                                "provider_version_id": provider_version_id,
                                "model_id": "fake-image-1",
                                "prompt": "force provider failure",
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        ).json()["task"]["task_id"]
                        failed = self._wait_for_status(user, failed_task, "failed")
                        self.assertIn("fake provider failure", failed.json()["task"]["error_message"])
                        self.assertNotIn(TASK_API_KEY, failed.text)
                        resubmitted = user.post(
                            f"/api/tasks/{failed_task}/resubmit",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(resubmitted.status_code, 201)
                        self.assertNotEqual(resubmitted.json()["task"]["task_id"], failed_task)
                        self.assertEqual(user.get(f"/api/tasks/{failed_task}").json()["task"]["status"], "failed")

                        with TestClient(create_server_app(settings)) as other:
                            other_login = login(
                                other,
                                "other-task-user",
                                second_user_temporary_password,
                                user_agent="Other Task Browser",
                            )
                            other_changed = change_password(
                                other,
                                current_password=second_user_temporary_password,
                                new_password="other-task-user-password",
                                csrf_token=other_login["csrf_token"],
                            )
                            self.assertEqual(other.get("/api/tasks").json()["tasks"], [])
                            self.assertEqual(other.get(f"/api/tasks/{task_id}").status_code, 404)
                            self.assertEqual(other.get(f"/api/tasks/{task_id}/result").status_code, 404)
                            self.assertEqual(other.get(f"/api/tasks/{task_id}/download").status_code, 404)
                            self.assertEqual(other.get(f"/api/tasks/{task_id}/thumbnail").status_code, 404)
                            self.assertEqual(other.get(f"/api/tasks/{task_id}/input").status_code, 404)
                            self.assertEqual(other.get(f"/api/tasks/archive?ids={task_id}").status_code, 404)
                            self.assertEqual(
                                other.post(
                                    f"/api/tasks/{task_id}/resubmit",
                                    headers={"X-CSRF-Token": other_changed["csrf_token"]},
                                ).status_code,
                                404,
                            )

                        user.patch(
                            f"/api/tasks/{task_id}/outputs/2/selected",
                            json={"selected": False},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        expired_output = user.post(
                            f"/api/tasks/{task_id}/outputs/delete-unselected",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(expired_output.status_code, 200, expired_output.text)
                        with psycopg.connect(database_url) as connection:
                            output_files = connection.execute(
                                "SELECT output_files FROM server_generation_tasks WHERE task_id = %s",
                                (task_id,),
                            ).fetchone()[0]
                            for output in output_files:
                                if output.get("deleted"):
                                    output["purge_after"] = "2000-01-01T00:00:00+00:00"
                            connection.execute(
                                "UPDATE server_generation_tasks SET output_files = %s::jsonb WHERE task_id = %s",
                                (json.dumps(output_files), task_id),
                            )
                        purged = purge_expired_trash(
                            PostgresConnections(database_url, connect_timeout_seconds=2),
                            data_root=data_root,
                        )
                        self.assertEqual(purged["outputs"], 1)
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/outputs/2/download").status_code, 404)
                        self.assertEqual(
                            user.post(
                                f"/api/tasks/{task_id}/outputs/2/restore",
                                headers={"X-CSRF-Token": user_csrf},
                            ).status_code,
                            404,
                        )
        finally:
            if worker is not None and worker.poll() is None:
                worker.terminate()
                worker.wait(timeout=5)
            if worker is not None and worker.stderr is not None:
                worker.stderr.close()
            fake_server.shutdown()
            fake_server.server_close()
            fake_thread.join(timeout=5)

    def _wait_for_status(self, client: TestClient, task_id: str, status: str):
        deadline = time.monotonic() + 10
        response = client.get(f"/api/tasks/{task_id}")
        while response.json()["task"]["status"] != status and time.monotonic() < deadline:
            time.sleep(0.1)
            response = client.get(f"/api/tasks/{task_id}")
        self.assertEqual(response.json()["task"]["status"], status, response.text)
        return response


if __name__ == "__main__":
    unittest.main()

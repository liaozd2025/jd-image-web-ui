from __future__ import annotations

import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
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
        body = json.loads(self.rfile.read(length))
        type(self).requests.append(
            {
                "authorization": self.headers.get("Authorization"),
                "body": body,
            }
        )
        if body.get("prompt") == "force provider failure":
            response = json.dumps({"error": {"message": "fake provider failure"}}).encode("utf-8")
            self.send_response(502)
        else:
            response = json.dumps(
                {
                    "data": [
                        {
                            "b64_json": base64.b64encode(FAKE_PNG).decode("ascii"),
                            "revised_prompt": "fake revised prompt",
                        }
                    ]
                }
            ).encode("utf-8")
            self.send_response(200)
        self.send_header("Content-Type", "application/json")
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
                        user_temporary_password = created_user.json()["temporary_password"]
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
                        submitted = user.post(
                            "/api/tasks",
                            json={
                                "provider_version_id": provider_version_id,
                                "model_id": "fake-image-1",
                                "prompt": "a test image",
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(submitted.status_code, 201)
                        task_id = submitted.json()["task"]["task_id"]
                        self.assertEqual(submitted.json()["task"]["status"], "queued")
                        self.assertGreater(submitted.json()["task"]["input_bytes"], 0)
                        self.assertTrue(submitted.json()["task"]["input_sha256"])
                        with psycopg.connect(database_url) as connection:
                            input_relative_path = connection.execute(
                                "SELECT input_relative_path FROM server_generation_tasks WHERE task_id = %s",
                                (task_id,),
                            ).fetchone()[0]
                        self.assertEqual((data_root / input_relative_path).read_text(encoding="utf-8"), "a test image")
                        self.assertEqual(user.get(f"/api/tasks/{task_id}/result").status_code, 409)

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
                        result = user.get(f"/api/tasks/{task_id}/result")
                        self.assertEqual(result.status_code, 200)
                        self.assertEqual(result.content, FAKE_PNG)
                        self.assertEqual(completed.json()["task"]["model_id"], "fake-image-1")
                        self.assertEqual(completed.json()["task"]["request_parameters"]["output_format"], "png")
                        self.assertEqual(FakeProviderHandler.requests[0]["authorization"], f"Bearer {TASK_API_KEY}")

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

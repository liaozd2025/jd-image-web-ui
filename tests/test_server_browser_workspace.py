from __future__ import annotations

import base64
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from urllib.request import urlopen

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_tasks import FakeProviderHandler
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
RUN_BROWSER = os.environ.get("JD_IMAGE_RUN_BROWSER") == "1"
USER_A_PASSWORD = "browser-user-a-password"
USER_B_PASSWORD = "browser-user-b-password"
BROWSER_INPUT_PNG = (
    Path(__file__).resolve().parents[1]
    / "codex_image"
    / "webui"
    / "static"
    / "brand"
    / "pwa-icon-192.png"
).read_bytes()


def _free_port() -> int:
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return int(candidate.getsockname()[1])


@unittest.skipUnless(
    RUN_BROWSER and TEST_DATABASE_URL and shutil.which("node"),
    "set JD_IMAGE_RUN_BROWSER=1 and JD_IMAGE_TEST_DATABASE_URL; Node.js is also required",
)
class ServerWorkspaceBrowserReleaseGateTests(unittest.TestCase):
    def test_real_browser_server_workspace_release_gate(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings

        FakeProviderHandler.requests = []
        fake_provider = ThreadingHTTPServer(("127.0.0.1", 0), FakeProviderHandler)
        fake_thread = threading.Thread(target=fake_provider.serve_forever, daemon=True)
        fake_thread.start()
        web_process: subprocess.Popen[str] | None = None
        worker_process: subprocess.Popen[str] | None = None
        try:
            with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
                with tempfile.TemporaryDirectory() as tmp:
                    data_root = Path(tmp) / "protected-data"
                    environment, admin_temporary_password = bootstrap_admin(database_url, data_root)
                    settings = ServerSettings(
                        database_url=database_url,
                        data_root=data_root,
                        master_key=TEST_MASTER_KEY,
                        worker_heartbeat_interval_seconds=0.1,
                        worker_heartbeat_ttl_seconds=1.0,
                    )
                    with TestClient(create_server_app(settings)) as admin:
                        admin_login = login(admin, "admin", admin_temporary_password, user_agent="Browser Gate Setup")
                        admin_changed = change_password(
                            admin,
                            current_password=admin_temporary_password,
                            new_password=ADMIN_PASSWORD,
                            csrf_token=admin_login["csrf_token"],
                        )
                        csrf = admin_changed["csrf_token"]
                        user_a = admin.post(
                            "/api/admin/users",
                            json={"username": "browser-user-a"},
                            headers={"X-CSRF-Token": csrf},
                        )
                        user_b = admin.post(
                            "/api/admin/users",
                            json={"username": "browser-user-b"},
                            headers={"X-CSRF-Token": csrf},
                        )
                        self.assertEqual(user_a.status_code, 201, user_a.text)
                        self.assertEqual(user_b.status_code, 201, user_b.text)
                        user_a_payload = user_a.json()
                        user_b_payload = user_b.json()
                        provider = admin.post(
                            "/api/admin/provider-catalog",
                            json={
                                "provider_key": "browser-fake-provider",
                                "display_name": "Browser Fake Provider",
                                "base_url": f"http://127.0.0.1:{fake_provider.server_port}/v1",
                                "api_mode": "images",
                                "models": [{
                                    "model_id": "fake-image-1",
                                    "capabilities": ["image_generation", "image_input"],
                                }],
                                "parameter_constraints": {},
                            },
                            headers={"X-CSRF-Token": csrf},
                        )
                        self.assertEqual(provider.status_code, 201, provider.text)
                        provider_version_id = provider.json()["provider"]["provider_version_id"]
                        department = admin.put(
                            f"/api/admin/providers/department/{provider_version_id}",
                            json={"api_key": "browser-department-provider-key"},
                            headers={"X-CSRF-Token": csrf},
                        )
                        self.assertEqual(department.status_code, 200, department.text)
                        self.assertEqual(
                            admin.patch(
                                "/api/admin/quotas/department",
                                json={"quota_units": 1000},
                                headers={"X-CSRF-Token": csrf},
                            ).status_code,
                            200,
                        )
                        for created_user in (user_a_payload, user_b_payload):
                            response = admin.patch(
                                f"/api/admin/quotas/department/users/{created_user['user']['user_id']}",
                                json={"quota_units": 100},
                                headers={"X-CSRF-Token": csrf},
                            )
                            self.assertEqual(response.status_code, 200, response.text)
                        shared_assets = (
                            ("image", "Shared browser image", "shared.png", "image/png", BROWSER_INPUT_PNG),
                            (
                                "prompt",
                                "Shared browser snippet",
                                "shared-snippet.json",
                                "text/plain",
                                json.dumps({"tag": "shared", "title": "Shared", "content": "shared browser snippet"}).encode(),
                            ),
                            (
                                "template",
                                "Shared browser template",
                                "shared-template.json",
                                "text/plain",
                                json.dumps({"title": "Shared browser template", "content": "shared browser template"}).encode(),
                            ),
                        )
                        for kind, name, filename, mime_type, content in shared_assets:
                            response = admin.post(
                                "/api/shared-assets",
                                data={"asset_kind": kind, "name": name},
                                files={"file": (filename, content, mime_type)},
                                headers={"X-CSRF-Token": csrf},
                            )
                            self.assertEqual(response.status_code, 201, response.text)

                    web_port = _free_port()
                    environment.update(
                        {
                            "JD_IMAGE_DATABASE_URL": database_url,
                            "JD_IMAGE_DATA_ROOT": str(data_root),
                            "JD_IMAGE_MASTER_KEY": TEST_MASTER_KEY,
                            "JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS": "0.1",
                            "JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS": "1",
                            "JD_IMAGE_SESSION_COOKIE_SECURE": "false",
                        }
                    )
                    web_process = subprocess.Popen(
                        [
                            sys.executable,
                            "-m",
                            "uvicorn",
                            "codex_image.server.web:app",
                            "--host",
                            "127.0.0.1",
                            "--port",
                            str(web_port),
                            "--no-access-log",
                        ],
                        env=environment,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        text=True,
                    )
                    worker_process = subprocess.Popen(
                        [sys.executable, "-m", "codex_image.server.worker"],
                        env=environment,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        text=True,
                    )
                    base_url = f"http://127.0.0.1:{web_port}"
                    for _ in range(100):
                        if web_process.poll() is not None:
                            break
                        try:
                            with urlopen(f"{base_url}/health/live", timeout=0.2) as response:
                                if response.status == 200:
                                    break
                        except OSError:
                            time.sleep(0.05)
                    else:
                        self.fail("browser release-gate web server did not start")
                    if web_process.poll() is not None:
                        self.fail(f"browser release-gate web server exited with {web_process.returncode}")

                    browser_environment = os.environ.copy()
                    browser_environment.update(
                        {
                            "JD_IMAGE_BROWSER_BASE_URL": base_url,
                            "JD_IMAGE_BROWSER_PNG_BASE64": base64.b64encode(BROWSER_INPUT_PNG).decode("ascii"),
                            "JD_IMAGE_BROWSER_USER_A_ID": user_a_payload["user"]["user_id"],
                            "JD_IMAGE_BROWSER_USER_B_ID": user_b_payload["user"]["user_id"],
                            "JD_IMAGE_BROWSER_CREDENTIALS": json.dumps(
                                {
                                    "admin": {"username": "admin", "password": ADMIN_PASSWORD},
                                    "userA": {
                                        "username": "browser-user-a",
                                        "temporaryPassword": user_a_payload["temporary_password"],
                                        "password": USER_A_PASSWORD,
                                    },
                                    "userB": {
                                        "username": "browser-user-b",
                                        "temporaryPassword": user_b_payload["temporary_password"],
                                        "password": USER_B_PASSWORD,
                                    },
                                }
                            ),
                        }
                    )
                    result = subprocess.run(
                        ["node", "tests/browser/workspace-release-gate.mjs"],
                        cwd=Path(__file__).resolve().parents[1],
                        env=browser_environment,
                        capture_output=True,
                        text=True,
                        timeout=90,
                        check=False,
                    )
                    self.assertEqual(result.returncode, 0, f"{result.stdout}\n{result.stderr}")
        finally:
            for process in (worker_process, web_process):
                if process is not None and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
            fake_provider.shutdown()
            fake_provider.server_close()
            fake_thread.join(timeout=5)

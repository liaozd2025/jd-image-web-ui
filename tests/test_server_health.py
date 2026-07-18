from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
EXPECTED_SCHEMA_VERSIONS = [
    "0001_server_runtime",
    "0002_server_runtime_identity",
    "0003_admin_identity",
    "0004_browser_sessions",
    "0005_user_lifecycle",
    "0006_provider_catalog",
    "0007_generation_tasks",
    "0008_reconcile_generation_tasks",
    "0009_generation_task_inputs",
    "0010_generation_task_thumbnails",
    "0011_personal_assets",
    "0012_asset_retention",
    "0013_task_trash_and_storage_usage",
    "0014_shared_assets",
    "0015_department_providers_and_quota",
    "0016_scheduler_limits",
    "0017_task_attempts_and_cancellation",
    "0018_maintenance_lock",
    "0019_storage_purge_markers",
    "0020_migration_checksums",
    "0021_worker_leases",
    "0022_workspace_task_state",
    "0023_workspace_outputs_queue_and_files",
]


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerHealthTests(unittest.TestCase):
    def _settings(self, data_root: Path):
        from codex_image.server.config import ServerSettings

        return ServerSettings(
            database_url=TEST_DATABASE_URL,
            data_root=data_root,
            master_key=TEST_MASTER_KEY,
            database_connect_timeout_seconds=2,
            worker_heartbeat_interval_seconds=0.1,
            worker_heartbeat_ttl_seconds=0.4,
        )

    def _worker_environment(self, data_root: Path) -> dict[str, str]:
        environment = os.environ.copy()
        environment.update(
            {
                "JD_IMAGE_DATABASE_URL": TEST_DATABASE_URL,
                "JD_IMAGE_DATA_ROOT": str(data_root),
                "JD_IMAGE_MASTER_KEY": TEST_MASTER_KEY,
                "JD_IMAGE_DATABASE_CONNECT_TIMEOUT_SECONDS": "2",
                "JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS": "0.1",
                "JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS": "0.4",
            }
        )
        return environment

    def test_http_health_distinguishes_live_web_from_missing_worker(self) -> None:
        from codex_image.server.app import create_server_app

        with tempfile.TemporaryDirectory() as tmp:
            settings = self._settings(Path(tmp))
            with TestClient(create_server_app(settings)) as client:
                live = client.get("/health/live")
                ready = client.get("/health/ready")

        self.assertEqual(live.status_code, 200)
        self.assertEqual(live.json(), {"status": "ok", "component": "web"})
        self.assertEqual(ready.status_code, 503)
        self.assertEqual(ready.json()["status"], "not_ready")
        self.assertEqual(ready.json()["components"]["database"]["status"], "ready")
        self.assertEqual(
            ready.json()["components"]["database"]["schema_versions"],
            EXPECTED_SCHEMA_VERSIONS,
        )
        self.assertEqual(ready.json()["components"]["file_volume"]["status"], "ready")
        self.assertEqual(ready.json()["components"]["worker"]["status"], "unavailable")

    def test_independent_worker_makes_server_ready_and_stopping_it_degrades_readiness(self) -> None:
        from codex_image.server.app import create_server_app

        with tempfile.TemporaryDirectory() as tmp:
            data_root = Path(tmp)
            settings = self._settings(data_root)
            worker = subprocess.Popen(
                [sys.executable, "-m", "codex_image.server.worker"],
                env=self._worker_environment(data_root),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                with TestClient(create_server_app(settings)) as client:
                    ready = self._wait_for_status(client, "/health/ready", 200)
                    worker_instance_id = ready.json()["components"]["worker"]["instance_id"]

                    worker.kill()
                    worker.wait(timeout=5)
                    degraded = self._wait_for_status(client, "/health/ready", 503)
                    live = client.get("/health/live")
            finally:
                if worker.poll() is None:
                    worker.kill()
                    worker.wait(timeout=5)
                if worker.stderr is not None:
                    worker.stderr.close()

        self.assertTrue(worker_instance_id)
        self.assertEqual(degraded.json()["components"]["worker"]["status"], "unavailable")
        self.assertEqual(live.status_code, 200)

    def test_schema_migration_and_file_volume_identity_persist_across_web_restarts(self) -> None:
        from codex_image.server.app import create_server_app

        with tempfile.TemporaryDirectory() as tmp:
            settings = self._settings(Path(tmp))
            with TestClient(create_server_app(settings)) as first_client:
                first = first_client.get("/health/ready").json()["components"]
            time.sleep(0.05)
            with TestClient(create_server_app(settings)) as second_client:
                second = second_client.get("/health/ready").json()["components"]

        self.assertEqual(
            first["database"]["schema_versions"],
            EXPECTED_SCHEMA_VERSIONS,
        )
        self.assertEqual(first["database"]["schema_migrations"], second["database"]["schema_migrations"])
        self.assertEqual(first["database"]["database_id"], second["database"]["database_id"])
        self.assertEqual(first["file_volume"]["volume_id"], second["file_volume"]["volume_id"])

    def _wait_for_status(self, client: TestClient, path: str, status_code: int):
        deadline = time.monotonic() + 5
        response = client.get(path)
        while response.status_code != status_code and time.monotonic() < deadline:
            time.sleep(0.05)
            response = client.get(path)
        if response.status_code != status_code:
            self.fail(f"{path} did not return {status_code}: {response.status_code} {response.text}")
        return response


if __name__ == "__main__":
    unittest.main()

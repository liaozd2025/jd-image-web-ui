from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path


RUN_COMPOSE_SMOKE = os.environ.get("JD_IMAGE_RUN_COMPOSE_SMOKE") == "1"


@unittest.skipUnless(RUN_COMPOSE_SMOKE, "set JD_IMAGE_RUN_COMPOSE_SMOKE=1 to run Docker smoke test")
class ServerComposeSmokeTests(unittest.TestCase):
    project_root = Path(__file__).resolve().parents[1]

    @classmethod
    def setUpClass(cls) -> None:
        cls.project_name = f"jd-image-smoke-{os.getpid()}"
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.http_port = listener.getsockname()[1]
        cls.base_url = f"http://127.0.0.1:{cls.http_port}"
        cls.environment = os.environ.copy()
        cls.environment.update(
            {
                "JD_IMAGE_HTTP_PORT": str(cls.http_port),
                "JD_IMAGE_WORKER_HEARTBEAT_INTERVAL_SECONDS": "0.2",
                "JD_IMAGE_WORKER_HEARTBEAT_TTL_SECONDS": "0.8",
            }
        )
        cls._compose("up", "--build", "--detach")

    @classmethod
    def tearDownClass(cls) -> None:
        cls._compose("down", "--volumes", check=False)

    @classmethod
    def _compose(cls, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "docker",
                "compose",
                "--project-name",
                cls.project_name,
                "--file",
                "compose.server.yml",
                *arguments,
            ],
            cwd=cls.project_root,
            env=cls.environment,
            check=check,
            capture_output=True,
            text=True,
        )

    def test_proxy_stack_degrades_without_worker_and_persists_across_restart(self) -> None:
        first = self._wait_for_status("/health/ready", 200)
        first_components = first["components"]

        self._compose("stop", "worker")
        degraded = self._wait_for_status("/health/ready", 503)
        live = self._wait_for_status("/health/live", 200)

        self._compose("start", "worker")
        self._wait_for_status("/health/ready", 200)
        self._compose("restart", "web", "worker")
        restarted = self._wait_for_status("/health/ready", 200)
        restarted_components = restarted["components"]

        self.assertEqual(degraded["components"]["worker"]["status"], "unavailable")
        self.assertEqual(live, {"status": "ok", "component": "web"})
        self.assertEqual(
            first_components["database"]["schema_migrations"],
            restarted_components["database"]["schema_migrations"],
        )
        self.assertEqual(
            first_components["file_volume"]["volume_id"],
            restarted_components["file_volume"]["volume_id"],
        )

    def _wait_for_status(self, path: str, status_code: int) -> dict[str, object]:
        deadline = time.monotonic() + 90
        last_status = 0
        last_body = ""
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f"{self.base_url}{path}", timeout=2) as response:
                    last_status = response.status
                    last_body = response.read().decode("utf-8")
            except urllib.error.HTTPError as error:
                with error:
                    last_status = error.code
                    last_body = error.read().decode("utf-8")
            except OSError as error:
                last_status = 0
                last_body = str(error)
            if last_status == status_code:
                return json.loads(last_body)
            time.sleep(0.25)
        self.fail(f"{path} did not return {status_code}: {last_status} {last_body}")


if __name__ == "__main__":
    unittest.main()

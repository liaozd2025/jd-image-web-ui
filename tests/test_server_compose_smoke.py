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
                "JD_IMAGE_POSTGRES_PASSWORD": "jd_image_smoke_test",
                "JD_IMAGE_MASTER_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
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

        self._compose("stop", "postgres")
        database_down = self._wait_for_status("/health/ready", 503)
        database_down_live = self._wait_for_status("/health/live", 200)
        self._compose("start", "postgres")
        self._wait_for_status("/health/ready", 200)

        self._compose("exec", "--user", "root", "--no-TTY", "web", "chmod", "-R", "a-w", "/srv/jd-image-data")
        try:
            volume_unwritable = self._wait_for_status("/health/ready", 503)
        finally:
            self._compose("exec", "--user", "root", "--no-TTY", "web", "chmod", "-R", "u+w", "/srv/jd-image-data")
        self._wait_for_status("/health/ready", 200)

        self._compose("restart", "postgres", "web", "worker")
        restarted = self._wait_for_status("/health/ready", 200)
        restarted_components = restarted["components"]

        self.assertEqual(degraded["components"]["worker"]["status"], "unavailable")
        self.assertEqual(live, {"status": "ok", "component": "web"})
        self.assertEqual(database_down["components"]["database"]["status"], "unavailable")
        self.assertEqual(database_down["components"]["file_volume"]["status"], "ready")
        self.assertEqual(database_down_live, {"status": "ok", "component": "web"})
        self.assertEqual(volume_unwritable["components"]["file_volume"]["status"], "unavailable")
        self.assertEqual(
            first_components["database"]["schema_migrations"],
            restarted_components["database"]["schema_migrations"],
        )
        self.assertEqual(
            first_components["database"]["database_id"],
            restarted_components["database"]["database_id"],
        )
        self.assertEqual(
            first_components["file_volume"]["volume_id"],
            restarted_components["file_volume"]["volume_id"],
        )

    def test_shared_gallery_upgrades_legacy_database_and_file_volume_without_data_loss(self) -> None:
        self._wait_for_status("/health/ready", 200)
        legacy_png = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        write_file = self._compose(
            "exec",
            "--user",
            "root",
            "--no-TTY",
            "web",
            "python",
            "-c",
            (
                "from base64 import b64decode; from pathlib import Path; "
                "root=Path('/srv/jd-image-data/shared'); root.mkdir(parents=True, exist_ok=True); "
                f"content=b64decode('{legacy_png}'); "
                "[(root / name).write_bytes(content) for name in "
                "('compose-legacy.png', 'compose-legacy-user.png')]"
            ),
        )
        self.assertEqual(write_file.returncode, 0, write_file.stderr)

        self._compose("stop", "web", "worker")
        legacy_sql = """
            BEGIN;
            DROP TABLE server_shared_gallery_items;
            DROP TABLE server_shared_gallery_categories;
            DROP INDEX IF EXISTS server_shared_gallery_asset_name_unique_idx;
            DELETE FROM server_schema_migrations WHERE version = '0024_shared_gallery';
            INSERT INTO server_users (
                user_id, username, normalized_username, role, password_hash
            ) VALUES
                ('compose-legacy-admin', 'compose-legacy-admin', 'compose-legacy-admin', 'admin', 'unused'),
                ('compose-legacy-user', 'compose-legacy-user', 'compose-legacy-user', 'user', 'unused');
            INSERT INTO server_shared_assets (
                asset_id, publisher_user_id, asset_kind, name, current_version_id, is_active,
                created_at, updated_at
            ) VALUES (
                'compose-legacy-image', 'compose-legacy-admin', 'image', 'Docker 历史产品图',
                'compose-legacy-version', FALSE,
                '2024-01-02 03:04:05+00', '2024-02-03 04:05:06+00'
            );
            INSERT INTO server_shared_asset_versions (
                asset_version_id, asset_id, publisher_user_id, version_number,
                original_filename, mime_type, stored_relative_path, sha256, byte_size
            ) VALUES (
                'compose-legacy-version', 'compose-legacy-image', 'compose-legacy-admin', 1,
                'compose-legacy.png', 'image/png', 'shared/compose-legacy.png', 'legacy-sha', 68
            );
            INSERT INTO server_shared_assets (
                asset_id, publisher_user_id, asset_kind, name, current_version_id, is_active,
                created_at, updated_at
            ) VALUES (
                'compose-legacy-user-image', 'compose-legacy-user', 'image', 'Docker 用户历史产品图',
                'compose-legacy-user-version', TRUE,
                '2024-03-04 05:06:07+00', '2024-04-05 06:07:08+00'
            );
            INSERT INTO server_shared_asset_versions (
                asset_version_id, asset_id, publisher_user_id, version_number,
                original_filename, mime_type, stored_relative_path, sha256, byte_size
            ) VALUES (
                'compose-legacy-user-version', 'compose-legacy-user-image', 'compose-legacy-user', 1,
                'compose-legacy-user.png', 'image/png', 'shared/compose-legacy-user.png',
                'legacy-user-sha', 68
            );
            INSERT INTO provider_catalog_versions (
                provider_version_id, provider_key, version_number, display_name, base_url,
                api_mode, models, created_by_user_id
            ) VALUES (
                'compose-legacy-provider', 'compose-legacy-provider', 1, 'Compose legacy provider',
                'https://example.invalid', 'images', '["legacy-model"]'::jsonb,
                'compose-legacy-admin'
            );
            INSERT INTO server_generation_tasks (
                task_id, user_id, provider_version_id, model_id, prompt, status,
                shared_asset_versions, queue_position
            ) VALUES (
                'compose-legacy-task', 'compose-legacy-user', 'compose-legacy-provider',
                'legacy-model', 'legacy shared image reference', 'completed',
                '["compose-legacy-user-version"]'::jsonb, 1
            );
            COMMIT;
        """
        seeded = self._psql(legacy_sql)
        self.assertEqual(seeded.returncode, 0, seeded.stderr)

        self._compose("start", "web", "worker")
        ready = self._wait_for_status("/health/ready", 200)
        self.assertIn("0024_shared_gallery", ready["components"]["database"]["schema_versions"])

        migrated = self._psql(
            """
            SELECT CONCAT_WS('|',
                assets.asset_id,
                assets.publisher_user_id,
                assets.current_version_id,
                assets.is_active,
                TO_CHAR(assets.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                TO_CHAR(assets.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                items.category_id,
                versions.original_filename,
                versions.stored_relative_path
            )
            FROM server_shared_assets AS assets
            JOIN server_shared_gallery_items AS items USING (asset_id)
            JOIN server_shared_asset_versions AS versions
              ON versions.asset_version_id = assets.current_version_id
            WHERE assets.asset_id IN ('compose-legacy-image', 'compose-legacy-user-image')
            ORDER BY assets.asset_id;
            """,
            tuples_only=True,
        )
        self.assertEqual(migrated.returncode, 0, migrated.stderr)
        self.assertEqual(
            migrated.stdout.strip().splitlines(),
            [
                (
                    "compose-legacy-image|compose-legacy-admin|compose-legacy-version|f|"
                    "2024-01-02 03:04:05|2024-02-03 04:05:06|uncategorized|"
                    "compose-legacy.png|shared/compose-legacy.png"
                ),
                (
                    "compose-legacy-user-image|compose-legacy-user|compose-legacy-user-version|t|"
                    "2024-03-04 05:06:07|2024-04-05 06:07:08|uncategorized|"
                    "compose-legacy-user.png|shared/compose-legacy-user.png"
                ),
            ],
        )
        task_reference = self._psql(
            """
            SELECT shared_asset_versions::text
            FROM server_generation_tasks
            WHERE task_id = 'compose-legacy-task';
            """,
            tuples_only=True,
        )
        self.assertEqual(task_reference.returncode, 0, task_reference.stderr)
        self.assertEqual(
            task_reference.stdout.strip(),
            '["compose-legacy-user-version"]',
        )
        file_check = self._compose(
            "exec",
            "--no-TTY",
            "web",
            "python",
            "-c",
            (
                "from pathlib import Path; "
                "root=Path('/srv/jd-image-data/shared'); signature=b'\\x89PNG\\r\\n\\x1a\\n'; "
                "assert all((root / name).read_bytes()[:8] == signature for name in "
                "('compose-legacy.png', 'compose-legacy-user.png'))"
            ),
        )
        self.assertEqual(file_check.returncode, 0, file_check.stderr)

    @classmethod
    def _psql(
        cls,
        sql: str,
        *,
        tuples_only: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        arguments = [
            "exec",
            "--no-TTY",
            "postgres",
            "psql",
            "--username",
            "jd_image",
            "--dbname",
            "jd_image",
            "--set",
            "ON_ERROR_STOP=1",
        ]
        if tuples_only:
            arguments.extend(["--tuples-only", "--no-align"])
        arguments.extend(["--command", sql])
        return cls._compose(*arguments, check=False)

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
        logs = self._compose("logs", "--no-color", "web", "worker", check=False)
        self.fail(
            f"{path} did not return {status_code}: {last_status} {last_body}\n"
            f"compose logs:\n{logs.stdout}\n{logs.stderr}"
        )


if __name__ == "__main__":
    unittest.main()

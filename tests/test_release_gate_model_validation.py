from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ReleaseGateModelValidationTests(unittest.TestCase):
    def test_release_gate_rejects_an_unverified_department_default_model(self) -> None:
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
                )
                with ExitStack() as stack:
                    admin = stack.enter_context(TestClient(create_server_app(settings)))
                    signed_in = login(admin, "admin", temporary_password, user_agent="Release Gate Admin")
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=signed_in["csrf_token"],
                    )
                    csrf = changed["csrf_token"]
                    provider_response = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "release-gate-model",
                            "display_name": "Release Gate Model",
                            "base_url": "https://release-gate.example.invalid/v1",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "Default Unverified",
                                    "model_id": "release-gate-default",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(provider_response.status_code, 201, provider_response.text)
                    provider_id = provider_response.json()["provider"]["provider_version_id"]
                    credential_response = admin.put(
                        f"/api/admin/providers/department/{provider_id}",
                        json={"api_key": "release-gate-secret"},
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(credential_response.status_code, 200, credential_response.text)

                    rejected = self._run_gate(database_url)
                    self.assertEqual(rejected.returncode, 1, rejected.stdout + rejected.stderr)
                    self.assertIn(
                        "department default model is not verified: Release Gate Model / Default Unverified (unverified)",
                        rejected.stderr,
                    )
                    self.assertNotIn("release-gate-secret", rejected.stdout + rejected.stderr)

                    with psycopg.connect(database_url) as connection:
                        connection.execute(
                            """
                            UPDATE generation_models
                            SET validation_status = 'verified', validated_at = CURRENT_TIMESTAMP
                            WHERE provider_version_id = %s AND is_default = TRUE
                            """,
                            (provider_id,),
                        )
                    accepted = self._run_gate(database_url)
                    self.assertEqual(accepted.returncode, 0, accepted.stdout + accepted.stderr)
                    self.assertIn("static release gate passed", accepted.stdout)

    @staticmethod
    def _run_gate(database_url: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "release_gate.py"),
                "--static-only",
                "--database-url",
                database_url,
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )


if __name__ == "__main__":
    unittest.main()

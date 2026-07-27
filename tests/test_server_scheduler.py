from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_providers import provider_payload
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerSchedulerTests(unittest.TestCase):
    def test_department_provider_concurrency_limit_blocks_additional_claims(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.database import PostgresConnections
        from codex_image.server.department_providers import DepartmentProviderRepository
        from codex_image.server.provider_secrets import ProviderSecretCipher
        from codex_image.server.tasks import GenerationTaskRepository

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                )
                with TestClient(create_server_app(settings)) as admin:
                    logged_in = login(
                        admin,
                        "admin",
                        temporary_password,
                        user_agent="Provider concurrency test",
                    )
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=logged_in["csrf_token"],
                    )
                    csrf_token = changed["csrf_token"]
                    scheduler = admin.patch(
                        "/api/admin/scheduler",
                        json={"global_concurrency": 4, "per_user_concurrency": 4},
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(scheduler.status_code, 200, scheduler.text)

                    create_payload = provider_payload(
                        display_name="Concurrency Limited Provider",
                        models=["limited-image"],
                    )
                    create_payload["concurrency_limit"] = 1
                    created = admin.post(
                        "/api/admin/provider-catalog",
                        json=create_payload,
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    provider = created.json()["provider"]
                    provider_id = provider["provider_version_id"]
                    generation_model_id = provider["models"][0]["generation_model_id"]
                    credential = admin.put(
                        f"/api/admin/providers/department/{provider_id}",
                        json={"api_key": "provider-concurrency-test-key"},
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(credential.status_code, 200, credential.text)
                    with psycopg.connect(database_url) as connection:
                        connection.execute(
                            """
                            UPDATE generation_models
                            SET validation_status = 'verified',
                                validated_at = CURRENT_TIMESTAMP
                            WHERE generation_model_id = %s
                            """,
                            (generation_model_id,),
                        )

                    for index in range(2):
                        submitted = admin.post(
                            "/api/tasks",
                            json={
                                "provider_version_id": provider_id,
                                "generation_model_id": generation_model_id,
                                "model_id": "limited-image",
                                "prompt": f"provider concurrency task {index + 1}",
                                "provider_scope": "department",
                            },
                            headers={"X-CSRF-Token": csrf_token},
                        )
                        self.assertEqual(submitted.status_code, 201, submitted.text)

                    connections = PostgresConnections(
                        database_url,
                        connect_timeout_seconds=2,
                    )
                    cipher = ProviderSecretCipher.from_encoded_key(TEST_MASTER_KEY)
                    departments = DepartmentProviderRepository(connections, cipher)
                    tasks = GenerationTaskRepository(
                        connections,
                        cipher,
                        data_root,
                        departments=departments,
                    )
                    first_claim = tasks.claim_next_task()
                    self.assertIsNotNone(first_claim)
                    self.assertIsNone(tasks.claim_next_task())

    def test_admin_can_observe_and_update_scheduler_limits(self) -> None:
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
                    client = stack.enter_context(TestClient(create_server_app(settings)))
                    logged_in = login(client, "admin", temporary_password, user_agent="Scheduler test")
                    changed = change_password(
                        client,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=logged_in["csrf_token"],
                    )
                    csrf_token = changed["csrf_token"]

                    initial = client.get("/api/admin/scheduler")
                    self.assertEqual(initial.status_code, 200, initial.text)
                    initial_scheduler = initial.json()["scheduler"]
                    self.assertEqual(initial_scheduler["global_concurrency"], 1)
                    self.assertEqual(initial_scheduler["per_user_concurrency"], 1)
                    self.assertEqual(initial_scheduler["queue"]["queued"], 0)
                    self.assertEqual(initial_scheduler["queue"]["running"], 0)

                    updated = client.patch(
                        "/api/admin/scheduler",
                        json={"global_concurrency": 4, "per_user_concurrency": 2},
                        headers={"X-CSRF-Token": csrf_token},
                    )
                    self.assertEqual(updated.status_code, 200, updated.text)
                    updated_scheduler = updated.json()["scheduler"]
                    self.assertEqual(updated_scheduler["global_concurrency"], 4)
                    self.assertEqual(updated_scheduler["per_user_concurrency"], 2)
                    self.assertIn("blocked", updated_scheduler["queue"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import hashlib
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


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerModelCapabilityContractTests(unittest.TestCase):
    def test_legacy_provider_models_and_tasks_migrate_to_stable_model_records(self) -> None:
        from codex_image.server.database import PostgresConnections
        from codex_image.server.migrations import MigrationRunner

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            migration_root = Path("codex_image/server/migrations")
            legacy_migrations = [
                migration
                for migration in sorted(migration_root.glob("*.sql"))
                if migration.stem < "0025_generation_models"
            ]
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
                    INSERT INTO provider_catalog_versions (
                        provider_version_id, provider_key, version_number, display_name,
                        base_url, api_mode, models, created_by_user_id
                    ) VALUES (
                        'legacy-provider', 'legacy-provider', 1, 'Legacy Provider',
                        'https://legacy.example.invalid/v1', 'images',
                        '[{"model_id":"legacy-first","capabilities":["image_generation"]},
                          {"model_id":"legacy-second","capabilities":["image_generation"]}]'::jsonb,
                        'legacy-admin'
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO server_generation_tasks (
                        task_id, user_id, provider_version_id, model_id, prompt,
                        request_parameters, status, queue_position
                    ) VALUES (
                        'legacy-task', 'legacy-user', 'legacy-provider', 'legacy-second',
                        'legacy prompt', '{}'::jsonb, 'completed', 1
                    )
                    """
                )

            applied = MigrationRunner(
                PostgresConnections(database_url, connect_timeout_seconds=5)
            ).apply()
            self.assertIn("0025_generation_models", applied)
            with psycopg.connect(database_url) as connection:
                models = connection.execute(
                    """
                    SELECT display_name, model_id, capability_profile_id, is_default, is_enabled
                    FROM generation_models
                    WHERE provider_version_id = 'legacy-provider'
                    ORDER BY is_default DESC, model_id
                    """
                ).fetchall()
                task = connection.execute(
                    """
                    SELECT generation_model_id, model_display_name, capability_profile_id,
                           capability_profile_version, capability_snapshot
                    FROM server_generation_tasks
                    WHERE task_id = 'legacy-task'
                    """
                ).fetchone()
            self.assertEqual(
                models,
                [
                    ("legacy-first", "legacy-first", "generic-basic", True, True),
                    ("legacy-second", "legacy-second", "generic-basic", False, True),
                ],
            )
            self.assertIsNotNone(task[0])
            self.assertEqual(task[1:4], ("legacy-second", "generic-basic", 1))
            self.assertIsNone(task[4])

    def test_admin_can_publish_structured_models_from_versioned_builtin_profiles(self) -> None:
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

                with TestClient(create_server_app(settings)) as admin:
                    signed_in = login(
                        admin,
                        "admin",
                        temporary_password,
                        user_agent="Model Capability Admin",
                    )
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=signed_in["csrf_token"],
                    )
                    csrf = changed["csrf_token"]

                    profiles = admin.get("/api/model-capability-profiles")
                    self.assertEqual(profiles.status_code, 200, profiles.text)
                    self.assertEqual(
                        [item["profile_id"] for item in profiles.json()["profiles"]],
                        ["generic-basic", "seedream-5-lite", "seedream-5-pro"],
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][1]["summary"],
                        "连续组图 · 最高 4K",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][1]["protocol_adapter"],
                        "volcengine-ark-images",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][2]["summary"],
                        "精准编辑 · 最高 2K",
                    )

                    created = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "seedream-contract",
                            "display_name": "Seedream Contract",
                            "base_url": "https://ark.example.invalid/api/v3",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "Seedream 5.0 Lite",
                                    "model_id": "doubao-seedream-5-0-lite-test",
                                    "capability_profile_id": "seedream-5-lite",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                                {
                                    "display_name": "Seedream 5.0 Pro",
                                    "model_id": "doubao-seedream-5-0-pro-test",
                                    "capability_profile_id": "seedream-5-pro",
                                    "is_default": False,
                                    "is_enabled": True,
                                },
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    provider = created.json()["provider"]
                    self.assertEqual(provider["default_generation_model_id"], provider["models"][0]["generation_model_id"])
                    self.assertEqual(provider["models"][0]["capability_profile_version"], 1)
                    self.assertEqual(provider["models"][0]["validation_status"], "unverified")
                    self.assertEqual(provider["models"][1]["display_name"], "Seedream 5.0 Pro")

                    listed = admin.get("/api/admin/provider-catalog")
                    self.assertEqual(listed.status_code, 200, listed.text)
                    listed_provider = next(
                        item for item in listed.json()["providers"]
                        if item["provider_version_id"] == provider["provider_version_id"]
                    )
                    self.assertEqual(listed_provider["models"], provider["models"])

                    multiple_defaults = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "invalid-defaults",
                            "display_name": "Invalid Defaults",
                            "base_url": "https://invalid.example.invalid/v1",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "First",
                                    "model_id": "first",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                                {
                                    "display_name": "Second",
                                    "model_id": "second",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(multiple_defaults.status_code, 422, multiple_defaults.text)

                    missing_default = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "missing-default",
                            "display_name": "Missing Default",
                            "base_url": "https://missing.example.invalid/v1",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "Only",
                                    "model_id": "only",
                                    "capability_profile_id": "generic-basic",
                                    "is_enabled": True,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(missing_default.status_code, 422, missing_default.text)

    def test_legacy_model_payload_is_expanded_to_the_generic_profile(self) -> None:
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
                with TestClient(create_server_app(settings)) as admin:
                    signed_in = login(admin, "admin", temporary_password, user_agent="Legacy Model Admin")
                    changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=signed_in["csrf_token"],
                    )
                    created = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "legacy-model",
                            "display_name": "Legacy Model",
                            "base_url": "https://legacy.example.invalid/v1",
                            "api_mode": "responses",
                            "models": [
                                {
                                    "model_id": "legacy-image-1",
                                    "capabilities": ["image_generation", "image_input", "text_input"],
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": changed["csrf_token"]},
                    )
                    self.assertEqual(created.status_code, 201, created.text)
                    model = created.json()["provider"]["models"][0]
                    self.assertEqual(model["display_name"], "legacy-image-1")
                    self.assertEqual(model["capability_profile_id"], "generic-basic")
                    self.assertEqual(model["capability_profile_version"], 1)
                    self.assertTrue(model["is_default"])
                    self.assertTrue(model["is_enabled"])
                    self.assertNotIn("capabilities", model)


if __name__ == "__main__":
    unittest.main()

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


class ModelCapabilityProfileTests(unittest.TestCase):
    def test_official_seedream_lite_alias_uses_seedream_profile_and_valid_size(self) -> None:
        from codex_image.server.model_capabilities import get_model_capability_profile
        from codex_image.server.providers import ProviderRepository
        from codex_image.server.tasks import TaskConfigurationError, _validated_task_parameters

        normalized = ProviderRepository._normalize_model_bindings(
            [
                {
                    "display_name": "Seedream 5.0 Lite",
                    "model_id": "doubao-seedream-5-0-260128",
                    "capability_profile_id": "generic-basic",
                    "is_default": True,
                    "is_enabled": True,
                }
            ],
            api_mode="images",
        )

        self.assertEqual(normalized[0]["capability_profile_id"], "seedream-5-lite")
        self.assertEqual(normalized[0]["model_family_id"], "seedream-image")
        profile = get_model_capability_profile("seedream-5-lite")
        self.assertNotIn("1024x1024", profile["sizes"])
        self.assertEqual(profile["default_size"], "2048x2048")
        self.assertEqual(profile["size_constraints"]["min_pixels"], 3_686_400)
        with self.assertRaisesRegex(
            TaskConfigurationError,
            "does not support this output size",
        ):
            _validated_task_parameters(
                {
                    "mode": "generate",
                    "size": "1024x1024",
                    "output_format": "png",
                    "n": 1,
                },
                profile,
                reference_image_count=0,
            )
        accepted = _validated_task_parameters(
            {
                "mode": "generate",
                "size": "2048x2048",
                "output_format": "png",
                "n": 1,
            },
            profile,
            reference_image_count=0,
        )
        self.assertEqual(accepted["size"], "2048x2048")

    def test_seedream_lite_catalog_exposes_its_compound_size_constraints(self) -> None:
        from codex_image.server.workspace_api import _legacy_catalog_model_payload

        catalog_model = _legacy_catalog_model_payload(
            {
                "display_name": "Seedream 5.0 Lite",
                "model_id": "doubao-seedream-5-0-260128",
                "canonical_model_id": "doubao-seedream-5-0-260128",
                "capability_profile_id": "seedream-5-lite",
                "capability_profile_version": 1,
                "model_family_id": "seedream-image",
            }
        )
        size = next(
            item
            for item in catalog_model["parameters"]
            if item["id"] == "canvas.size"
        )

        self.assertEqual(size["default"], "2048x2048")
        self.assertEqual(size["size_constraints"]["min_pixels"], 3_686_400)


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerModelCapabilityContractTests(unittest.TestCase):
    def test_seedream_lite_migration_replaces_stale_1k_user_preference(self) -> None:
        from codex_image.server.database import PostgresConnections
        from codex_image.server.migrations import MigrationRunner

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            connections = PostgresConnections(database_url, connect_timeout_seconds=5)
            runner = MigrationRunner(connections)
            runner.apply()
            with psycopg.connect(database_url) as connection:
                connection.execute(
                    """
                    INSERT INTO server_users (
                        user_id, username, normalized_username, role, password_hash
                    ) VALUES ('seedream-user', 'seedream-user', 'seedream-user', 'admin', 'unused')
                    """
                )
                connection.execute(
                    """
                    INSERT INTO provider_catalog_versions (
                        provider_version_id, provider_key, version_number, display_name,
                        base_url, api_mode, models, created_by_user_id
                    ) VALUES (
                        'seedream-provider', 'seedream-provider', 1, '火山方舟',
                        'https://ark.example.invalid/api/v3', 'images', '[]'::jsonb,
                        'seedream-user'
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO generation_models (
                        generation_model_id, provider_version_id, display_name, model_id,
                        capability_profile_id, capability_profile_version, model_family_id,
                        canonical_model_id, protocol_profile, parameter_codec,
                        supported_operations, append_aspect_ratio_prompt
                    ) VALUES (
                        'seedream-lite-binding', 'seedream-provider', 'Seedream 5.0 Lite',
                        'doubao-seedream-5-0-260128', 'seedream-5-lite', 1,
                        'seedream-image', 'doubao-seedream-5-0-260128', 'openai_images',
                        'gpt_openai_images', '["generate","edit"]'::jsonb, FALSE
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO generation_model_parameter_preferences (
                        user_id, generation_model_id, parameters
                    ) VALUES (
                        'seedream-user', 'seedream-lite-binding',
                        '{"size":"1024x1024","n":3,"output_format":"png"}'::jsonb
                    )
                    """
                )
                connection.execute(
                    """
                    DELETE FROM server_schema_migrations
                    WHERE version = '0033_seedream_5_lite_size_preferences'
                    """
                )

            applied = runner.apply()
            with psycopg.connect(database_url) as connection:
                parameters = connection.execute(
                    """
                    SELECT parameters
                    FROM generation_model_parameter_preferences
                    WHERE user_id = 'seedream-user'
                      AND generation_model_id = 'seedream-lite-binding'
                    """
                ).fetchone()[0]

            self.assertIn("0033_seedream_5_lite_size_preferences", applied)
            self.assertEqual(parameters["size"], "2048x2048")
            self.assertEqual(parameters["resolution"], "2k")
            self.assertEqual(parameters["n"], 3)

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
                          {"model_id":"legacy-second","capabilities":["image_generation"]},
                          {"model_id":"doubao-seedream-5-0-260128","capabilities":["image_generation"]},
                          {"model_id":"doubao-seedream-5-0-pro-260628","capabilities":["image_generation"]}]'::jsonb,
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
            self.assertIn("0029_configured_department_models", applied)
            self.assertIn("0030_upstream_v070_provider_bindings", applied)
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
                           capability_profile_version, capability_snapshot, generation_snapshot
                    FROM server_generation_tasks
                    WHERE task_id = 'legacy-task'
                    """
                ).fetchone()
            self.assertEqual(
                models,
                [
                    ("legacy-first", "legacy-first", "generic-basic", True, True),
                    (
                        "doubao-seedream-5-0-260128",
                        "doubao-seedream-5-0-260128",
                        "seedream-5-lite",
                        False,
                        True,
                    ),
                    (
                        "doubao-seedream-5-0-pro-260628",
                        "doubao-seedream-5-0-pro-260628",
                        "seedream-5-pro",
                        False,
                        True,
                    ),
                    ("legacy-second", "legacy-second", "generic-basic", False, True),
                ],
            )
            self.assertIsNotNone(task[0])
            self.assertEqual(task[1:4], ("legacy-second", "generic-basic", 1))
            self.assertIsNone(task[4])
            self.assertEqual(task[5]["remote_model_id"], "legacy-second")
            self.assertEqual(task[5]["protocol_profile"], "openai_images")

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
                        [
                            "generic-basic",
                            "gpt-image-2",
                            "seedream-5-lite",
                            "seedream-5-pro",
                            "nano-banana-pro",
                            "nano-banana-2",
                            "nano-banana-2-lite",
                        ],
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][2]["summary"],
                        "连续组图 · 最高 4K",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][2]["summary_key"],
                        "generationModel.summarySeedreamLite",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][2]["protocol_adapter"],
                        "volcengine-ark-images",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][3]["summary"],
                        "精准编辑 · 最高 2K",
                    )
                    self.assertEqual(
                        profiles.json()["profiles"][4]["output_formats"],
                        ["png"],
                    )

                    incompatible_mode = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "invalid-seedream-responses",
                            "display_name": "Invalid Seedream Responses",
                            "base_url": "https://invalid.example.invalid/v1",
                            "api_mode": "responses",
                            "models": [
                                {
                                    "display_name": "Seedream Invalid",
                                    "model_id": "seedream-invalid-responses",
                                    "capability_profile_id": "seedream-5-lite",
                                    "is_default": True,
                                    "is_enabled": True,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(incompatible_mode.status_code, 422, incompatible_mode.text)
                    self.assertIn("does not support provider API mode", incompatible_mode.text)

                    inferred_lite = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "seedream-lite-alias",
                            "display_name": "Seedream Lite Alias",
                            "base_url": "https://ark.example.invalid/api/v3",
                            "api_mode": "images",
                            "models": [
                                {
                                    "display_name": "Seedream 5.0 Lite",
                                    "model_id": "doubao-seedream-5-0-260128",
                                    "capability_profile_id": "generic-basic",
                                    "is_default": True,
                                    "is_enabled": True,
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(inferred_lite.status_code, 201, inferred_lite.text)
                    inferred_model = inferred_lite.json()["provider"]["models"][0]
                    self.assertEqual(
                        inferred_model["capability_profile_id"],
                        "seedream-5-lite",
                    )
                    self.assertEqual(inferred_model["model_family_id"], "seedream-image")

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
                    self.assertEqual(provider["models"][0]["model_family_id"], "seedream-image")
                    self.assertEqual(
                        provider["models"][0]["canonical_model_id"],
                        "doubao-seedream-5-0-lite-test",
                    )
                    self.assertEqual(provider["models"][0]["protocol_profile"], "openai_images")
                    self.assertEqual(provider["models"][0]["parameter_codec"], "gpt_openai_images")
                    self.assertEqual(
                        provider["models"][0]["supported_operations"],
                        ["generate", "edit"],
                    )
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

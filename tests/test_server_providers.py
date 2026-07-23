from __future__ import annotations

from contextlib import ExitStack
from io import StringIO
import logging
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import (
    OTHER_TEST_MASTER_KEY,
    TEST_MASTER_KEY,
    temporary_postgres_database,
)
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "provider-user-password"
FIRST_API_KEY = "provider-test-personal-secret-1234"
REPLACEMENT_API_KEY = "provider-test-replacement-secret-5678"


def provider_payload(*, display_name: str, models: list[str]) -> dict[str, object]:
    return {
        "provider_key": "fake-openai",
        "display_name": display_name,
        "base_url": "https://fake-provider.invalid/v1",
        "api_mode": "responses",
        "models": [
            {
                "model_id": model,
                "capabilities": ["image_generation", "image_input"],
            }
            for model in models
        ],
        "parameter_constraints": {"max_output_images": 4},
    }


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerProviderConfigurationTests(unittest.TestCase):
    def test_versioned_catalog_and_encrypted_personal_credentials(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.provider_secrets import ProviderSecretCipher

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                _, admin_temporary_password = bootstrap_admin(database_url, data_root)
                settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                    session_cookie_secure=False,
                )
                log_output = StringIO()
                log_handler = logging.StreamHandler(log_output)
                logging.getLogger().addHandler(log_handler)
                try:
                    with ExitStack() as stack:
                        admin = stack.enter_context(TestClient(create_server_app(settings)))
                        user = stack.enter_context(TestClient(create_server_app(settings)))

                        admin_login = login(
                            admin,
                            "admin",
                            admin_temporary_password,
                            user_agent="Admin Browser",
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
                            json={"username": "provider-user"},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        user_id = created_user.json()["user"]["user_id"]
                        user_temporary_password = created_user.json()["temporary_password"]
                        user_login = login(
                            user,
                            "provider-user",
                            user_temporary_password,
                            user_agent="Provider Browser",
                        )
                        user_changed = change_password(
                            user,
                            current_password=user_temporary_password,
                            new_password=USER_PASSWORD,
                            csrf_token=user_login["csrf_token"],
                        )
                        user_csrf = user_changed["csrf_token"]

                        forbidden_catalog_write = user.post(
                            "/api/admin/provider-catalog",
                            json=provider_payload(display_name="Forbidden", models=["image-1"]),
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(forbidden_catalog_write.status_code, 403)

                        first_version = admin.post(
                            "/api/admin/provider-catalog",
                            json=provider_payload(display_name="Fake OpenAI", models=["image-1"]),
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(first_version.status_code, 201)
                        first_version_id = first_version.json()["provider"]["provider_version_id"]
                        self.assertEqual(first_version.json()["provider"]["version_number"], 1)

                        disabled = admin.patch(
                            f"/api/admin/provider-catalog/{first_version_id}/status",
                            json={"is_active": False},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(disabled.status_code, 200)
                        disabled_binding = user.put(
                            f"/api/providers/personal/{first_version_id}",
                            json={"api_key": FIRST_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(disabled_binding.status_code, 409)
                        unlisted_binding = user.put(
                            "/api/providers/personal/not-a-provider-version",
                            json={"api_key": FIRST_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(unlisted_binding.status_code, 404)

                        duplicate_provider = admin.post(
                            "/api/admin/provider-catalog",
                            json=provider_payload(
                                display_name="Fake OpenAI v2",
                                models=["image-1", "image-2"],
                            ),
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(duplicate_provider.status_code, 409)
                        second_payload = provider_payload(
                            display_name="Second Fake OpenAI",
                            models=["image-1", "image-2"],
                        )
                        second_payload["provider_key"] = "second-fake-openai"
                        second_version = admin.post(
                            "/api/admin/provider-catalog",
                            json=second_payload,
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(second_version.status_code, 201)
                        second_version_id = second_version.json()["provider"]["provider_version_id"]
                        self.assertEqual(second_version.json()["provider"]["version_number"], 1)

                        visible_catalog = user.get("/api/providers/catalog")
                        self.assertEqual(visible_catalog.status_code, 200)
                        self.assertEqual(
                            [item["provider_version_id"] for item in visible_catalog.json()["providers"]],
                            [second_version_id],
                        )

                        oversized_key = "oversized-provider-secret-" + ("x" * 4096)
                        rejected_oversized = user.put(
                            f"/api/providers/personal/{second_version_id}",
                            json={"api_key": oversized_key},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(rejected_oversized.status_code, 422)
                        self.assertNotIn(oversized_key, rejected_oversized.text)

                        nested_secret = "nested-provider-secret-1234"
                        rejected_nested = user.put(
                            f"/api/providers/personal/{second_version_id}",
                            json={"api_key": {"secret": nested_secret}},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(rejected_nested.status_code, 422)
                        self.assertNotIn(nested_secret, rejected_nested.text)

                        saved = user.put(
                            f"/api/providers/personal/{second_version_id}",
                            json={"api_key": FIRST_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        replaced = user.put(
                            f"/api/providers/personal/{second_version_id}",
                            json={"api_key": REPLACEMENT_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(saved.status_code, 200)
                        self.assertEqual(replaced.status_code, 200)
                        self.assertTrue(replaced.json()["credential"]["has_credential"])
                        self.assertTrue(replaced.json()["credential"]["api_key_mask"].endswith("5678"))

                        personal = user.get("/api/providers/personal")
                        admin_catalog = admin.get("/api/admin/provider-catalog")
                        admin_users = admin.get("/api/admin/users")
                        static_responses = "\n".join(
                            response.text
                            for response in [
                                first_version,
                                second_version,
                                saved,
                                replaced,
                                personal,
                                admin_catalog,
                                admin_users,
                            ]
                        )

                        with psycopg.connect(database_url) as connection:
                            encrypted_key, key_mask = connection.execute(
                                """
                                SELECT encrypted_api_key, api_key_mask
                                FROM personal_provider_credentials
                                WHERE user_id = %s AND provider_version_id = %s
                                """,
                                (user_id, second_version_id),
                            ).fetchone()
                            catalog_rows = connection.execute(
                                """
                                SELECT version_number, display_name, models
                                FROM provider_catalog_versions
                                WHERE provider_key = 'fake-openai'
                                ORDER BY version_number
                                """
                            ).fetchall()

                        cipher = ProviderSecretCipher.from_encoded_key(TEST_MASTER_KEY)
                        decrypted = cipher.decrypt_personal_api_key(
                            user_id=user_id,
                            provider_version_id=second_version_id,
                            encrypted_value=encrypted_key,
                        )
                        self.assertEqual(decrypted, REPLACEMENT_API_KEY)
                        self.assertNotEqual(decrypted, FIRST_API_KEY)
                        self.assertNotIn(FIRST_API_KEY, encrypted_key + key_mask)
                        self.assertNotIn(REPLACEMENT_API_KEY, encrypted_key + key_mask)
                        self.assertEqual(catalog_rows[0][1], "Fake OpenAI")
                        self.assertEqual(catalog_rows[0][2][0]["model_id"], "image-1")

                        disabled_second = admin.patch(
                            f"/api/admin/provider-catalog/{second_version_id}/status",
                            json={"is_active": False},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(disabled_second.status_code, 200)
                        deleted = user.delete(
                            f"/api/providers/personal/{second_version_id}",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(deleted.status_code, 200)
                        self.assertFalse(deleted.json()["credential"]["has_credential"])
                        rejected_replace = user.put(
                            f"/api/providers/personal/{second_version_id}",
                            json={"api_key": FIRST_API_KEY},
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(rejected_replace.status_code, 409)
                finally:
                    logging.getLogger().removeHandler(log_handler)

        leaked = any(
            secret in static_responses or secret in log_output.getvalue()
            for secret in {FIRST_API_KEY, REPLACEMENT_API_KEY}
        )
        self.assertFalse(leaked, "an API key appeared in an HTTP response or application log")

    def test_wrong_master_key_refuses_to_open_an_existing_server_database(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.provider_secrets import MasterKeyMismatch

        with temporary_postgres_database(TEST_DATABASE_URL) as database_url:
            with tempfile.TemporaryDirectory() as tmp:
                data_root = Path(tmp) / "data"
                first_settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=TEST_MASTER_KEY,
                )
                with TestClient(create_server_app(first_settings)):
                    pass

                wrong_settings = ServerSettings(
                    database_url=database_url,
                    data_root=data_root,
                    master_key=OTHER_TEST_MASTER_KEY,
                )
                with self.assertRaises(MasterKeyMismatch):
                    with TestClient(create_server_app(wrong_settings)):
                        pass


if __name__ == "__main__":
    unittest.main()

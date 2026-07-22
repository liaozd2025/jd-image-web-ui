from __future__ import annotations

from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "personal-model-user-password"
PERSONAL_KEY = "personal-model-secret-1234"


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerPersonalGenerationModelTests(unittest.TestCase):
    def test_personal_models_are_structured_owner_isolated_and_referenced_models_cannot_be_deleted(self) -> None:
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
                    alice = stack.enter_context(TestClient(create_server_app(settings)))
                    bob = stack.enter_context(TestClient(create_server_app(settings)))
                    admin_login = login(admin, "admin", temporary_password, user_agent="Personal Models Admin")
                    admin_changed = change_password(
                        admin,
                        current_password=temporary_password,
                        new_password=ADMIN_PASSWORD,
                        csrf_token=admin_login["csrf_token"],
                    )
                    admin_csrf = admin_changed["csrf_token"]
                    provider = admin.post(
                        "/api/admin/provider-catalog",
                        json={
                            "provider_key": "personal-models",
                            "display_name": "Personal Models",
                            "base_url": "https://personal.example.invalid/v1",
                            "api_mode": "images",
                            "models": [
                                {
                                    "model_id": "catalog-model",
                                    "capabilities": ["image_generation"],
                                }
                            ],
                        },
                        headers={"X-CSRF-Token": admin_csrf},
                    ).json()["provider"]
                    provider_id = provider["provider_version_id"]

                    sessions: list[tuple[TestClient, str]] = []
                    for username, client in (("alice-models", alice), ("bob-models", bob)):
                        created = admin.post(
                            "/api/admin/users",
                            json={"username": username},
                            headers={"X-CSRF-Token": admin_csrf},
                        ).json()
                        signed_in = login(
                            client,
                            username,
                            created["temporary_password"],
                            user_agent=f"{username} Browser",
                        )
                        changed = change_password(
                            client,
                            current_password=created["temporary_password"],
                            new_password=USER_PASSWORD,
                            csrf_token=signed_in["csrf_token"],
                        )
                        csrf = changed["csrf_token"]
                        saved = client.put(
                            f"/api/providers/personal/{provider_id}",
                            json={"api_key": PERSONAL_KEY},
                            headers={"X-CSRF-Token": csrf},
                        )
                        self.assertEqual(saved.status_code, 200, saved.text)
                        sessions.append((client, csrf))
                    alice_csrf = sessions[0][1]
                    bob_csrf = sessions[1][1]

                    initial_alice = alice.get(f"/api/providers/personal/{provider_id}/models")
                    initial_bob = bob.get(f"/api/providers/personal/{provider_id}/models")
                    self.assertEqual(initial_alice.status_code, 200, initial_alice.text)
                    self.assertEqual(initial_bob.status_code, 200, initial_bob.text)
                    self.assertNotEqual(
                        initial_alice.json()["models"][0]["generation_model_id"],
                        initial_bob.json()["models"][0]["generation_model_id"],
                    )
                    alice_models = alice.put(
                        f"/api/providers/personal/{provider_id}/models",
                        json={
                            "models": [
                                {
                                    "display_name": "Alice Lite",
                                    "model_id": "alice-arbitrary-lite",
                                    "capability_profile_id": "seedream-5-lite",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                                {
                                    "display_name": "Alice Pro",
                                    "model_id": "alice-arbitrary-pro",
                                    "capability_profile_id": "seedream-5-pro",
                                    "is_default": False,
                                    "is_enabled": True,
                                },
                            ]
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(alice_models.status_code, 200, alice_models.text)
                    stored = alice_models.json()["models"]
                    self.assertEqual([model["display_name"] for model in stored], ["Alice Lite", "Alice Pro"])
                    self.assertTrue(all(model["validation_status"] == "not_required" for model in stored))
                    self.assertNotIn(PERSONAL_KEY, alice_models.text)

                    still_bob = bob.get(f"/api/providers/personal/{provider_id}/models").json()["models"]
                    self.assertEqual([model["model_id"] for model in still_bob], ["catalog-model"])
                    alice_pro_id = next(
                        model["generation_model_id"]
                        for model in stored
                        if model["model_id"] == "alice-arbitrary-pro"
                    )
                    bob_cannot_delete = bob.delete(
                        f"/api/providers/personal/{provider_id}/models/{alice_pro_id}",
                        headers={"X-CSRF-Token": bob_csrf},
                    )
                    self.assertEqual(bob_cannot_delete.status_code, 404, bob_cannot_delete.text)

                    preference = alice.put(
                        "/api/generation-model-preferences",
                        json={
                            "provider_scope": "personal",
                            "provider_version_id": provider_id,
                            "generation_model_id": alice_pro_id,
                            "parameters": {
                                "size": "2048x2048",
                                "resolution": "2k",
                                "ratio": "1:1",
                                "orientation": "square",
                                "output_format": "jpeg",
                                "prompt_optimization_mode": "fast",
                                "seed_mode": "fixed",
                                "seed": 42,
                            },
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(preference.status_code, 200, preference.text)
                    api_settings = alice.get("/api/api-settings")
                    self.assertEqual(api_settings.status_code, 200, api_settings.text)
                    personal_provider = next(
                        item
                        for item in api_settings.json()["settings"]["providers"]
                        if item["id"] == f"personal-{provider_id}"
                    )
                    self.assertEqual(personal_provider["selected_generation_model_id"], alice_pro_id)
                    self.assertEqual(personal_provider["model_selection_reason"], "saved")

                    workspace_task = alice.post(
                        "/api/generate",
                        data={
                            "api_provider_id": f"personal-{provider_id}",
                            "generation_model_id": alice_pro_id,
                            "capability_profile_version": "1",
                            "model": "stale-client-model-id-is-ignored",
                            "prompt": "stable model selection",
                            "size": "2048x2048",
                            "output_format": "jpeg",
                            "n": "4",
                            "prompt_optimization_mode": "fast",
                            "seed_mode": "fixed",
                            "seed": "42",
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(workspace_task.status_code, 201, workspace_task.text)
                    workspace_payload = workspace_task.json()["task"]
                    self.assertEqual(workspace_payload["generation_model_id"], alice_pro_id)
                    self.assertEqual(workspace_payload["model_id"], "alice-arbitrary-pro")
                    self.assertEqual(workspace_payload["request_parameters"]["seed"], 42)
                    self.assertEqual(workspace_payload["request_parameters"]["prompt_optimization_mode"], "fast")
                    self.assertIs(workspace_payload["request_parameters"]["watermark"], False)
                    self.assertEqual(workspace_payload["quota_units"], 4)

                    unsupported_format = alice.post(
                        "/api/generate",
                        data={
                            "api_provider_id": f"personal-{provider_id}",
                            "generation_model_id": alice_pro_id,
                            "prompt": "reject before provider",
                            "size": "2048x2048",
                            "output_format": "webp",
                            "n": "1",
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(unsupported_format.status_code, 409, unsupported_format.text)
                    self.assertIn("output format", unsupported_format.json()["detail"])

                    submitted = alice.post(
                        "/api/tasks",
                        json={
                            "provider_version_id": provider_id,
                            "provider_scope": "personal",
                            "model_id": "alice-arbitrary-pro",
                            "prompt": "personal model reference",
                            "size": "2048x2048",
                            "output_format": "png",
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(submitted.status_code, 201, submitted.text)
                    self.assertEqual(submitted.json()["task"]["generation_model_id"], alice_pro_id)

                    referenced_delete = alice.delete(
                        f"/api/providers/personal/{provider_id}/models/{alice_pro_id}",
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(referenced_delete.status_code, 409, referenced_delete.text)
                    self.assertIn("can only be disabled", referenced_delete.json()["detail"])

                    disabled_saved_model = alice.put(
                        f"/api/providers/personal/{provider_id}/models",
                        json={
                            "models": [
                                {
                                    "display_name": "Alice Lite",
                                    "model_id": "alice-arbitrary-lite",
                                    "capability_profile_id": "seedream-5-lite",
                                    "is_default": True,
                                    "is_enabled": True,
                                },
                                {
                                    "display_name": "Alice Pro",
                                    "model_id": "alice-arbitrary-pro",
                                    "capability_profile_id": "seedream-5-pro",
                                    "is_default": False,
                                    "is_enabled": False,
                                },
                            ]
                        },
                        headers={"X-CSRF-Token": alice_csrf},
                    )
                    self.assertEqual(disabled_saved_model.status_code, 200, disabled_saved_model.text)
                    fallback_settings = alice.get("/api/api-settings")
                    self.assertEqual(fallback_settings.status_code, 200, fallback_settings.text)
                    fallback_provider = next(
                        item
                        for item in fallback_settings.json()["settings"]["providers"]
                        if item["id"] == f"personal-{provider_id}"
                    )
                    alice_lite_id = next(
                        model["generation_model_id"]
                        for model in disabled_saved_model.json()["models"]
                        if model["model_id"] == "alice-arbitrary-lite"
                    )
                    self.assertEqual(fallback_provider["selected_generation_model_id"], alice_lite_id)
                    self.assertEqual(fallback_provider["model_selection_reason"], "saved_unavailable_default")


if __name__ == "__main__":
    unittest.main()

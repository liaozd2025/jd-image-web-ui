from __future__ import annotations

import base64
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest

from fastapi.testclient import TestClient
import psycopg

from tests.server_test_database import TEST_MASTER_KEY, temporary_postgres_database
from tests.test_server_auth import bootstrap_admin
from tests.test_server_user_lifecycle import ADMIN_PASSWORD, change_password, login


TEST_DATABASE_URL = os.environ.get("JD_IMAGE_TEST_DATABASE_URL", "")
USER_PASSWORD = "model-validation-user-password"
DEPARTMENT_KEY = "model-validation-secret-1234"
FAKE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class ValidationProviderHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, object]] = []
    fail_models: set[str] = set()

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length))
        type(self).requests.append(
            {
                "authorization": self.headers.get("Authorization"),
                "path": self.path,
                "body": body,
            }
        )
        if body.get("model") in type(self).fail_models:
            payload = json.dumps({"error": {"message": "validation failed safely"}}).encode()
            self.send_response(502)
        else:
            payload = json.dumps(
                {"data": [{"b64_json": base64.b64encode(FAKE_PNG).decode("ascii")}]}
            ).encode()
            self.send_response(200)
        self.send_header("Content-Type", "application/json")
        if body.get("model") not in type(self).fail_models:
            self.send_header("X-Request-Id", "validation-provider-request-123")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_: object) -> None:
        return


@unittest.skipUnless(TEST_DATABASE_URL, "set JD_IMAGE_TEST_DATABASE_URL to a real PostgreSQL database")
class ServerGenerationModelValidationTests(unittest.TestCase):
    def test_department_model_is_usable_while_async_validation_remains_diagnostic(self) -> None:
        from codex_image.server.app import create_server_app
        from codex_image.server.config import ServerSettings
        from codex_image.server.worker import HeartbeatWorker

        ValidationProviderHandler.requests = []
        ValidationProviderHandler.fail_models = set()
        fake_server = ThreadingHTTPServer(("127.0.0.1", 0), ValidationProviderHandler)
        thread = threading.Thread(target=fake_server.serve_forever, daemon=True)
        thread.start()
        try:
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
                        user = stack.enter_context(TestClient(create_server_app(settings)))
                        admin_login = login(
                            admin,
                            "admin",
                            temporary_password,
                            user_agent="Model Validation Admin",
                        )
                        admin_changed = change_password(
                            admin,
                            current_password=temporary_password,
                            new_password=ADMIN_PASSWORD,
                            csrf_token=admin_login["csrf_token"],
                        )
                        admin_csrf = admin_changed["csrf_token"]
                        created_user = admin.post(
                            "/api/admin/users",
                            json={"username": "validation-user"},
                            headers={"X-CSRF-Token": admin_csrf},
                        ).json()
                        user_login = login(
                            user,
                            "validation-user",
                            created_user["temporary_password"],
                            user_agent="Model Validation User",
                        )
                        user_changed = change_password(
                            user,
                            current_password=created_user["temporary_password"],
                            new_password=USER_PASSWORD,
                            csrf_token=user_login["csrf_token"],
                        )
                        user_csrf = user_changed["csrf_token"]

                        created = admin.post(
                            "/api/admin/provider-catalog",
                            json={
                                "provider_key": "validation-provider",
                                "display_name": "Validation Provider",
                                "base_url": f"http://127.0.0.1:{fake_server.server_port}/v1",
                                "api_mode": "images",
                                "models": [
                                    {
                                        "display_name": "Validation Lite",
                                        "model_id": "validation-lite",
                                        "capability_profile_id": "seedream-5-lite",
                                        "is_default": True,
                                        "is_enabled": True,
                                    },
                                    {
                                        "display_name": "Validation Generic",
                                        "model_id": "validation-generic",
                                        "capability_profile_id": "generic-basic",
                                        "is_default": False,
                                        "is_enabled": True,
                                    },
                                ]
                            },
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(created.status_code, 201, created.text)
                        provider = created.json()["provider"]
                        provider_id = provider["provider_version_id"]
                        credential = admin.put(
                            f"/api/admin/providers/department/{provider_id}",
                            json={"api_key": DEPARTMENT_KEY},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(credential.status_code, 200, credential.text)
                        model_id = provider["models"][0]["generation_model_id"]
                        generic_model_id = next(
                            model["generation_model_id"]
                            for model in provider["models"]
                            if model["model_id"] == "validation-generic"
                        )
                        self.assertEqual(provider["models"][0]["validation_status"], "unverified")

                        before_models = self._department_models(user, provider_id)
                        self.assertEqual(
                            [model["model_id"] for model in before_models],
                            ["validation-lite", "validation-generic"],
                        )
                        preference = user.put(
                            "/api/generation-model-preferences",
                            json={
                                "provider_scope": "department",
                                "provider_version_id": provider_id,
                                "generation_model_id": model_id,
                                "parameters": {},
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(preference.status_code, 200, preference.text)
                        accepted_before_validation = user.post(
                            "/api/tasks",
                            json={
                                "provider_version_id": provider_id,
                                "provider_scope": "department",
                                "model_id": "validation-lite",
                                "prompt": "configured team model is immediately available",
                            },
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(
                            accepted_before_validation.status_code,
                            201,
                            accepted_before_validation.text,
                        )
                        denied = user.post(
                            f"/api/admin/generation-models/{model_id}/validate",
                            headers={"X-CSRF-Token": user_csrf},
                        )
                        self.assertEqual(denied.status_code, 403, denied.text)

                        queued = admin.post(
                            f"/api/admin/generation-models/{model_id}/validate",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(queued.status_code, 202, queued.text)
                        self.assertEqual(queued.json()["validation"]["status"], "queued")
                        self.assertEqual(
                            queued.json()["validation"]["request_parameters"],
                            {
                                "size": "1024x1024",
                                "n": 1,
                                "output_format": "png",
                                "prompt_optimization_mode": "off",
                                "watermark": False,
                            },
                        )

                        worker = HeartbeatWorker(settings)
                        self.assertTrue(worker._process_one_validation())
                        verified = admin.get(
                            f"/api/admin/generation-models/{model_id}/validation"
                        )
                        self.assertEqual(verified.status_code, 200, verified.text)
                        self.assertEqual(verified.json()["validation"]["status"], "verified")
                        self.assertEqual(
                            verified.json()["validation"]["provider_request_id"],
                            "validation-provider-request-123",
                        )
                        self.assertEqual(
                            [model["model_id"] for model in self._department_models(user, provider_id)],
                            ["validation-lite", "validation-generic"],
                        )
                        self.assertEqual(len(ValidationProviderHandler.requests), 1)
                        request = ValidationProviderHandler.requests[0]
                        self.assertEqual(request["path"], "/v1/images/generations")
                        self.assertEqual(request["body"]["model"], "validation-lite")
                        self.assertEqual(request["body"]["size"], "1024x1024")
                        self.assertEqual(request["body"]["response_format"], "b64_json")
                        self.assertNotIn("n", request["body"])
                        self.assertIs(request["body"]["watermark"], False)
                        self.assertNotIn(DEPARTMENT_KEY, queued.text + verified.text)

                        generic_queued = admin.post(
                            f"/api/admin/generation-models/{generic_model_id}/validate",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(generic_queued.status_code, 202, generic_queued.text)
                        self.assertTrue(worker._process_one_validation())
                        generic_verified = admin.get(
                            f"/api/admin/generation-models/{generic_model_id}/validation"
                        )
                        self.assertEqual(generic_verified.status_code, 200, generic_verified.text)
                        generic_request = ValidationProviderHandler.requests[-1]["body"]
                        self.assertEqual(generic_request["model"], "validation-generic")
                        self.assertEqual(generic_request["n"], 1)
                        self.assertNotIn("watermark", generic_request)
                        self.assertNotIn("optimize_prompt_options", generic_request)

                        with psycopg.connect(database_url) as connection:
                            counts = connection.execute(
                                """
                                SELECT
                                    (SELECT COUNT(*) FROM server_generation_tasks),
                                    (SELECT COUNT(*) FROM server_assets),
                                    (SELECT COUNT(*) FROM server_shared_assets)
                                """
                            ).fetchone()
                        self.assertEqual(counts, (1, 0, 0))
                        self.assertFalse(any("validation" in path.name for path in data_root.rglob("*")))

                        changed_key = admin.put(
                            f"/api/admin/providers/department/{provider_id}",
                            json={"api_key": "replacement-validation-secret-5678"},
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(changed_key.status_code, 200, changed_key.text)
                        self.assertEqual(
                            [model["model_id"] for model in self._department_models(user, provider_id)],
                            ["validation-lite", "validation-generic"],
                        )

                        ValidationProviderHandler.fail_models = {"validation-lite"}
                        requeued = admin.post(
                            f"/api/admin/generation-models/{model_id}/validate",
                            headers={"X-CSRF-Token": admin_csrf},
                        )
                        self.assertEqual(requeued.status_code, 202, requeued.text)
                        self.assertTrue(worker._process_one_validation())
                        failed = admin.get(
                            f"/api/admin/generation-models/{model_id}/validation"
                        )
                        self.assertEqual(failed.status_code, 200, failed.text)
                        self.assertEqual(failed.json()["validation"]["status"], "failed")
                        self.assertIn("validation failed safely", failed.json()["validation"]["error_message"])
                        self.assertNotIn("replacement-validation-secret-5678", failed.text)

                        with psycopg.connect(database_url) as connection:
                            actions = {
                                row[0]
                                for row in connection.execute(
                                    """
                                    SELECT action FROM server_audit_events
                                    WHERE action LIKE 'model.validation_%'
                                    """
                                ).fetchall()
                            }
                        self.assertTrue(
                            {
                                "model.validation_queued",
                                "model.validation_verified",
                                "model.validation_failed",
                                "model.validation_invalidated",
                            }.issubset(actions)
                        )
        finally:
            fake_server.shutdown()
            fake_server.server_close()

    @staticmethod
    def _department_models(client: TestClient, provider_id: str) -> list[dict[str, object]]:
        settings = client.get("/api/api-settings")
        if settings.status_code != 200:
            raise AssertionError(settings.text)
        provider = next(
            item
            for item in settings.json()["settings"]["providers"]
            if item["id"] == f"department-{provider_id}"
        )
        return provider["models"]


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

from datetime import UTC, datetime
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from codex_image.server.identity import AuthenticatedSession, UserAccount
from codex_image.server.providers import PersonalProviderCredential, ProviderVersion
from codex_image.server.workspace_api import (
    _generation_catalog_payload,
    install_workspace_routes,
)


class _Providers:
    def __init__(self) -> None:
        self.provider = ProviderVersion(
            provider_version_id="provider-1",
            provider_key="gemini",
            version_number=1,
            display_name="Gemini Team",
            base_url="https://sensitive-provider.example/v1beta",
            api_mode="images",
            models=[],
            parameter_constraints={},
            is_active=True,
            created_at=datetime.now(UTC),
        )
        self.credential = PersonalProviderCredential(
            provider_version_id="provider-1",
            provider_key="gemini",
            version_number=1,
            display_name="Gemini Team",
            api_key_mask="••••cret",
            has_credential=True,
            is_active=True,
            provider_is_active=True,
            updated_at=datetime.now(UTC),
        )

    def list_catalog(self, *, active_only: bool):
        self.assert_active_only = active_only
        return [self.provider]

    def list_personal_credentials(self, user_id: str):
        return [self.credential] if user_id == "user-1" else []

    def list_generation_models(self, *, provider_version_id: str, owner_user_id: str | None):
        if provider_version_id != "provider-1" or owner_user_id != "user-1":
            return []
        return [
            {
                "generation_model_id": "generation-model-1",
                "display_name": "Gemini 3.1 Flash Image",
                "model_id": "gemini-3.1-flash-image",
                "model_family_id": "gemini-image",
                "canonical_model_id": "nano-banana-2",
                "protocol_profile": "gemini_generate_content",
                "parameter_codec": "gemini_generate_content_image",
                "supported_operations": ["generate", "edit"],
                "append_aspect_ratio_prompt": False,
                "is_default": True,
                "is_enabled": True,
            },
            {
                "generation_model_id": "legacy-model",
                "display_name": "Legacy model",
                "model_id": "legacy-model",
                "model_family_id": "legacy",
                "canonical_model_id": "legacy-model",
                "protocol_profile": "unknown_protocol",
                "parameter_codec": "unknown_codec",
                "supported_operations": ["generate"],
                "append_aspect_ratio_prompt": False,
                "is_default": False,
                "is_enabled": True,
            },
        ]


class _Departments:
    def list_credentials(self, *, active_only: bool):
        return []


class ServerGenerationCatalogTests(unittest.TestCase):
    @staticmethod
    def _session() -> AuthenticatedSession:
        return AuthenticatedSession(
            user=UserAccount("user-1", "alice", "user", False, True),
            session_id="session-1",
            user_agent="test",
            csrf_token_hash="hash",
        )

    def test_catalog_contains_only_visible_bindings_and_no_secrets(self) -> None:
        payload = _generation_catalog_payload(
            self._session(),
            _Providers(),  # type: ignore[arg-type]
            _Departments(),  # type: ignore[arg-type]
        )

        self.assertEqual([item["id"] for item in payload["models"]], ["nano-banana-2"])
        self.assertEqual(payload["providers"][0]["provider_scope"], "personal")
        self.assertEqual(len(payload["providers"][0]["bindings"]), 1)
        self.assertTrue(payload["providers"][0]["bindings"][0]["available"])
        serialized = str(payload)
        self.assertNotIn("sensitive-provider.example", serialized)
        self.assertNotIn("cret", serialized)
        self.assertNotIn("api_key", serialized)

    def test_catalog_route_disables_response_caching(self) -> None:
        app = FastAPI()
        session = self._session()

        @app.middleware("http")
        async def authenticate(request: Request, call_next):
            request.state.auth_session = session
            return await call_next(request)

        install_workspace_routes(
            app,
            providers=_Providers(),  # type: ignore[arg-type]
            departments=_Departments(),  # type: ignore[arg-type]
            assets=object(),  # type: ignore[arg-type]
            shared_assets=object(),  # type: ignore[arg-type]
            tasks=object(),  # type: ignore[arg-type]
        )

        response = TestClient(app).get("/api/generation-catalog")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from codex_image.server.auth import require_admin
from codex_image.server.providers import ProviderVersion
from codex_image.server.providers_api import install_provider_routes
from codex_image.server.workspace_api import _api_settings


DISPLAYED_API_KEY = "department-provider-visible-edit-secret-1234"


class _ProviderRepositoryStub:
    def __init__(self) -> None:
        self.catalog = [
            SimpleNamespace(
                provider_version_id="provider-version-1",
                provider_key="manual-provider",
                version_number=1,
                display_name="Manual Provider",
                base_url="https://manual-provider.invalid/v1",
                api_mode="images",
                models=[],
                is_active=True,
            )
        ]

    def list_catalog(self, *, active_only: bool) -> list[SimpleNamespace]:
        return self.catalog

    def list_personal_credentials(self, user_id: str) -> list[object]:
        return []

    def list_generation_models(
        self,
        *,
        provider_version_id: str,
        owner_user_id: str | None,
    ) -> list[dict[str, object]]:
        return []

    def list_model_preferences(self, user_id: str) -> dict[str, object]:
        return {"selections": []}


class _DepartmentRepositoryStub:
    def __init__(self) -> None:
        self.reveal_calls: list[str] = []
        self.credential = SimpleNamespace(
            provider_version_id="provider-version-1",
            has_credential=True,
            is_active=True,
            api_key_mask="••••1234",
        )

    def list_credentials(self, *, active_only: bool) -> list[SimpleNamespace]:
        return [self.credential]

    def reveal_api_key(self, *, provider_version_id: str) -> str:
        self.reveal_calls.append(provider_version_id)
        return DISPLAYED_API_KEY


class _CatalogCreateRepositoryStub:
    def __init__(self) -> None:
        self.created_models: list[dict[str, object]] = []
        self.created_concurrency_limit = 0

    def create_provider_version(
        self,
        actor_user_id: str,
        *,
        provider_key: str,
        display_name: str,
        base_url: str,
        api_mode: str,
        models: list[dict[str, object]],
        parameter_constraints: dict[str, object],
        concurrency_limit: int,
    ) -> ProviderVersion:
        self.created_models = models
        self.created_concurrency_limit = concurrency_limit
        return ProviderVersion(
            provider_version_id="provider-version-created",
            provider_key=provider_key,
            version_number=1,
            display_name=display_name,
            base_url=base_url,
            api_mode=api_mode,  # type: ignore[arg-type]
            models=models,
            parameter_constraints=parameter_constraints,
            is_active=True,
            created_at=datetime(2026, 7, 27, tzinfo=timezone.utc),
        )


class SupplierCatalogApiContractTests(unittest.TestCase):
    def test_single_enabled_model_is_saved_as_the_default_model(self) -> None:
        providers = _CatalogCreateRepositoryStub()
        app = FastAPI()
        install_provider_routes(app, providers=providers)  # type: ignore[arg-type]
        app.dependency_overrides[require_admin] = lambda: SimpleNamespace(
            user=SimpleNamespace(user_id="admin-user", role="admin")
        )

        response = TestClient(app).post(
            "/api/admin/provider-catalog",
            json={
                "provider_key": "provider-1785141423172",
                "display_name": "新供应商",
                "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                "api_mode": "images",
                "models": [
                    {
                        "generation_model_id": "provider-1785141423172-gpt-image-2",
                        "display_name": "Doubao Seedream",
                        "model_id": "doubao-seedream-5-0-pro-260628",
                        "capability_profile_id": "doubao-seedream",
                        "model_family_id": "seedream-image",
                        "canonical_model_id": "doubao-seedream",
                        "protocol_profile": "openai_images",
                        "parameter_codec": "gpt_openai_images",
                        "supported_operations": ["generate", "edit"],
                        "is_default": False,
                        "is_enabled": True,
                    }
                ],
                "parameter_constraints": {},
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue(providers.created_models[0]["is_default"])
        self.assertEqual(providers.created_concurrency_limit, 1)

    def test_admin_api_settings_reveals_department_key_for_editing(self) -> None:
        providers = _ProviderRepositoryStub()
        departments = _DepartmentRepositoryStub()
        session = SimpleNamespace(
            user=SimpleNamespace(user_id="admin-user", role="admin")
        )

        settings = _api_settings(session, providers, departments)

        self.assertEqual(
            settings["providers"][0]["api_key"],
            DISPLAYED_API_KEY,
        )
        self.assertEqual(departments.reveal_calls, ["provider-version-1"])

    def test_ordinary_user_api_settings_never_reveals_department_key(self) -> None:
        providers = _ProviderRepositoryStub()
        departments = _DepartmentRepositoryStub()
        session = SimpleNamespace(
            user=SimpleNamespace(user_id="ordinary-user", role="user")
        )

        settings = _api_settings(session, providers, departments)

        department_provider = next(
            item
            for item in settings["providers"]
            if item["provider_scope"] == "department"
        )
        self.assertNotIn("api_key", department_provider)
        self.assertEqual(departments.reveal_calls, [])


if __name__ == "__main__":
    unittest.main()

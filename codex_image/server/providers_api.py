from __future__ import annotations

from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .auth import require_admin
from .identity import AuthenticatedSession
from .providers import (
    PersonalCredentialNotFound,
    PersonalProviderCredential,
    ProviderApiMode,
    ProviderRepository,
    ProviderVersion,
    ProviderVersionInactive,
    ProviderVersionNotFound,
)
from .model_capabilities import PROFILE_VERSION, model_capability_profile_exists


ModelCapability = Literal["image_generation", "image_input", "text_input"]
ConstraintValue = int | float | str | bool


class ProviderModelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=160)
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    capability_profile_id: str | None = Field(default=None, min_length=1, max_length=80)
    is_default: bool | None = None
    is_enabled: bool = True
    capabilities: list[ModelCapability] | None = Field(default=None, min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_profile(self) -> "ProviderModelPayload":
        profile_id = self.capability_profile_id or "generic-basic"
        if not model_capability_profile_exists(profile_id):
            raise ValueError("capability_profile_id is not a built-in profile")
        self.capability_profile_id = profile_id
        self.display_name = (self.display_name or self.model_id).strip()
        return self

    def canonical_payload(self) -> dict[str, object]:
        return {
            "display_name": self.display_name or self.model_id,
            "model_id": self.model_id,
            "capability_profile_id": self.capability_profile_id or "generic-basic",
            "capability_profile_version": PROFILE_VERSION,
            "is_default": bool(self.is_default),
            "is_enabled": self.is_enabled,
            "validation_status": "unverified",
        }


class ProviderVersionPayload(BaseModel):
    provider_key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,63}$")
    display_name: str = Field(min_length=1, max_length=160)
    base_url: str = Field(min_length=1, max_length=2048)
    api_mode: ProviderApiMode
    models: list[ProviderModelPayload] = Field(min_length=1, max_length=100)
    parameter_constraints: dict[str, ConstraintValue] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_models(self) -> "ProviderVersionPayload":
        if len({model.model_id for model in self.models}) != len(self.models):
            raise ValueError("model_id must be unique within a provider version")
        explicit_defaults = [model for model in self.models if model.is_default is True]
        if not explicit_defaults:
            if all(model.capabilities is not None for model in self.models):
                # Expand-only compatibility for old callers. Structured callers
                # must make the default an explicit, reviewable decision.
                self.models[0].is_default = True
                explicit_defaults = [self.models[0]]
            else:
                raise ValueError("exactly one default model is required")
        if len(explicit_defaults) != 1:
            raise ValueError("exactly one default model is required")
        if not explicit_defaults[0].is_enabled:
            raise ValueError("the default model must be enabled")
        return self

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = value.strip()
        parsed = urlsplit(normalized)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("base_url must be an HTTP(S) origin/path without credentials or query")
        return normalized.rstrip("/")


class ProviderStatusPayload(BaseModel):
    is_active: bool


def install_provider_routes(app: FastAPI, *, providers: ProviderRepository) -> None:
    @app.get("/api/admin/provider-catalog", response_model=None)
    def admin_catalog(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(
            content={
                "providers": [
                    _provider_payload(provider)
                    for provider in providers.list_catalog(active_only=False)
                ]
            }
        )

    @app.post("/api/admin/provider-catalog", response_model=None, status_code=201)
    def create_provider_version(
        payload: ProviderVersionPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        provider = providers.create_provider_version(
            admin_session.user.user_id,
            provider_key=payload.provider_key,
            display_name=payload.display_name,
            base_url=payload.base_url,
            api_mode=payload.api_mode,
            models=[model.canonical_payload() for model in payload.models],
            parameter_constraints=payload.parameter_constraints,
        )
        return JSONResponse(status_code=201, content={"provider": _provider_payload(provider)})

    @app.patch("/api/admin/provider-catalog/{provider_version_id}/status", response_model=None)
    def set_provider_status(
        provider_version_id: str,
        payload: ProviderStatusPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            provider = providers.set_provider_active(
                admin_session.user.user_id,
                provider_version_id=provider_version_id,
                is_active=payload.is_active,
            )
        except ProviderVersionNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"provider": _provider_payload(provider)})

    @app.get("/api/providers/catalog", response_model=None)
    def active_catalog() -> JSONResponse:
        return JSONResponse(
            content={
                "providers": [
                    _provider_payload(provider)
                    for provider in providers.list_catalog(active_only=True)
                ]
            }
        )

    @app.get("/api/providers/personal", response_model=None)
    def personal_credentials(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(
            content={
                "credentials": [
                    _credential_payload(credential)
                    for credential in providers.list_personal_credentials(session.user.user_id)
                ]
            }
        )

    @app.put("/api/providers/personal/{provider_version_id}", response_model=None)
    async def save_personal_credential(request: Request, provider_version_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if session.user.role == "admin":
            return JSONResponse(status_code=403, content={"detail": "administrators_use_department_credentials"})
        try:
            body = await request.json()
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "api_key_invalid"})
        api_key = body.get("api_key") if isinstance(body, dict) else None
        if not isinstance(api_key, str) or not api_key or len(api_key) > 4096:
            return JSONResponse(status_code=422, content={"detail": "api_key_invalid"})
        try:
            credential = providers.save_personal_credential(
                session.user.user_id,
                provider_version_id=provider_version_id,
                api_key=api_key,
            )
        except ProviderVersionNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ProviderVersionInactive as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"credential": _credential_payload(credential)})

    @app.delete("/api/providers/personal/{provider_version_id}", response_model=None)
    def delete_personal_credential(request: Request, provider_version_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if session.user.role == "admin":
            return JSONResponse(status_code=403, content={"detail": "administrators_use_department_credentials"})
        try:
            credential = providers.delete_personal_credential(
                session.user.user_id,
                provider_version_id=provider_version_id,
            )
        except PersonalCredentialNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"credential": _credential_payload(credential)})


def _provider_payload(provider: ProviderVersion) -> dict[str, object]:
    default_model = next((model for model in provider.models if model.get("is_default")), None)
    return {
        "provider_version_id": provider.provider_version_id,
        "provider_key": provider.provider_key,
        "version_number": provider.version_number,
        "display_name": provider.display_name,
        "base_url": provider.base_url,
        "api_mode": provider.api_mode,
        "models": provider.models,
        "default_generation_model_id": default_model.get("generation_model_id") if default_model else None,
        "parameter_constraints": provider.parameter_constraints,
        "is_active": provider.is_active,
        "created_at": provider.created_at.isoformat(),
    }


def _credential_payload(credential: PersonalProviderCredential) -> dict[str, object]:
    return {
        "provider_version_id": credential.provider_version_id,
        "provider_key": credential.provider_key,
        "version_number": credential.version_number,
        "display_name": credential.display_name,
        "api_key_mask": credential.api_key_mask,
        "has_credential": credential.has_credential,
        "is_active": credential.is_active,
        "provider_is_active": credential.provider_is_active,
        "updated_at": credential.updated_at.isoformat(),
    }

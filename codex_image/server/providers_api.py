from __future__ import annotations

from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

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


ModelCapability = Literal["image_generation", "image_input", "text_input"]
ConstraintValue = int | float | str | bool


class ProviderModelPayload(BaseModel):
    model_id: str = Field(min_length=1, max_length=160)
    capabilities: list[ModelCapability] = Field(min_length=1, max_length=8)


class ProviderVersionPayload(BaseModel):
    provider_key: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,63}$")
    display_name: str = Field(min_length=1, max_length=160)
    base_url: str = Field(min_length=1, max_length=2048)
    api_mode: ProviderApiMode
    models: list[ProviderModelPayload] = Field(min_length=1, max_length=100)
    parameter_constraints: dict[str, ConstraintValue] = Field(default_factory=dict)

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


class PersonalCredentialPayload(BaseModel):
    # Length is checked in the route so Pydantic's validation response never
    # echoes a submitted secret back to the browser.
    api_key: str


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
            models=[model.model_dump() for model in payload.models],
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
    def save_personal_credential(
        request: Request,
        provider_version_id: str,
        payload: PersonalCredentialPayload,
    ) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if not payload.api_key or len(payload.api_key) > 4096:
            return JSONResponse(status_code=422, content={"detail": "api_key_invalid"})
        try:
            credential = providers.save_personal_credential(
                session.user.user_id,
                provider_version_id=provider_version_id,
                api_key=payload.api_key,
            )
        except ProviderVersionNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ProviderVersionInactive as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"credential": _credential_payload(credential)})

    @app.delete("/api/providers/personal/{provider_version_id}", response_model=None)
    def delete_personal_credential(request: Request, provider_version_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            credential = providers.delete_personal_credential(
                session.user.user_id,
                provider_version_id=provider_version_id,
            )
        except PersonalCredentialNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"credential": _credential_payload(credential)})


def _provider_payload(provider: ProviderVersion) -> dict[str, object]:
    return {
        "provider_version_id": provider.provider_version_id,
        "provider_key": provider.provider_key,
        "version_number": provider.version_number,
        "display_name": provider.display_name,
        "base_url": provider.base_url,
        "api_mode": provider.api_mode,
        "models": provider.models,
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

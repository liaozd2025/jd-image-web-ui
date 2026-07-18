from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import require_admin
from .department_providers import (
    DepartmentCredentialNotFound,
    DepartmentProviderRepository,
    DepartmentQuotaExceeded,
)
from .identity import AuthenticatedSession
from .providers import ProviderVersionInactive, ProviderVersionNotFound


class DepartmentApiKeyPayload(BaseModel):
    api_key: str = Field(min_length=1, max_length=4096)


class DepartmentQuotaPayload(BaseModel):
    quota_units: int = Field(ge=0, le=10_000_000)


def install_department_provider_routes(app: FastAPI, *, departments: DepartmentProviderRepository) -> None:
    @app.get("/api/providers/department", response_model=None)
    def list_department_providers(request: Request) -> JSONResponse:
        request.state.auth_session
        return JSONResponse(content={"providers": [_credential_payload(item) for item in departments.list_credentials(active_only=True)]})

    @app.get("/api/admin/providers/department", response_model=None)
    def admin_department_providers(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(content={"providers": [_credential_payload(item) for item in departments.list_credentials()]})

    @app.put("/api/admin/providers/department/{provider_version_id}", response_model=None)
    def save_department_provider(
        provider_version_id: str,
        payload: DepartmentApiKeyPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            credential = departments.save_credential(
                admin_session.user.user_id,
                provider_version_id=provider_version_id,
                api_key=payload.api_key,
            )
        except ProviderVersionNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ProviderVersionInactive as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"provider": _credential_payload(credential)})

    @app.patch("/api/admin/providers/department/{provider_version_id}/status", response_model=None)
    def set_department_provider_status(
        provider_version_id: str,
        payload: dict[str, bool],
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            credential = departments.set_active(
                admin_session.user.user_id,
                provider_version_id=provider_version_id,
                is_active=bool(payload.get("is_active")),
            )
        except DepartmentCredentialNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"provider": _credential_payload(credential)})

    @app.get("/api/quotas/department", response_model=None)
    def department_quota(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"quota": _quota_payload(departments.quota(session.user.user_id))})

    @app.patch("/api/admin/quotas/department", response_model=None)
    def set_department_quota(
        payload: DepartmentQuotaPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            quota = departments.set_global_quota(admin_session.user.user_id, payload.quota_units)
        except DepartmentQuotaExceeded as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(content={"quota": _quota_payload(quota)})

    @app.patch("/api/admin/quotas/department/users/{user_id}", response_model=None)
    def set_user_department_quota(
        user_id: str,
        payload: DepartmentQuotaPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            quota = departments.set_user_quota(admin_session.user.user_id, user_id, payload.quota_units)
        except DepartmentQuotaExceeded as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"quota": _quota_payload(quota)})


def _credential_payload(credential) -> dict[str, object]:
    return {
        "provider_version_id": credential.provider_version_id,
        "provider_key": credential.provider_key,
        "version_number": credential.version_number,
        "display_name": credential.display_name,
        "api_key_mask": credential.api_key_mask,
        "has_credential": credential.has_credential,
        "is_active": credential.is_active,
        "provider_is_active": credential.provider_is_active,
        "updated_at": credential.updated_at,
    }


def _quota_payload(quota) -> dict[str, object]:
    return {
        "period_start": quota.period_start,
        "period_end": quota.period_end,
        "global_quota_units": quota.global_quota_units,
        "user_quota_units": quota.user_quota_units,
        "reserved_units": quota.reserved_units,
        "consumed_units": quota.consumed_units,
        "available_units": quota.available_units,
    }

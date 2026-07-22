from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from .auth import require_admin
from .identity import AuthenticatedSession
from .model_validation import (
    ModelValidationNotFound,
    ModelValidationRepository,
    ModelValidationUnavailable,
)


def install_model_validation_routes(
    app: FastAPI,
    *,
    validations: ModelValidationRepository,
) -> None:
    @app.post(
        "/api/admin/generation-models/{generation_model_id}/validate",
        response_model=None,
        status_code=202,
    )
    def queue_validation(
        generation_model_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            validation = validations.queue(
                admin_session.user.user_id,
                generation_model_id=generation_model_id,
            )
        except ModelValidationNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ModelValidationUnavailable as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(status_code=202, content={"validation": validation})

    @app.get(
        "/api/admin/generation-models/{generation_model_id}/validation",
        response_model=None,
    )
    def validation_status(
        generation_model_id: str,
        _: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            validation = validations.latest(generation_model_id=generation_model_id)
        except ModelValidationNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        return JSONResponse(content={"validation": validation})

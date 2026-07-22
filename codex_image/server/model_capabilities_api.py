from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .model_capabilities import list_model_capability_profiles


def install_model_capability_routes(app: FastAPI) -> None:
    @app.get("/api/model-capability-profiles", response_model=None)
    def model_capability_profiles() -> JSONResponse:
        return JSONResponse(content={"profiles": list_model_capability_profiles()})

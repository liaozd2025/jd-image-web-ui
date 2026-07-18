from __future__ import annotations

from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import ServerSettings
from .identity import (
    AuthenticatedSession,
    BrowserSession,
    IdentityRepository,
    ManagedUser,
    ManagedUserNotFound,
    ManagedUserOperationRejected,
    SessionCredentials,
    UserAccount,
    UserAlreadyExists,
)
from .security import (
    CredentialValidationError,
    hash_password,
    new_temporary_password,
)


SESSION_COOKIE = "jd_image_session"
CSRF_COOKIE = "jd_image_csrf"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
PUBLIC_PATHS = {"/health/live", "/health/ready", "/login", "/api/auth/login"}
PASSWORD_CHANGE_PATHS = {"/api/auth/me", "/api/auth/password", "/api/auth/logout"}


class LoginPayload(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChangePayload(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=1, max_length=1024)


class CreateUserPayload(BaseModel):
    username: str = Field(min_length=1, max_length=64)


class UserStatusPayload(BaseModel):
    is_active: bool


def install_authentication(
    app: FastAPI,
    *,
    settings: ServerSettings,
    identity: IdentityRepository,
) -> None:
    static_root = Path(__file__).with_name("static")
    app.mount("/auth-static", StaticFiles(directory=static_root), name="auth-static")

    @app.middleware("http")
    async def authenticate_request(request: Request, call_next):
        path = request.url.path
        if path in PUBLIC_PATHS or path.startswith("/auth-static/"):
            return await call_next(request)

        token = request.cookies.get(SESSION_COOKIE, "")
        session = identity.resolve_session(token)
        if session is None:
            return _unauthenticated_response(path)
        request.state.auth_session = session

        if session.user.must_change_password and path not in PASSWORD_CHANGE_PATHS:
            if path.startswith("/api/") or path.startswith("/files/"):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "password_change_required"},
                )
            return RedirectResponse("/login?change=1", status_code=303)

        if request.method not in SAFE_METHODS:
            if not identity.csrf_is_valid(
                session,
                cookie_token=request.cookies.get(CSRF_COOKIE, ""),
                header_token=request.headers.get("X-CSRF-Token", ""),
            ):
                return JSONResponse(status_code=403, content={"detail": "csrf_validation_failed"})
        return await call_next(request)

    @app.middleware("http")
    async def add_browser_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if (
            request.url.path == "/login"
            or request.url.path.startswith("/api/auth/")
            or request.url.path.startswith("/api/admin/")
            or request.url.path.startswith("/api/providers/")
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/login", response_model=None)
    def login_page(request: Request) -> Response:
        session = identity.resolve_session(request.cookies.get(SESSION_COOKIE, ""))
        if session is not None:
            if session.user.must_change_password:
                if request.query_params.get("change") != "1":
                    return RedirectResponse("/login?change=1", status_code=303)
            else:
                return RedirectResponse("/", status_code=303)
        return FileResponse(static_root / "login.html", headers={"Cache-Control": "no-store"})

    @app.post("/api/auth/login", response_model=None)
    def login(request: Request, payload: LoginPayload) -> JSONResponse:
        if not _request_has_same_origin(request):
            return JSONResponse(status_code=403, content={"detail": "cross_site_request_rejected"})
        login_result = identity.login(
            payload.username,
            payload.password,
            ttl_seconds=settings.session_ttl_seconds,
            failure_limit=settings.login_failure_limit,
            lock_seconds=settings.login_lock_seconds,
            user_agent=_request_user_agent(request),
        )
        if login_result is None:
            return JSONResponse(status_code=401, content={"detail": "invalid_credentials"})
        user, credentials = login_result
        return _authenticated_response(user, credentials, settings=settings)

    @app.get("/api/auth/me", response_model=None)
    def current_user(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(content={"user": _user_payload(session.user)})

    @app.post("/api/auth/password", response_model=None)
    def change_password(request: Request, payload: PasswordChangePayload) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        try:
            user = identity.change_password(
                session.user.user_id,
                current_password=payload.current_password,
                new_password=payload.new_password,
            )
        except CredentialValidationError as error:
            return JSONResponse(status_code=400, content={"detail": str(error)})
        if user is None:
            return JSONResponse(status_code=400, content={"detail": "password_change_failed"})
        credentials = identity.create_session(
            user,
            ttl_seconds=settings.session_ttl_seconds,
            user_agent=session.user_agent,
        )
        return _authenticated_response(user, credentials, settings=settings)

    @app.post("/api/auth/logout", response_model=None)
    def logout(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        identity.revoke_session(
            request.cookies.get(SESSION_COOKIE, ""),
            user_id=session.user.user_id,
        )
        response = JSONResponse(content={"ok": True})
        _clear_auth_cookies(response, settings=settings)
        return response

    @app.get("/api/auth/sessions", response_model=None)
    def sessions(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        return JSONResponse(
            content={
                "sessions": [
                    _session_payload(item, current_session_id=session.session_id)
                    for item in identity.list_sessions(session.user.user_id)
                ]
            }
        )

    @app.delete("/api/auth/sessions/{session_id}", response_model=None)
    def revoke_other_session(request: Request, session_id: str) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        if session_id == session.session_id:
            return JSONResponse(status_code=400, content={"detail": "use_logout_for_current_session"})
        revoked = identity.revoke_user_session(
            session.user.user_id,
            current_session_id=session.session_id,
            target_session_id=session_id,
        )
        if not revoked:
            return JSONResponse(status_code=404, content={"detail": "session_not_found"})
        return JSONResponse(content={"ok": True})

    @app.post("/api/auth/sessions/logout-others", response_model=None)
    def logout_other_sessions(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        revoked_count = identity.revoke_other_sessions(
            session.user.user_id,
            current_session_id=session.session_id,
        )
        return JSONResponse(content={"ok": True, "revoked_count": revoked_count})

    @app.post("/api/auth/sessions/logout-all", response_model=None)
    def logout_all_sessions(request: Request) -> JSONResponse:
        session: AuthenticatedSession = request.state.auth_session
        revoked_count = identity.revoke_all_sessions(session.user.user_id)
        response = JSONResponse(content={"ok": True, "revoked_count": revoked_count})
        _clear_auth_cookies(response, settings=settings)
        return response

    @app.get("/api/admin/users", response_model=None)
    def list_users(
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        return JSONResponse(
            content={"users": [_managed_user_payload(user) for user in identity.list_users()]}
        )

    @app.post("/api/admin/users", response_model=None, status_code=201)
    def create_user(
        payload: CreateUserPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        temporary_password = new_temporary_password()
        try:
            user = identity.create_user(
                admin_session.user.user_id,
                username=payload.username,
                password_hash=hash_password(temporary_password),
            )
        except (CredentialValidationError, UserAlreadyExists) as error:
            return JSONResponse(status_code=409, content={"detail": str(error)})
        return JSONResponse(
            status_code=201,
            content={
                "user": _managed_user_payload(user),
                "temporary_password": temporary_password,
            },
        )

    @app.post("/api/admin/users/{user_id}/reset-password", response_model=None)
    def reset_user_password(
        user_id: str,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        temporary_password = new_temporary_password()
        try:
            user = identity.reset_user_password(
                admin_session.user.user_id,
                user_id=user_id,
                password_hash=hash_password(temporary_password),
            )
        except ManagedUserNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ManagedUserOperationRejected as error:
            return JSONResponse(status_code=400, content={"detail": str(error)})
        return JSONResponse(
            content={
                "user": _user_payload(user),
                "temporary_password": temporary_password,
            }
        )

    @app.patch("/api/admin/users/{user_id}/status", response_model=None)
    def set_user_status(
        user_id: str,
        payload: UserStatusPayload,
        admin_session: Annotated[AuthenticatedSession, Depends(require_admin)],
    ) -> JSONResponse:
        try:
            user = identity.set_user_active(
                admin_session.user.user_id,
                user_id=user_id,
                is_active=payload.is_active,
            )
        except ManagedUserNotFound as error:
            return JSONResponse(status_code=404, content={"detail": str(error)})
        except ManagedUserOperationRejected as error:
            return JSONResponse(status_code=400, content={"detail": str(error)})
        return JSONResponse(content={"user": _user_payload(user)})

    @app.get("/", response_model=None)
    def home() -> FileResponse:
        return FileResponse(static_root / "home.html", headers={"Cache-Control": "no-store"})


def _request_has_same_origin(request: Request) -> bool:
    if request.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
        return False
    origin = request.headers.get("Origin")
    if not origin:
        return True
    parsed = urlsplit(origin)
    return parsed.scheme == request.url.scheme and parsed.netloc == request.headers.get("host", "")


def _request_user_agent(request: Request) -> str:
    return request.headers.get("User-Agent", "Unknown browser")[:512] or "Unknown browser"


def require_admin(request: Request) -> AuthenticatedSession:
    session: AuthenticatedSession = request.state.auth_session
    if session.user.role != "admin":
        raise HTTPException(status_code=403, detail="administrator_required")
    return session


def _unauthenticated_response(path: str) -> Response:
    if path.startswith("/api/") or path.startswith("/files/"):
        return JSONResponse(status_code=401, content={"detail": "authentication_required"})
    return RedirectResponse("/login", status_code=303)


def _authenticated_response(
    user: UserAccount,
    credentials: SessionCredentials,
    *,
    settings: ServerSettings,
) -> JSONResponse:
    response = JSONResponse(
        content={
            "user": _user_payload(user),
            "csrf_token": credentials.csrf_token,
        }
    )
    response.set_cookie(
        SESSION_COOKIE,
        credentials.token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        credentials.csrf_token,
        max_age=settings.session_ttl_seconds,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    return response


def _clear_auth_cookies(response: Response, *, settings: ServerSettings) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.delete_cookie(
        CSRF_COOKIE,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=False,
        samesite="strict",
    )


def _user_payload(user: UserAccount) -> dict[str, object]:
    return {
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "must_change_password": user.must_change_password,
        "is_active": user.is_active,
    }


def _managed_user_payload(user: ManagedUser) -> dict[str, object]:
    return {
        **_user_payload(user.user),
        "created_at": user.created_at.isoformat(),
    }


def _session_payload(
    session: BrowserSession,
    *,
    current_session_id: str,
) -> dict[str, object]:
    return {
        "session_id": session.session_id,
        "user_agent": session.user_agent,
        "created_at": session.created_at.isoformat(),
        "last_seen_at": session.last_seen_at.isoformat(),
        "expires_at": session.expires_at.isoformat(),
        "current": session.session_id == current_session_id,
    }

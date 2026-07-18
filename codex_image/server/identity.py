from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import hmac
from typing import Any, Literal, TypeAlias, cast
from uuid import uuid4

from psycopg import errors
from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .security import (
    CredentialValidationError,
    consume_dummy_password_work,
    hash_password,
    hash_token,
    new_session_token,
    normalize_username,
    validate_new_password,
    verify_password,
)


ADMIN_BOOTSTRAP_LOCK_ID = 4_607_322_027
UserRole = Literal["admin", "user"]
SessionAuditAction = Literal[
    "session.revoked",
    "session.revoked_others",
    "session.revoked_all",
]
SessionRevocationReason = Literal[
    "account_deactivated",
    "password_changed",
    "password_reset",
    "user_logout",
    "user_requested",
    "user_targeted",
]


class BootstrapAlreadyInitialized(RuntimeError):
    pass


class UserAlreadyExists(RuntimeError):
    pass


class ManagedUserNotFound(RuntimeError):
    pass


class ManagedUserOperationRejected(RuntimeError):
    pass


@dataclass(frozen=True)
class UserAccount:
    user_id: str
    username: str
    role: UserRole
    must_change_password: bool
    is_active: bool


@dataclass(frozen=True)
class AuthenticatedSession:
    user: UserAccount
    session_id: str
    user_agent: str
    csrf_token_hash: str


@dataclass(frozen=True)
class SessionCredentials:
    token: str
    csrf_token: str


@dataclass(frozen=True)
class ManagedUser:
    user: UserAccount
    created_at: datetime


@dataclass(frozen=True)
class BrowserSession:
    session_id: str
    user_agent: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class AllBrowserSessions:
    pass


@dataclass(frozen=True)
class TargetBrowserSession:
    session_id: str


@dataclass(frozen=True)
class OtherBrowserSessions:
    current_session_id: str


@dataclass(frozen=True)
class BrowserSessionByTokenHash:
    token_hash: str


SessionRevocationSelector: TypeAlias = (
    AllBrowserSessions
    | TargetBrowserSession
    | OtherBrowserSessions
    | BrowserSessionByTokenHash
)


class IdentityRepository:
    def __init__(self, connections: PostgresConnections) -> None:
        self.connections = connections

    def bootstrap_admin(self, username: str, password_hash: str) -> UserAccount:
        display_name, normalized_username = normalize_username(username)
        user = UserAccount(
            user_id=str(uuid4()),
            username=display_name,
            role="admin",
            must_change_password=True,
            is_active=True,
        )
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", (ADMIN_BOOTSTRAP_LOCK_ID,))
                cursor.execute("SELECT EXISTS (SELECT 1 FROM server_users)")
                if cursor.fetchone()[0]:
                    raise BootstrapAlreadyInitialized("server is already initialized")
                cursor.execute(
                    """
                    INSERT INTO server_users (
                        user_id,
                        username,
                        normalized_username,
                        role,
                        password_hash,
                        must_change_password,
                        is_active
                    ) VALUES (%s, %s, %s, 'admin', %s, TRUE, TRUE)
                    """,
                    (user.user_id, user.username, normalized_username, password_hash),
                )
                record_audit_event(
                    cursor,
                    action="user.bootstrap_admin",
                    actor_user_id=user.user_id,
                    subject_user_id=user.user_id,
                    details={"username": user.username},
                )
        return user

    def login(
        self,
        username: str,
        password: str,
        *,
        ttl_seconds: int,
        failure_limit: int,
        lock_seconds: int,
        user_agent: str,
    ) -> tuple[UserAccount, SessionCredentials] | None:
        try:
            display_name, normalized_username = normalize_username(username)
        except ValueError:
            consume_dummy_password_work(password)
            self._record_login_failure(username.strip()[:64], reason="invalid_credentials")
            return None

        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        user_id,
                        username,
                        role,
                        password_hash,
                        must_change_password,
                        temporary_login_consumed_at,
                        is_active,
                        failed_login_attempts,
                        locked_until,
                        locked_until IS NOT NULL AND locked_until > CURRENT_TIMESTAMP AS is_locked
                    FROM server_users
                    WHERE normalized_username = %s
                    FOR UPDATE
                    """,
                    (normalized_username,),
                )
                row = cursor.fetchone()
                if row is None:
                    consume_dummy_password_work(password)
                    record_audit_event(
                        cursor,
                        action="login.failed",
                        actor_user_id=None,
                        subject_user_id=None,
                        outcome="failure",
                        details={
                            "attempted_username_hash": self._attempted_username_hash(display_name),
                            "reason": "invalid_credentials",
                        },
                    )
                    return None
                if not row["is_active"]:
                    consume_dummy_password_work(password)
                    self._record_user_login_failure(cursor, row, reason="inactive")
                    return None
                if row["is_locked"]:
                    consume_dummy_password_work(password)
                    self._record_user_login_failure(cursor, row, reason="locked")
                    return None
                if not verify_password(password, row["password_hash"]):
                    attempts = (
                        1
                        if row["locked_until"] is not None
                        else row["failed_login_attempts"] + 1
                    )
                    cursor.execute(
                        """
                        UPDATE server_users
                        SET failed_login_attempts = %s,
                            locked_until = CASE
                                WHEN %s >= %s
                                THEN CURRENT_TIMESTAMP + (%s * INTERVAL '1 second')
                                ELSE NULL
                            END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = %s
                        """,
                        (attempts, attempts, failure_limit, lock_seconds, row["user_id"]),
                    )
                    self._record_user_login_failure(
                        cursor,
                        row,
                        reason="locked" if attempts >= failure_limit else "invalid_credentials",
                    )
                    return None
                if row["must_change_password"] and row["temporary_login_consumed_at"] is not None:
                    self._record_user_login_failure(
                        cursor,
                        row,
                        reason="temporary_credential_consumed",
                    )
                    return None
                cursor.execute(
                    """
                    UPDATE server_users
                    SET failed_login_attempts = 0,
                        locked_until = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (row["user_id"],),
                )
                if row["must_change_password"]:
                    cursor.execute(
                        """
                        UPDATE server_users
                        SET temporary_login_consumed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = %s
                        """,
                        (row["user_id"],),
                    )
                user = self._user_from_row(row)
                credentials = self._insert_session(
                    cursor,
                    user,
                    ttl_seconds=ttl_seconds,
                    user_agent=user_agent,
                )
                record_audit_event(
                    cursor,
                    action="login.succeeded",
                    actor_user_id=user.user_id,
                    subject_user_id=user.user_id,
                )
                return user, credentials

    def create_session(
        self,
        user: UserAccount,
        *,
        ttl_seconds: int,
        user_agent: str,
    ) -> SessionCredentials:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                return self._insert_session(
                    cursor,
                    user,
                    ttl_seconds=ttl_seconds,
                    user_agent=user_agent,
                )

    def resolve_session(self, token: str) -> AuthenticatedSession | None:
        if not token:
            return None
        token_hash = hash_token(token)
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        users.user_id,
                        users.username,
                        users.role,
                        users.must_change_password,
                        users.is_active,
                        sessions.session_id,
                        sessions.user_agent,
                        sessions.csrf_token_hash
                    FROM server_sessions AS sessions
                    JOIN server_users AS users ON users.user_id = sessions.user_id
                    WHERE sessions.token_hash = %s
                      AND sessions.revoked_at IS NULL
                      AND sessions.expires_at > CURRENT_TIMESTAMP
                      AND users.is_active = TRUE
                    """,
                    (token_hash,),
                )
                row = cursor.fetchone()
                if row is not None:
                    cursor.execute(
                        """
                        UPDATE server_sessions
                        SET last_seen_at = CURRENT_TIMESTAMP
                        WHERE token_hash = %s
                        """,
                        (token_hash,),
                    )
        if row is None:
            return None
        return AuthenticatedSession(
            user=self._user_from_row(row),
            session_id=row["session_id"],
            user_agent=row["user_agent"],
            csrf_token_hash=row["csrf_token_hash"],
        )

    def change_password(
        self,
        user_id: str,
        *,
        current_password: str,
        new_password: str,
    ) -> UserAccount | None:
        validate_new_password(new_password)
        if hmac.compare_digest(current_password, new_password):
            raise CredentialValidationError(
                "new password must be different from the current password"
            )
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT username, role, password_hash, is_active
                    FROM server_users
                    WHERE user_id = %s
                    FOR UPDATE
                    """,
                    (user_id,),
                )
                row = cursor.fetchone()
                if (
                    row is None
                    or not row["is_active"]
                    or not verify_password(current_password, row["password_hash"])
                ):
                    return None
                cursor.execute(
                    """
                    UPDATE server_users
                    SET password_hash = %s,
                        must_change_password = FALSE,
                        temporary_login_consumed_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (hash_password(new_password), user_id),
                )
                self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=user_id,
                    action="session.revoked_all",
                    reason="password_changed",
                    selector=AllBrowserSessions(),
                )
                record_audit_event(
                    cursor,
                    action="user.password_changed",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                )
        return UserAccount(
            user_id=user_id,
            username=row["username"],
            role=cast(UserRole, row["role"]),
            must_change_password=False,
            is_active=True,
        )

    def revoke_session(self, token: str, *, user_id: str) -> None:
        if not token:
            return
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=user_id,
                    action="session.revoked",
                    reason="user_logout",
                    selector=BrowserSessionByTokenHash(hash_token(token)),
                    record_empty=False,
                )

    def list_sessions(self, user_id: str) -> list[BrowserSession]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT session_id, user_agent, created_at, last_seen_at, expires_at
                    FROM server_sessions
                    WHERE user_id = %s
                      AND revoked_at IS NULL
                      AND expires_at > CURRENT_TIMESTAMP
                    ORDER BY created_at DESC, session_id
                    """,
                    (user_id,),
                )
                return [
                    BrowserSession(
                        session_id=row["session_id"],
                        user_agent=row["user_agent"],
                        created_at=row["created_at"],
                        last_seen_at=row["last_seen_at"],
                        expires_at=row["expires_at"],
                    )
                    for row in cursor.fetchall()
                ]

    def revoke_user_session(
        self,
        user_id: str,
        *,
        current_session_id: str,
        target_session_id: str,
    ) -> bool:
        if hmac.compare_digest(current_session_id, target_session_id):
            return False
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                revoked_sessions = self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=user_id,
                    action="session.revoked",
                    reason="user_targeted",
                    selector=TargetBrowserSession(target_session_id),
                    record_empty=False,
                )
                return bool(revoked_sessions)

    def revoke_other_sessions(self, user_id: str, *, current_session_id: str) -> int:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                revoked_sessions = self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=user_id,
                    action="session.revoked_others",
                    reason="user_requested",
                    selector=OtherBrowserSessions(current_session_id),
                )
                return len(revoked_sessions)

    def revoke_all_sessions(self, user_id: str) -> int:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                revoked_sessions = self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=user_id,
                    action="session.revoked_all",
                    reason="user_requested",
                    selector=AllBrowserSessions(),
                )
                return len(revoked_sessions)

    def list_users(self) -> list[ManagedUser]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT user_id, username, role, must_change_password, is_active, created_at
                    FROM server_users
                    ORDER BY normalized_username
                    """
                )
                return [
                    ManagedUser(user=self._user_from_row(row), created_at=row["created_at"])
                    for row in cursor.fetchall()
                ]

    def create_user(
        self,
        actor_user_id: str,
        *,
        username: str,
        password_hash: str,
    ) -> ManagedUser:
        display_name, normalized_username = normalize_username(username)
        user = UserAccount(
            user_id=str(uuid4()),
            username=display_name,
            role="user",
            must_change_password=True,
            is_active=True,
        )
        try:
            with self.connections.connect() as connection:
                with connection.cursor(row_factory=dict_row) as cursor:
                    cursor.execute(
                        """
                        INSERT INTO server_users (
                            user_id,
                            username,
                            normalized_username,
                            role,
                            password_hash,
                            must_change_password,
                            is_active
                        ) VALUES (%s, %s, %s, 'user', %s, TRUE, TRUE)
                        RETURNING created_at
                        """,
                        (user.user_id, user.username, normalized_username, password_hash),
                    )
                    created_at = cursor.fetchone()["created_at"]
                    record_audit_event(
                        cursor,
                        action="user.created",
                        actor_user_id=actor_user_id,
                        subject_user_id=user.user_id,
                        details={"username": user.username},
                    )
        except errors.UniqueViolation as error:
            raise UserAlreadyExists("username is already in use") from error
        return ManagedUser(user=user, created_at=created_at)

    def reset_user_password(
        self,
        actor_user_id: str,
        *,
        user_id: str,
        password_hash: str,
    ) -> UserAccount:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                row = self._lock_managed_user(cursor, actor_user_id, user_id)
                cursor.execute(
                    """
                    UPDATE server_users
                    SET password_hash = %s,
                        must_change_password = TRUE,
                        temporary_login_consumed_at = NULL,
                        failed_login_attempts = 0,
                        locked_until = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (password_hash, user_id),
                )
                self._revoke_sessions(
                    cursor,
                    user_id=user_id,
                    actor_user_id=actor_user_id,
                    action="session.revoked_all",
                    reason="password_reset",
                    selector=AllBrowserSessions(),
                )
                record_audit_event(
                    cursor,
                    action="user.password_reset",
                    actor_user_id=actor_user_id,
                    subject_user_id=user_id,
                )
        row["must_change_password"] = True
        return self._user_from_row(row)

    def set_user_active(
        self,
        actor_user_id: str,
        *,
        user_id: str,
        is_active: bool,
    ) -> UserAccount:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                row = self._lock_managed_user(cursor, actor_user_id, user_id)
                cursor.execute(
                    """
                    UPDATE server_users
                    SET is_active = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (is_active, user_id),
                )
                if not is_active:
                    self._revoke_sessions(
                        cursor,
                        user_id=user_id,
                        actor_user_id=actor_user_id,
                        action="session.revoked_all",
                        reason="account_deactivated",
                        selector=AllBrowserSessions(),
                    )
                record_audit_event(
                    cursor,
                    action="user.reactivated" if is_active else "user.deactivated",
                    actor_user_id=actor_user_id,
                    subject_user_id=user_id,
                )
        row["is_active"] = is_active
        return self._user_from_row(row)

    @staticmethod
    def _insert_session(
        cursor,
        user: UserAccount,
        *,
        ttl_seconds: int,
        user_agent: str,
    ) -> SessionCredentials:
        session = SessionCredentials(
            token=new_session_token(),
            csrf_token=new_session_token(),
        )
        cursor.execute(
            """
            INSERT INTO server_sessions (
                token_hash,
                session_id,
                user_id,
                csrf_token_hash,
                user_agent,
                expires_at
            ) VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                CURRENT_TIMESTAMP + (%s * INTERVAL '1 second')
            )
            """,
            (
                hash_token(session.token),
                str(uuid4()),
                user.user_id,
                hash_token(session.csrf_token),
                user_agent[:512] or "Unknown browser",
                ttl_seconds,
            ),
        )
        return session

    def _record_login_failure(self, attempted_username: str, *, reason: str) -> None:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                record_audit_event(
                    cursor,
                    action="login.failed",
                    actor_user_id=None,
                    subject_user_id=None,
                    outcome="failure",
                    details={
                        "attempted_username_hash": self._attempted_username_hash(
                            attempted_username
                        ),
                        "reason": reason,
                    },
                )

    @staticmethod
    def _revoke_sessions(
        cursor: Any,
        *,
        user_id: str,
        actor_user_id: str,
        action: SessionAuditAction,
        reason: SessionRevocationReason,
        selector: SessionRevocationSelector,
        record_empty: bool = True,
    ) -> list[str]:
        conditions = ["user_id = %s", "revoked_at IS NULL"]
        parameters: list[object] = [user_id]
        if isinstance(selector, TargetBrowserSession):
            conditions.append("session_id = %s")
            parameters.append(selector.session_id)
        elif isinstance(selector, OtherBrowserSessions):
            conditions.append("session_id <> %s")
            parameters.append(selector.current_session_id)
        elif isinstance(selector, BrowserSessionByTokenHash):
            conditions.append("token_hash = %s")
            parameters.append(selector.token_hash)

        cursor.execute(
            "UPDATE server_sessions "
            "SET revoked_at = CURRENT_TIMESTAMP "
            f"WHERE {' AND '.join(conditions)} "
            "RETURNING session_id",
            parameters,
        )
        session_ids = [row["session_id"] for row in cursor.fetchall()]
        if session_ids or record_empty:
            record_audit_event(
                cursor,
                action=action,
                actor_user_id=actor_user_id,
                subject_user_id=user_id,
                details={
                    "reason": reason,
                    "revoked_count": len(session_ids),
                    "session_ids": session_ids,
                },
            )
        return session_ids

    @staticmethod
    def _attempted_username_hash(username: str) -> str:
        return hashlib.sha256(username.casefold().encode("utf-8")).hexdigest()

    @staticmethod
    def _record_user_login_failure(cursor: Any, row: dict[str, Any], *, reason: str) -> None:
        record_audit_event(
            cursor,
            action="login.failed",
            actor_user_id=None,
            subject_user_id=row["user_id"],
            outcome="failure",
            details={"reason": reason},
        )

    @staticmethod
    def _lock_managed_user(
        cursor: Any,
        actor_user_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        if hmac.compare_digest(actor_user_id, user_id):
            raise ManagedUserOperationRejected("administrators cannot manage their own account here")
        cursor.execute(
            """
            SELECT user_id, username, role, must_change_password, is_active
            FROM server_users
            WHERE user_id = %s
            FOR UPDATE
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise ManagedUserNotFound("user was not found")
        if row["role"] != "user":
            raise ManagedUserOperationRejected("only ordinary users can be managed here")
        return row

    @staticmethod
    def _user_from_row(row: dict[str, Any]) -> UserAccount:
        return UserAccount(
            user_id=row["user_id"],
            username=row["username"],
            role=cast(UserRole, row["role"]),
            must_change_password=row["must_change_password"],
            is_active=row["is_active"],
        )

    @staticmethod
    def csrf_is_valid(
        session: AuthenticatedSession,
        *,
        cookie_token: str,
        header_token: str,
    ) -> bool:
        if not cookie_token or not header_token:
            return False
        if not hmac.compare_digest(cookie_token, header_token):
            return False
        return hmac.compare_digest(hash_token(header_token), session.csrf_token_hash)

from __future__ import annotations

from dataclasses import dataclass
import hmac
from typing import Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

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


class BootstrapAlreadyInitialized(RuntimeError):
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
    csrf_token_hash: str


@dataclass(frozen=True)
class SessionCredentials:
    token: str
    csrf_token: str


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
        return user

    def login(
        self,
        username: str,
        password: str,
        *,
        ttl_seconds: int,
    ) -> tuple[UserAccount, SessionCredentials] | None:
        try:
            _, normalized_username = normalize_username(username)
        except ValueError:
            consume_dummy_password_work(password)
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
                        is_active
                    FROM server_users
                    WHERE normalized_username = %s
                    FOR UPDATE
                    """,
                    (normalized_username,),
                )
                row = cursor.fetchone()
                if row is None:
                    consume_dummy_password_work(password)
                    return None
                if not verify_password(password, row["password_hash"]) or not row["is_active"]:
                    return None
                if row["must_change_password"] and row["temporary_login_consumed_at"] is not None:
                    return None
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
                user = UserAccount(
                    user_id=row["user_id"],
                    username=row["username"],
                    role=cast(UserRole, row["role"]),
                    must_change_password=row["must_change_password"],
                    is_active=row["is_active"],
                )
                credentials = self._insert_session(cursor, user, ttl_seconds=ttl_seconds)
                return user, credentials

    def create_session(self, user: UserAccount, *, ttl_seconds: int) -> SessionCredentials:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                return self._insert_session(
                    cursor,
                    user,
                    ttl_seconds=ttl_seconds,
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
        if row is None:
            return None
        return AuthenticatedSession(
            user=UserAccount(
                user_id=row["user_id"],
                username=row["username"],
                role=cast(UserRole, row["role"]),
                must_change_password=row["must_change_password"],
                is_active=row["is_active"],
            ),
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
                cursor.execute(
                    """
                    UPDATE server_sessions
                    SET revoked_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s AND revoked_at IS NULL
                    """,
                    (user_id,),
                )
        return UserAccount(
            user_id=user_id,
            username=row["username"],
            role=cast(UserRole, row["role"]),
            must_change_password=False,
            is_active=True,
        )

    def revoke_session(self, token: str) -> None:
        if not token:
            return
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE server_sessions
                    SET revoked_at = CURRENT_TIMESTAMP
                    WHERE token_hash = %s AND revoked_at IS NULL
                    """,
                    (hash_token(token),),
                )

    @staticmethod
    def _insert_session(
        cursor,
        user: UserAccount,
        *,
        ttl_seconds: int,
        credentials: SessionCredentials | None = None,
    ) -> SessionCredentials:
        session = credentials or SessionCredentials(
            token=new_session_token(),
            csrf_token=new_session_token(),
        )
        cursor.execute(
            """
            INSERT INTO server_sessions (
                token_hash,
                user_id,
                csrf_token_hash,
                expires_at
            ) VALUES (
                %s,
                %s,
                %s,
                CURRENT_TIMESTAMP + (%s * INTERVAL '1 second')
            )
            """,
            (hash_token(session.token), user.user_id, hash_token(session.csrf_token), ttl_seconds),
        )
        return session

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

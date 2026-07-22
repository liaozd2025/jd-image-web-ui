from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from typing import Any, Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .provider_secrets import ProviderSecretCipher
from .maintenance import assert_writes_allowed


ProviderApiMode = Literal["responses", "images"]


class ProviderVersionNotFound(RuntimeError):
    pass


class ProviderVersionInactive(RuntimeError):
    pass


class PersonalCredentialNotFound(RuntimeError):
    pass


@dataclass(frozen=True)
class ProviderVersion:
    provider_version_id: str
    provider_key: str
    version_number: int
    display_name: str
    base_url: str
    api_mode: ProviderApiMode
    models: list[dict[str, object]]
    parameter_constraints: dict[str, object]
    is_active: bool
    created_at: datetime


@dataclass(frozen=True)
class PersonalProviderCredential:
    provider_version_id: str
    provider_key: str
    version_number: int
    display_name: str
    api_key_mask: str | None
    has_credential: bool
    is_active: bool
    provider_is_active: bool
    updated_at: datetime


class ProviderRepository:
    def __init__(
        self,
        connections: PostgresConnections,
        cipher: ProviderSecretCipher,
    ) -> None:
        self.connections = connections
        self.cipher = cipher

    def list_catalog(self, *, active_only: bool) -> list[ProviderVersion]:
        where_clause = "WHERE is_active = TRUE" if active_only else ""
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    f"""
                    SELECT
                        provider_version_id,
                        provider_key,
                        version_number,
                        display_name,
                        base_url,
                        api_mode,
                        models,
                        parameter_constraints,
                        is_active,
                        created_at
                    FROM provider_catalog_versions
                    {where_clause}
                    ORDER BY provider_key, version_number
                    """
                )
                return [self._provider_from_row(row) for row in cursor.fetchall()]

    def create_provider_version(
        self,
        actor_user_id: str,
        *,
        provider_key: str,
        display_name: str,
        base_url: str,
        api_mode: ProviderApiMode,
        models: list[dict[str, object]],
        parameter_constraints: dict[str, object],
    ) -> ProviderVersion:
        provider_version_id = str(uuid4())
        canonical_models = [
            {
                **model,
                "generation_model_id": str(uuid4()),
            }
            for model in models
        ]
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                    (provider_key,),
                )
                cursor.execute(
                    """
                    SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
                    FROM provider_catalog_versions
                    WHERE provider_key = %s
                    """,
                    (provider_key,),
                )
                version_number = cursor.fetchone()["next_version_number"]
                cursor.execute(
                    """
                    INSERT INTO provider_catalog_versions (
                        provider_version_id,
                        provider_key,
                        version_number,
                        display_name,
                        base_url,
                        api_mode,
                        models,
                        parameter_constraints,
                        created_by_user_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
                    RETURNING created_at
                    """,
                    (
                        provider_version_id,
                        provider_key,
                        version_number,
                        display_name,
                        base_url,
                        api_mode,
                        json.dumps(canonical_models, separators=(",", ":")),
                        json.dumps(parameter_constraints, separators=(",", ":")),
                        actor_user_id,
                    ),
                )
                created_at = cursor.fetchone()["created_at"]
                cursor.executemany(
                    """
                    INSERT INTO generation_models (
                        generation_model_id, provider_version_id, display_name, model_id,
                        capability_profile_id, capability_profile_version, is_default,
                        is_enabled, validation_status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            model["generation_model_id"],
                            provider_version_id,
                            model["display_name"],
                            model["model_id"],
                            model["capability_profile_id"],
                            model["capability_profile_version"],
                            model["is_default"],
                            model["is_enabled"],
                            model["validation_status"],
                        )
                        for model in canonical_models
                    ],
                )
                record_audit_event(
                    cursor,
                    action="provider.version_created",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={
                        "provider_version_id": provider_version_id,
                        "provider_key": provider_key,
                        "version_number": version_number,
                    },
                )
        return ProviderVersion(
            provider_version_id=provider_version_id,
            provider_key=provider_key,
            version_number=version_number,
            display_name=display_name,
            base_url=base_url,
            api_mode=api_mode,
            models=canonical_models,
            parameter_constraints=parameter_constraints,
            is_active=True,
            created_at=created_at,
        )

    def set_provider_active(
        self,
        actor_user_id: str,
        *,
        provider_version_id: str,
        is_active: bool,
    ) -> ProviderVersion:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE provider_catalog_versions
                    SET is_active = %s
                    WHERE provider_version_id = %s
                    RETURNING
                        provider_version_id,
                        provider_key,
                        version_number,
                        display_name,
                        base_url,
                        api_mode,
                        models,
                        parameter_constraints,
                        is_active,
                        created_at
                    """,
                    (is_active, provider_version_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ProviderVersionNotFound("provider version was not found")
                record_audit_event(
                    cursor,
                    action=(
                        "provider.version_activated"
                        if is_active
                        else "provider.version_deactivated"
                    ),
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"provider_version_id": provider_version_id},
                )
        return self._provider_from_row(row)

    def list_personal_credentials(self, user_id: str) -> list[PersonalProviderCredential]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        credentials.provider_version_id,
                        versions.provider_key,
                        versions.version_number,
                        versions.display_name,
                        credentials.api_key_mask,
                        credentials.encrypted_api_key IS NOT NULL AS has_credential,
                        credentials.is_active,
                        versions.is_active AS provider_is_active,
                        credentials.updated_at
                    FROM personal_provider_credentials AS credentials
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = credentials.provider_version_id
                    WHERE credentials.user_id = %s
                    ORDER BY versions.provider_key, versions.version_number
                    """,
                    (user_id,),
                )
                return [self._credential_from_row(row) for row in cursor.fetchall()]

    def save_personal_credential(
        self,
        user_id: str,
        *,
        provider_version_id: str,
        api_key: str,
    ) -> PersonalProviderCredential:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                provider = self._lock_active_provider(cursor, provider_version_id)
                encrypted_api_key = self.cipher.encrypt_personal_api_key(
                    user_id=user_id,
                    provider_version_id=provider_version_id,
                    api_key=api_key,
                )
                api_key_mask = _mask_api_key(api_key)
                cursor.execute(
                    """
                    INSERT INTO personal_provider_credentials (
                        binding_id,
                        user_id,
                        provider_version_id,
                        encrypted_api_key,
                        api_key_mask,
                        is_active
                    ) VALUES (%s, %s, %s, %s, %s, TRUE)
                    ON CONFLICT (user_id, provider_version_id) DO UPDATE SET
                        encrypted_api_key = EXCLUDED.encrypted_api_key,
                        api_key_mask = EXCLUDED.api_key_mask,
                        is_active = TRUE,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING updated_at
                    """,
                    (
                        str(uuid4()),
                        user_id,
                        provider_version_id,
                        encrypted_api_key,
                        api_key_mask,
                    ),
                )
                updated_at = cursor.fetchone()["updated_at"]
                record_audit_event(
                    cursor,
                    action="provider.personal_credential_saved",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"provider_version_id": provider_version_id},
                )
        return PersonalProviderCredential(
            provider_version_id=provider_version_id,
            provider_key=provider["provider_key"],
            version_number=provider["version_number"],
            display_name=provider["display_name"],
            api_key_mask=api_key_mask,
            has_credential=True,
            is_active=True,
            provider_is_active=True,
            updated_at=updated_at,
        )

    def delete_personal_credential(
        self,
        user_id: str,
        *,
        provider_version_id: str,
    ) -> PersonalProviderCredential:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE personal_provider_credentials AS credentials
                    SET encrypted_api_key = NULL,
                        api_key_mask = NULL,
                        is_active = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    FROM provider_catalog_versions AS versions
                    WHERE credentials.user_id = %s
                      AND credentials.provider_version_id = %s
                      AND versions.provider_version_id = credentials.provider_version_id
                    RETURNING
                        credentials.provider_version_id,
                        versions.provider_key,
                        versions.version_number,
                        versions.display_name,
                        credentials.api_key_mask,
                        FALSE AS has_credential,
                        credentials.is_active,
                        versions.is_active AS provider_is_active,
                        credentials.updated_at
                    """,
                    (user_id, provider_version_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise PersonalCredentialNotFound("personal provider credential was not found")
                record_audit_event(
                    cursor,
                    action="provider.personal_credential_deleted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"provider_version_id": provider_version_id},
                )
        return self._credential_from_row(row)

    def resolve_personal_api_key(self, user_id: str, *, provider_version_id: str) -> str:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT credentials.encrypted_api_key
                    FROM personal_provider_credentials AS credentials
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = credentials.provider_version_id
                    WHERE credentials.user_id = %s
                      AND credentials.provider_version_id = %s
                      AND credentials.is_active = TRUE
                      AND credentials.encrypted_api_key IS NOT NULL
                      AND versions.is_active = TRUE
                    """,
                    (user_id, provider_version_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise PersonalCredentialNotFound("active personal provider credential was not found")
        return self.cipher.decrypt_personal_api_key(
            user_id=user_id,
            provider_version_id=provider_version_id,
            encrypted_value=row[0],
        )

    @staticmethod
    def _lock_active_provider(cursor: Any, provider_version_id: str) -> dict[str, Any]:
        cursor.execute(
            """
            SELECT provider_key, version_number, display_name, is_active
            FROM provider_catalog_versions
            WHERE provider_version_id = %s
            FOR UPDATE
            """,
            (provider_version_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise ProviderVersionNotFound("provider version was not found")
        if not row["is_active"]:
            raise ProviderVersionInactive("provider version is inactive")
        return row

    @staticmethod
    def _provider_from_row(row: dict[str, Any]) -> ProviderVersion:
        return ProviderVersion(
            provider_version_id=row["provider_version_id"],
            provider_key=row["provider_key"],
            version_number=row["version_number"],
            display_name=row["display_name"],
            base_url=row["base_url"],
            api_mode=cast(ProviderApiMode, row["api_mode"]),
            models=row["models"],
            parameter_constraints=row["parameter_constraints"],
            is_active=row["is_active"],
            created_at=row["created_at"],
        )

    @staticmethod
    def _credential_from_row(row: dict[str, Any]) -> PersonalProviderCredential:
        return PersonalProviderCredential(
            provider_version_id=row["provider_version_id"],
            provider_key=row["provider_key"],
            version_number=row["version_number"],
            display_name=row["display_name"],
            api_key_mask=row["api_key_mask"],
            has_credential=row["has_credential"],
            is_active=row["is_active"],
            provider_is_active=row["provider_is_active"],
            updated_at=row["updated_at"],
        )


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 4:
        return "••••"
    suffix = api_key[-4:]
    return f"••••{suffix}"

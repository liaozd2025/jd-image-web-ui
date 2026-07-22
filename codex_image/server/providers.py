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
from .model_capabilities import get_model_capability_profile


ProviderApiMode = Literal["responses", "images"]


class ProviderVersionNotFound(RuntimeError):
    pass


class ProviderVersionInactive(RuntimeError):
    pass


class PersonalCredentialNotFound(RuntimeError):
    pass


class GenerationModelNotFound(RuntimeError):
    pass


class GenerationModelInUse(RuntimeError):
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
                catalog = [self._provider_from_row(row) for row in cursor.fetchall()]
                if not catalog:
                    return []
                cursor.execute(
                    """
                    SELECT generation_model_id, provider_version_id, display_name,
                           model_id, capability_profile_id, capability_profile_version,
                           is_default, is_enabled, validation_status,
                           validation_request_id, validation_error, validated_at,
                           created_at, updated_at
                    FROM generation_models
                    WHERE owner_user_id IS NULL
                      AND provider_version_id = ANY(%s)
                    ORDER BY is_default DESC, created_at, generation_model_id
                    """,
                    ([provider.provider_version_id for provider in catalog],),
                )
                models_by_provider: dict[str, list[dict[str, object]]] = {}
                for row in cursor.fetchall():
                    models_by_provider.setdefault(str(row["provider_version_id"]), []).append(
                        self._generation_model_from_row(row)
                    )
                return [
                    ProviderVersion(
                        provider_version_id=provider.provider_version_id,
                        provider_key=provider.provider_key,
                        version_number=provider.version_number,
                        display_name=provider.display_name,
                        base_url=provider.base_url,
                        api_mode=provider.api_mode,
                        models=models_by_provider.get(provider.provider_version_id, provider.models),
                        parameter_constraints=provider.parameter_constraints,
                        is_active=provider.is_active,
                        created_at=provider.created_at,
                    )
                    for provider in catalog
                ]

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
        self._validate_model_api_modes(models, api_mode=api_mode)
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
                cursor.fetchone()
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
        return next(
            provider
            for provider in self.list_catalog(active_only=False)
            if provider.provider_version_id == provider_version_id
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
                self._ensure_personal_models(cursor, user_id, provider_version_id)
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

    def list_generation_models(
        self,
        *,
        provider_version_id: str,
        owner_user_id: str | None,
    ) -> list[dict[str, object]]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT generation_model_id, display_name, model_id,
                           capability_profile_id, capability_profile_version,
                           is_default, is_enabled, validation_status,
                           validation_request_id, validation_error, validated_at,
                           created_at, updated_at
                    FROM generation_models
                    WHERE provider_version_id = %s
                      AND owner_user_id IS NOT DISTINCT FROM %s
                    ORDER BY is_default DESC, created_at, generation_model_id
                    """,
                    (provider_version_id, owner_user_id),
                )
                return [self._generation_model_from_row(row) for row in cursor.fetchall()]

    def list_model_preferences(self, user_id: str) -> dict[str, object]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT provider_scope, provider_version_id, generation_model_id, updated_at
                    FROM generation_model_selection_preferences
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                selections = [
                    {
                        "provider_scope": row["provider_scope"],
                        "provider_version_id": row["provider_version_id"],
                        "generation_model_id": row["generation_model_id"],
                        "updated_at": row["updated_at"].isoformat(),
                    }
                    for row in cursor.fetchall()
                ]
                cursor.execute(
                    """
                    SELECT generation_model_id, parameters, updated_at
                    FROM generation_model_parameter_preferences
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                parameters = [
                    {
                        "generation_model_id": row["generation_model_id"],
                        "parameters": dict(row["parameters"] or {}),
                        "updated_at": row["updated_at"].isoformat(),
                    }
                    for row in cursor.fetchall()
                ]
        return {"selections": selections, "parameters": parameters}

    def save_model_preference(
        self,
        user_id: str,
        *,
        provider_scope: Literal["personal", "department"],
        provider_version_id: str,
        generation_model_id: str,
        parameters: dict[str, object] | None = None,
    ) -> dict[str, object]:
        if provider_scope not in {"personal", "department"}:
            raise GenerationModelNotFound("generation model scope is invalid")
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT generation_model_id, is_enabled, validation_status
                    FROM generation_models
                    WHERE generation_model_id = %s AND provider_version_id = %s
                      AND owner_user_id IS NOT DISTINCT FROM %s
                    FOR UPDATE
                    """,
                    (
                        generation_model_id,
                        provider_version_id,
                        user_id if provider_scope == "personal" else None,
                    ),
                )
                model = cursor.fetchone()
                if model is None or not bool(model["is_enabled"]):
                    raise GenerationModelNotFound("generation model was not found")
                cursor.execute(
                    """
                    INSERT INTO generation_model_selection_preferences (
                        user_id, provider_scope, provider_version_id, generation_model_id
                    ) VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, provider_scope, provider_version_id) DO UPDATE SET
                        generation_model_id = EXCLUDED.generation_model_id,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, provider_scope, provider_version_id, generation_model_id),
                )
                if parameters is not None:
                    cursor.execute(
                        """
                        INSERT INTO generation_model_parameter_preferences (
                            user_id, generation_model_id, parameters
                        ) VALUES (%s, %s, %s::jsonb)
                        ON CONFLICT (user_id, generation_model_id) DO UPDATE SET
                            parameters = EXCLUDED.parameters,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (
                            user_id,
                            generation_model_id,
                            json.dumps(parameters, separators=(",", ":")),
                        ),
                    )
                record_audit_event(
                    cursor,
                    action="generation_model.preference_saved",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={
                        "provider_scope": provider_scope,
                        "provider_version_id": provider_version_id,
                        "generation_model_id": generation_model_id,
                    },
                )
        return self.list_model_preferences(user_id)

    def replace_personal_models(
        self,
        user_id: str,
        *,
        provider_version_id: str,
        models: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT versions.api_mode
                    FROM personal_provider_credentials AS credentials
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = credentials.provider_version_id
                    WHERE credentials.user_id = %s
                      AND credentials.provider_version_id = %s
                    FOR UPDATE
                    """,
                    (user_id, provider_version_id),
                )
                credential = cursor.fetchone()
                if credential is None:
                    raise PersonalCredentialNotFound("personal provider credential was not found")
                self._validate_model_api_modes(models, api_mode=credential["api_mode"])
                self._ensure_personal_models(cursor, user_id, provider_version_id)
                cursor.execute(
                    """
                    SELECT generation_model_id, model_id, capability_profile_id,
                           capability_profile_version
                    FROM generation_models
                    WHERE provider_version_id = %s AND owner_user_id = %s
                    FOR UPDATE
                    """,
                    (provider_version_id, user_id),
                )
                existing_rows = cursor.fetchall()
                existing_ids = {str(row["generation_model_id"]) for row in existing_rows}
                existing_ids_by_model_id = {
                    str(row["model_id"]): str(row["generation_model_id"])
                    for row in existing_rows
                }
                existing_by_id = {
                    str(row["generation_model_id"]): row
                    for row in existing_rows
                }

                for model in models:
                    requested_id = str(model.get("generation_model_id") or "")
                    if requested_id not in existing_ids:
                        requested_id = existing_ids_by_model_id.get(
                            str(model.get("model_id") or ""),
                            "",
                        )
                    existing = existing_by_id.get(requested_id)
                    if existing is None:
                        continue
                    existing_identity = (
                        str(existing["model_id"]),
                        str(existing["capability_profile_id"]),
                        int(existing["capability_profile_version"]),
                    )
                    requested_identity = (
                        str(model.get("model_id") or ""),
                        str(model.get("capability_profile_id") or ""),
                        int(model.get("capability_profile_version") or 1),
                    )
                    if requested_identity == existing_identity:
                        continue
                    raise GenerationModelInUse(
                        "a generation model identity cannot be changed; "
                        "add a new model and disable or remove the old one"
                    )

                def requested_generation_model_id(model: dict[str, object]) -> str:
                    requested_id = str(model.get("generation_model_id") or "")
                    if requested_id in existing_ids:
                        return requested_id
                    return existing_ids_by_model_id.get(str(model.get("model_id") or ""), "")

                requested_existing_ids = {
                    requested_generation_model_id(model)
                    for model in models
                    if requested_generation_model_id(model)
                }
                removed_ids = existing_ids - requested_existing_ids
                if removed_ids:
                    cursor.execute(
                        """
                        SELECT generation_model_id
                        FROM server_generation_tasks
                        WHERE generation_model_id = ANY(%s)
                        LIMIT 1
                        """,
                        (list(removed_ids),),
                    )
                    if cursor.fetchone() is not None:
                        raise GenerationModelInUse(
                            "a referenced generation model can only be disabled"
                        )
                    cursor.execute(
                        """
                        DELETE FROM generation_models
                        WHERE provider_version_id = %s AND owner_user_id = %s
                          AND generation_model_id = ANY(%s)
                        """,
                        (provider_version_id, user_id, list(removed_ids)),
                    )
                stored_ids: list[str] = []
                for model in models:
                    requested_id = requested_generation_model_id(model)
                    generation_model_id = requested_id or str(uuid4())
                    stored_ids.append(generation_model_id)
                    cursor.execute(
                        """
                        INSERT INTO generation_models (
                            generation_model_id, provider_version_id, owner_user_id,
                            display_name, model_id, capability_profile_id,
                            capability_profile_version, is_default, is_enabled,
                            validation_status
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'not_required')
                        ON CONFLICT (generation_model_id) DO UPDATE SET
                            display_name = EXCLUDED.display_name,
                            model_id = EXCLUDED.model_id,
                            capability_profile_id = EXCLUDED.capability_profile_id,
                            capability_profile_version = EXCLUDED.capability_profile_version,
                            is_default = EXCLUDED.is_default,
                            is_enabled = EXCLUDED.is_enabled,
                            validation_status = 'not_required',
                            validation_request_id = NULL,
                            validation_error = NULL,
                            validated_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE generation_models.provider_version_id = EXCLUDED.provider_version_id
                          AND generation_models.owner_user_id = EXCLUDED.owner_user_id
                        """,
                        (
                            generation_model_id,
                            provider_version_id,
                            user_id,
                            model["display_name"],
                            model["model_id"],
                            model["capability_profile_id"],
                            model["capability_profile_version"],
                            model["is_default"],
                            model["is_enabled"],
                        ),
                    )
                record_audit_event(
                    cursor,
                    action="provider.personal_models_replaced",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={
                        "provider_version_id": provider_version_id,
                        "generation_model_ids": stored_ids,
                    },
                )
        return self.list_generation_models(
            provider_version_id=provider_version_id,
            owner_user_id=user_id,
        )

    @staticmethod
    def _validate_model_api_modes(
        models: list[dict[str, object]],
        *,
        api_mode: ProviderApiMode,
    ) -> None:
        for model in models:
            profile_id = str(model.get("capability_profile_id") or "generic-basic")
            profile = get_model_capability_profile(profile_id)
            if api_mode not in profile.get("api_modes", []):
                raise ValueError(
                    f"capability profile {profile_id} does not support provider API mode {api_mode}"
                )

    def delete_personal_model(
        self,
        user_id: str,
        *,
        provider_version_id: str,
        generation_model_id: str,
    ) -> None:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT is_default
                    FROM generation_models
                    WHERE generation_model_id = %s AND provider_version_id = %s
                      AND owner_user_id = %s
                    FOR UPDATE
                    """,
                    (generation_model_id, provider_version_id, user_id),
                )
                model = cursor.fetchone()
                if model is None:
                    raise GenerationModelNotFound("generation model was not found")
                if model["is_default"]:
                    raise GenerationModelInUse("the default generation model cannot be deleted")
                cursor.execute(
                    "SELECT 1 FROM server_generation_tasks WHERE generation_model_id = %s LIMIT 1",
                    (generation_model_id,),
                )
                if cursor.fetchone() is not None:
                    raise GenerationModelInUse(
                        "a referenced generation model can only be disabled"
                    )
                cursor.execute(
                    "DELETE FROM generation_models WHERE generation_model_id = %s",
                    (generation_model_id,),
                )
                record_audit_event(
                    cursor,
                    action="provider.personal_model_deleted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={
                        "provider_version_id": provider_version_id,
                        "generation_model_id": generation_model_id,
                    },
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
    def _ensure_personal_models(cursor: Any, user_id: str, provider_version_id: str) -> None:
        cursor.execute(
            """
            INSERT INTO generation_models (
                generation_model_id, provider_version_id, owner_user_id,
                display_name, model_id, capability_profile_id,
                capability_profile_version, is_default, is_enabled,
                validation_status
            )
            SELECT %s || substr(md5(%s || ':' || generation_model_id), 1, 24),
                   provider_version_id, %s, display_name, model_id,
                   capability_profile_id, capability_profile_version,
                   is_default, is_enabled, 'not_required'
            FROM generation_models AS department_models
            WHERE department_models.provider_version_id = %s
              AND department_models.owner_user_id IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM generation_models AS personal_models
                  WHERE personal_models.provider_version_id = %s
                    AND personal_models.owner_user_id = %s
              )
            """,
            (
                "gm-personal-",
                user_id,
                user_id,
                provider_version_id,
                provider_version_id,
                user_id,
            ),
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

    @staticmethod
    def _generation_model_from_row(row: dict[str, Any]) -> dict[str, object]:
        return {
            "generation_model_id": row["generation_model_id"],
            "display_name": row["display_name"],
            "model_id": row["model_id"],
            "capability_profile_id": row["capability_profile_id"],
            "capability_profile_version": int(row["capability_profile_version"]),
            "is_default": bool(row["is_default"]),
            "is_enabled": bool(row["is_enabled"]),
            "validation_status": row["validation_status"],
            "validation_request_id": row.get("validation_request_id"),
            "validation_error": row.get("validation_error"),
            "validated_at": row["validated_at"].isoformat() if row.get("validated_at") else None,
            "updated_at": row["updated_at"].isoformat(),
        }


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 4:
        return "••••"
    suffix = api_key[-4:]
    return f"••••{suffix}"

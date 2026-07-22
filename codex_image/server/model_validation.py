from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .maintenance import assert_writes_allowed
from .model_capabilities import get_model_capability_profile


ValidationStatus = Literal["queued", "verifying", "verified", "failed"]


class ModelValidationNotFound(RuntimeError):
    pass


class ModelValidationUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ClaimedModelValidation:
    validation_id: str
    generation_model_id: str
    provider_version_id: str
    model_id: str
    api_mode: Literal["images", "responses"]
    base_url: str
    capability_profile_id: str
    capability_profile_version: int
    request_parameters: dict[str, object]


class ModelValidationRepository:
    def __init__(self, connections: PostgresConnections) -> None:
        self.connections = connections

    def queue(self, actor_user_id: str, *, generation_model_id: str) -> dict[str, object]:
        validation_id = str(uuid4())
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT models.*, versions.is_active AS provider_is_active,
                           credentials.encrypted_api_key IS NOT NULL
                               AND credentials.is_active AS credential_available
                    FROM generation_models AS models
                    JOIN provider_catalog_versions AS versions USING (provider_version_id)
                    LEFT JOIN department_provider_credentials AS credentials
                      ON credentials.provider_version_id = models.provider_version_id
                    WHERE models.generation_model_id = %s
                      AND models.owner_user_id IS NULL
                    FOR UPDATE OF models
                    """,
                    (generation_model_id,),
                )
                model = cursor.fetchone()
                if model is None:
                    raise ModelValidationNotFound("department generation model was not found")
                if not model["provider_is_active"] or not model["credential_available"]:
                    raise ModelValidationUnavailable("department provider credential is unavailable")
                if model["validation_status"] in {"queued", "verifying"}:
                    raise ModelValidationUnavailable("generation model validation is already running")
                profile = get_model_capability_profile(str(model["capability_profile_id"]))
                request_parameters: dict[str, object] = {
                    "size": str(profile["sizes"][0]),
                    "n": 1,
                    "output_format": str(profile["default_output_format"]),
                    "prompt_optimization_mode": "off",
                    "watermark": False,
                }
                cursor.execute(
                    """
                    INSERT INTO generation_model_validations (
                        validation_id, generation_model_id, provider_version_id,
                        capability_profile_id, capability_profile_version, model_id,
                        status, request_parameters, created_by_user_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, 'queued', %s::jsonb, %s)
                    RETURNING *
                    """,
                    (
                        validation_id,
                        generation_model_id,
                        model["provider_version_id"],
                        model["capability_profile_id"],
                        model["capability_profile_version"],
                        model["model_id"],
                        json.dumps(request_parameters, separators=(",", ":")),
                        actor_user_id,
                    ),
                )
                validation = cursor.fetchone()
                cursor.execute(
                    """
                    UPDATE generation_models
                    SET validation_status = 'queued', validation_request_id = %s,
                        validation_error = NULL, validated_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE generation_model_id = %s
                    """,
                    (validation_id, generation_model_id),
                )
                record_audit_event(
                    cursor,
                    action="model.validation_queued",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={
                        "validation_id": validation_id,
                        "generation_model_id": generation_model_id,
                        "provider_version_id": model["provider_version_id"],
                    },
                )
        return self._validation_payload(validation)

    def latest(self, *, generation_model_id: str) -> dict[str, object]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT * FROM generation_model_validations
                    WHERE generation_model_id = %s
                    ORDER BY created_at DESC, validation_id DESC
                    LIMIT 1
                    """,
                    (generation_model_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise ModelValidationNotFound("generation model validation was not found")
        return self._validation_payload(row)

    def claim_next(self) -> ClaimedModelValidation | None:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT validations.*, versions.api_mode, versions.base_url
                    FROM generation_model_validations AS validations
                    JOIN provider_catalog_versions AS versions USING (provider_version_id)
                    WHERE validations.status = 'queued'
                    ORDER BY validations.created_at, validations.validation_id
                    FOR UPDATE OF validations SKIP LOCKED
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
                if row is None:
                    return None
                cursor.execute(
                    """
                    UPDATE generation_model_validations
                    SET status = 'verifying', started_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE validation_id = %s
                    """,
                    (row["validation_id"],),
                )
                cursor.execute(
                    """
                    UPDATE generation_models
                    SET validation_status = 'verifying', updated_at = CURRENT_TIMESTAMP
                    WHERE generation_model_id = %s
                    """,
                    (row["generation_model_id"],),
                )
        return ClaimedModelValidation(
            validation_id=row["validation_id"],
            generation_model_id=row["generation_model_id"],
            provider_version_id=row["provider_version_id"],
            model_id=row["model_id"],
            api_mode=cast(Literal["images", "responses"], row["api_mode"]),
            base_url=row["base_url"],
            capability_profile_id=row["capability_profile_id"],
            capability_profile_version=int(row["capability_profile_version"]),
            request_parameters=dict(row["request_parameters"]),
        )

    def complete(
        self,
        claimed: ClaimedModelValidation,
        *,
        provider_request_id: str | None = None,
    ) -> dict[str, object]:
        return self._finish(
            claimed,
            status="verified",
            provider_request_id=provider_request_id,
            error_message=None,
        )

    def fail(self, claimed: ClaimedModelValidation, *, error_message: str) -> dict[str, object]:
        return self._finish(
            claimed,
            status="failed",
            provider_request_id=None,
            error_message=error_message[:2_000],
        )

    def _finish(
        self,
        claimed: ClaimedModelValidation,
        *,
        status: Literal["verified", "failed"],
        provider_request_id: str | None,
        error_message: str | None,
    ) -> dict[str, object]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE generation_model_validations
                    SET status = %s, provider_request_id = %s, error_message = %s,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE validation_id = %s AND status = 'verifying'
                    RETURNING *
                    """,
                    (status, provider_request_id, error_message, claimed.validation_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ModelValidationUnavailable("generation model validation is not running")
                cursor.execute(
                    """
                    UPDATE generation_models
                    SET validation_status = %s, validation_error = %s,
                        validated_at = CASE WHEN %s = 'verified' THEN CURRENT_TIMESTAMP ELSE NULL END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE generation_model_id = %s
                      AND validation_request_id = %s
                    """,
                    (
                        status,
                        error_message,
                        status,
                        claimed.generation_model_id,
                        claimed.validation_id,
                    ),
                )
                record_audit_event(
                    cursor,
                    action=f"model.validation_{status}",
                    actor_user_id=row["created_by_user_id"],
                    subject_user_id=None,
                    outcome="success" if status == "verified" else "failure",
                    details={
                        "validation_id": claimed.validation_id,
                        "generation_model_id": claimed.generation_model_id,
                        "provider_request_id": provider_request_id,
                        "error": error_message,
                    },
                )
        return self._validation_payload(row)

    @staticmethod
    def _validation_payload(row: dict[str, Any]) -> dict[str, object]:
        return {
            "validation_id": row["validation_id"],
            "generation_model_id": row["generation_model_id"],
            "provider_version_id": row["provider_version_id"],
            "capability_profile_id": row["capability_profile_id"],
            "capability_profile_version": int(row["capability_profile_version"]),
            "model_id": row["model_id"],
            "status": row["status"],
            "request_parameters": dict(row["request_parameters"]),
            "provider_request_id": row.get("provider_request_id"),
            "error_message": row.get("error_message"),
            "created_at": row["created_at"].isoformat(),
            "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
            "completed_at": row["completed_at"].isoformat() if row.get("completed_at") else None,
        }

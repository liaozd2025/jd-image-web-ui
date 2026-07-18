from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .provider_secrets import MasterKeyMismatch, ProviderSecretCipher


TaskStatus = Literal["queued", "running", "completed", "failed"]


class TaskConfigurationError(RuntimeError):
    pass


class TaskNotFound(RuntimeError):
    pass


@dataclass(frozen=True)
class GenerationTask:
    task_id: str
    user_id: str
    provider_version_id: str
    model_id: str
    prompt: str
    request_parameters: dict[str, object]
    status: TaskStatus
    result_relative_path: str | None
    result_media_type: str | None
    result_sha256: str | None
    result_bytes: int | None
    revised_prompt: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None
    updated_at: str


@dataclass(frozen=True)
class ClaimedGenerationTask:
    task: GenerationTask
    api_mode: Literal["responses", "images"] | None
    base_url: str | None
    api_key: str | None
    configuration_error: str | None = None


class GenerationTaskRepository:
    def __init__(
        self,
        connections: PostgresConnections,
        cipher: ProviderSecretCipher,
        data_root: Path,
    ) -> None:
        self.connections = connections
        self.cipher = cipher
        self.data_root = data_root

    def create_task(
        self,
        user_id: str,
        *,
        provider_version_id: str,
        model_id: str,
        prompt: str,
        request_parameters: dict[str, object],
    ) -> GenerationTask:
        task_id = str(uuid4())
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        versions.provider_key,
                        versions.version_number,
                        versions.is_active,
                        versions.models,
                        credentials.encrypted_api_key
                    FROM provider_catalog_versions AS versions
                    LEFT JOIN personal_provider_credentials AS credentials
                      ON credentials.provider_version_id = versions.provider_version_id
                     AND credentials.user_id = %s
                     AND credentials.is_active = TRUE
                    WHERE versions.provider_version_id = %s
                    FOR UPDATE OF versions
                    """,
                    (user_id, provider_version_id),
                )
                provider = cursor.fetchone()
                if provider is None:
                    raise TaskConfigurationError("provider version was not found")
                if not provider["is_active"]:
                    raise TaskConfigurationError("provider version is inactive")
                if not _model_is_allowed(provider["models"], model_id):
                    raise TaskConfigurationError("model is not allowed for this provider version")
                encrypted_api_key = provider["encrypted_api_key"]
                if not encrypted_api_key:
                    raise TaskConfigurationError("active personal provider credential is required")
                try:
                    self.cipher.decrypt_personal_api_key(
                        user_id=user_id,
                        provider_version_id=provider_version_id,
                        encrypted_value=encrypted_api_key,
                    )
                except MasterKeyMismatch as error:
                    raise TaskConfigurationError("personal provider credential is unavailable") from error

                cursor.execute(
                    """
                    INSERT INTO server_generation_tasks (
                        task_id, user_id, provider_version_id, model_id, prompt,
                        request_parameters, status
                    ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'queued')
                    RETURNING *
                    """,
                    (
                        task_id,
                        user_id,
                        provider_version_id,
                        model_id,
                        prompt,
                        json.dumps(request_parameters, separators=(",", ":")),
                    ),
                )
                row = cursor.fetchone()
                record_audit_event(
                    cursor,
                    action="task.created",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={
                        "task_id": task_id,
                        "provider_version_id": provider_version_id,
                        "model_id": model_id,
                    },
                )
        return self._task_from_row(row)

    def list_tasks(self, user_id: str, *, limit: int = 50) -> list[GenerationTask]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_generation_tasks
                    WHERE user_id = %s
                    ORDER BY created_at DESC, task_id DESC
                    LIMIT %s
                    """,
                    (user_id, limit),
                )
                return [self._task_from_row(row) for row in cursor.fetchall()]

    def get_task(self, user_id: str, task_id: str) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT * FROM server_generation_tasks
                    WHERE user_id = %s AND task_id = %s
                    """,
                    (user_id, task_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise TaskNotFound("task was not found")
        return self._task_from_row(row)

    def claim_next_task(self) -> ClaimedGenerationTask | None:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT
                        tasks.*,
                        versions.api_mode,
                        versions.base_url,
                        versions.is_active AS provider_is_active,
                        credentials.encrypted_api_key
                    FROM server_generation_tasks AS tasks
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = tasks.provider_version_id
                    LEFT JOIN personal_provider_credentials AS credentials
                      ON credentials.provider_version_id = tasks.provider_version_id
                     AND credentials.user_id = tasks.user_id
                     AND credentials.is_active = TRUE
                    WHERE tasks.status = 'queued'
                    ORDER BY tasks.created_at, tasks.task_id
                    FOR UPDATE OF tasks SKIP LOCKED
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
                if row is None:
                    return None
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'running', started_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s
                    RETURNING *
                    """,
                    (row["task_id"],),
                )
                task = self._task_from_row(cursor.fetchone())
                api_key: str | None = None
                configuration_error: str | None = None
                if not row["provider_is_active"]:
                    configuration_error = "provider version is inactive"
                elif not row["encrypted_api_key"]:
                    configuration_error = "active personal provider credential is unavailable"
                else:
                    try:
                        api_key = self.cipher.decrypt_personal_api_key(
                            user_id=task.user_id,
                            provider_version_id=task.provider_version_id,
                            encrypted_value=row["encrypted_api_key"],
                        )
                    except MasterKeyMismatch:
                        configuration_error = "personal provider credential is unavailable"
                return ClaimedGenerationTask(
                    task=task,
                    api_mode=cast(Literal["responses", "images"] | None, row["api_mode"]),
                    base_url=row["base_url"],
                    api_key=api_key,
                    configuration_error=configuration_error,
                )

    def complete_task(
        self,
        task: GenerationTask,
        *,
        image_bytes: bytes,
        output_format: str,
        revised_prompt: str,
    ) -> GenerationTask:
        relative_path = Path("tasks") / task.user_id / f"{task.task_id}.{_safe_extension(output_format)}"
        absolute_path = self.data_root / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
        temporary_path.write_bytes(image_bytes)
        temporary_path.replace(absolute_path)
        digest = hashlib.sha256(image_bytes).hexdigest()
        media_type = _media_type(output_format)
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'completed', result_relative_path = %s,
                        result_media_type = %s, result_sha256 = %s,
                        result_bytes = %s, revised_prompt = %s,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND status = 'running'
                    RETURNING *
                    """,
                    (
                        relative_path.as_posix(),
                        media_type,
                        digest,
                        len(image_bytes),
                        revised_prompt,
                        task.task_id,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    absolute_path.unlink(missing_ok=True)
                    raise TaskNotFound("running task was not found")
                record_audit_event(
                    cursor,
                    action="task.completed",
                    actor_user_id=None,
                    subject_user_id=task.user_id,
                    details={"task_id": task.task_id, "result_sha256": digest},
                )
        return self._task_from_row(row)

    def fail_task(self, task: GenerationTask, error_message: str) -> GenerationTask:
        safe_message = " ".join(str(error_message).split())[:2000]
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'failed', error_message = %s,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND status = 'running'
                    RETURNING *
                    """,
                    (safe_message or "provider request failed", task.task_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("running task was not found")
                record_audit_event(
                    cursor,
                    action="task.failed",
                    actor_user_id=None,
                    subject_user_id=task.user_id,
                    outcome="failure",
                    details={"task_id": task.task_id, "error": safe_message},
                )
        return self._task_from_row(row)

    def result_path(self, task: GenerationTask) -> Path:
        if not task.result_relative_path:
            raise TaskNotFound("task has no result")
        root = self.data_root.resolve()
        path = (root / task.result_relative_path).resolve()
        if root != path and root not in path.parents:
            raise TaskNotFound("task result path is invalid")
        return path

    @staticmethod
    def _task_from_row(row: dict[str, Any]) -> GenerationTask:
        return GenerationTask(
            task_id=row["task_id"],
            user_id=row["user_id"],
            provider_version_id=row["provider_version_id"],
            model_id=row["model_id"],
            prompt=row["prompt"],
            request_parameters=row["request_parameters"],
            status=cast(TaskStatus, row["status"]),
            result_relative_path=row["result_relative_path"],
            result_media_type=row["result_media_type"],
            result_sha256=row["result_sha256"],
            result_bytes=row["result_bytes"],
            revised_prompt=row["revised_prompt"],
            error_message=row["error_message"],
            created_at=row["created_at"].isoformat(),
            started_at=row["started_at"].isoformat() if row["started_at"] else None,
            completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
            updated_at=row["updated_at"].isoformat(),
        )


def _model_is_allowed(models: object, model_id: str) -> bool:
    if not isinstance(models, list):
        return False
    return any(
        isinstance(model, dict)
        and model.get("model_id") == model_id
        and "image_generation" in model.get("capabilities", [])
        for model in models
    )


def _safe_extension(output_format: str) -> str:
    return output_format if output_format in {"png", "jpeg", "webp"} else "png"


def _media_type(output_format: str) -> str:
    return {"jpeg": "image/jpeg", "webp": "image/webp"}.get(output_format, "image/png")

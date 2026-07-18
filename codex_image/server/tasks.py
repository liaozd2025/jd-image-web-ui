from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import json
from pathlib import Path
from typing import Any, Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

from .audit import record_audit_event
from .assets import AssetNotFound, AssetQuotaExceeded, AssetRepository, AssetValidationError
from .database import PostgresConnections
from .provider_secrets import MasterKeyMismatch, ProviderSecretCipher


TaskStatus = Literal["queued", "running", "interrupted", "completed", "failed"]


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
    input_relative_path: str | None
    input_media_type: str | None
    input_sha256: str | None
    input_bytes: int | None
    asset_versions: list[dict[str, object]]
    thumbnail_bytes: int | None
    status: TaskStatus
    result_relative_path: str | None
    thumbnail_relative_path: str | None
    result_media_type: str | None
    result_sha256: str | None
    result_bytes: int | None
    revised_prompt: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None
    updated_at: str
    deleted_at: str | None
    purge_after: str | None


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
        assets: AssetRepository | None = None,
    ) -> None:
        self.connections = connections
        self.cipher = cipher
        self.data_root = data_root
        self.assets = assets

    def create_task(
        self,
        user_id: str,
        *,
        provider_version_id: str,
        model_id: str,
        prompt: str,
        request_parameters: dict[str, object],
        input_bytes: bytes | None = None,
        input_media_type: str | None = None,
        asset_version_ids: list[str] | None = None,
    ) -> GenerationTask:
        task_id = str(uuid4())
        asset_snapshots: list[dict[str, object]] = []
        if asset_version_ids:
            if self.assets is None:
                raise TaskConfigurationError("asset repository is unavailable")
            try:
                asset_snapshots = self.assets.resolve_versions(user_id, asset_version_ids)
            except (AssetNotFound, AssetValidationError) as error:
                raise TaskConfigurationError(str(error)) from error
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

                input_relative_path = Path("tasks") / user_id / f"{task_id}.input"
                input_path = self.data_root / input_relative_path
                input_path.parent.mkdir(parents=True, exist_ok=True)
                input_content = input_bytes if input_bytes is not None else prompt.encode("utf-8")
                input_type = input_media_type or "text/plain; charset=utf-8"
                if self.assets is not None:
                    try:
                        self.assets.ensure_capacity_cursor(cursor, user_id, len(input_content))
                    except (AssetNotFound, AssetQuotaExceeded, AssetValidationError) as error:
                        raise TaskConfigurationError(str(error)) from error
                temporary_path = input_path.with_name(f".{input_path.name}.{uuid4().hex}.tmp")
                temporary_path.write_bytes(input_content)
                temporary_path.replace(input_path)
                try:
                    cursor.execute(
                        """
                        INSERT INTO server_generation_tasks (
                            task_id, user_id, provider_version_id, model_id, prompt,
                            request_parameters, status, input_relative_path,
                            input_media_type, input_sha256, input_bytes, asset_versions
                        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'queued', %s, %s, %s, %s, %s::jsonb)
                        RETURNING *
                        """,
                        (
                            task_id,
                            user_id,
                            provider_version_id,
                            model_id,
                            prompt,
                            json.dumps(request_parameters, separators=(",", ":")),
                            input_relative_path.as_posix(),
                            input_type,
                            hashlib.sha256(input_content).hexdigest(),
                            len(input_content),
                            json.dumps(asset_snapshots, separators=(",", ":")),
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
                except Exception:
                    input_path.unlink(missing_ok=True)
                    raise
        return self._task_from_row(row)

    def list_tasks(
        self,
        user_id: str,
        *,
        status: TaskStatus | None = None,
        limit: int = 50,
        include_deleted: bool = False,
        only_deleted: bool = False,
    ) -> list[GenerationTask]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                status_clause = "AND status = %s" if status is not None else ""
                deleted_clause = (
                    "AND deleted_at IS NOT NULL"
                    if only_deleted
                    else "" if include_deleted else "AND deleted_at IS NULL"
                )
                params: tuple[object, ...] = (user_id, status, limit) if status is not None else (user_id, limit)
                cursor.execute(
                    f"""
                    SELECT *
                    FROM server_generation_tasks
                    WHERE user_id = %s {deleted_clause} {status_clause}
                    ORDER BY created_at DESC, task_id DESC
                    LIMIT %s
                    """,
                    params,
                )
                return [self._task_from_row(row) for row in cursor.fetchall()]

    def get_task(self, user_id: str, task_id: str, *, include_deleted: bool = False) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                deleted_clause = "" if include_deleted else "AND deleted_at IS NULL"
                cursor.execute(
                    f"""
                    SELECT * FROM server_generation_tasks
                    WHERE user_id = %s AND task_id = %s {deleted_clause}
                    """,
                    (user_id, task_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise TaskNotFound("task was not found")
        return self._task_from_row(row)

    def resubmit_task(self, user_id: str, task_id: str) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        if task.status not in {"failed", "interrupted"}:
            raise TaskConfigurationError("task is not retryable")
        try:
            input_content = self.input_path(task).read_bytes()
        except (OSError, TaskNotFound) as error:
            raise TaskConfigurationError("task input is unavailable") from error
        return self.create_task(
            user_id,
            provider_version_id=task.provider_version_id,
            model_id=task.model_id,
            prompt=task.prompt,
            request_parameters=task.request_parameters,
            input_bytes=input_content,
            input_media_type=task.input_media_type,
            asset_version_ids=[
                str(snapshot["asset_version_id"])
                for snapshot in task.asset_versions
                if snapshot.get("asset_version_id")
            ],
        )

    def soft_delete_task(self, user_id: str, task_id: str) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        if task.status in {"queued", "running"}:
            raise TaskConfigurationError("task is still active")
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET deleted_at = CURRENT_TIMESTAMP,
                        purge_after = CURRENT_TIMESTAMP + INTERVAL '30 days',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
                record_audit_event(
                    cursor,
                    action="task.deleted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id},
                )
        return self._task_from_row(row)

    def restore_task(self, user_id: str, task_id: str) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET deleted_at = NULL, purge_after = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NOT NULL
                    RETURNING *
                    """,
                    (task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
                record_audit_event(
                    cursor,
                    action="task.restored",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id},
                )
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
                    WHERE tasks.status = 'queued' AND tasks.deleted_at IS NULL
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

    def reconcile_running_tasks(self) -> int:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'interrupted',
                        error_message = 'worker interrupted before completion',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE status = 'running'
                    """
                )
                return cursor.rowcount

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
        thumbnail_relative_path = self._write_thumbnail(task, image_bytes)
        thumbnail_bytes = (
            (self.data_root / thumbnail_relative_path).stat().st_size
            if thumbnail_relative_path
            else 0
        )
        temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
        temporary_path.write_bytes(image_bytes)
        temporary_path.replace(absolute_path)
        digest = hashlib.sha256(image_bytes).hexdigest()
        media_type = _media_type(output_format)
        try:
            with self.connections.connect() as connection:
                with connection.cursor(row_factory=dict_row) as cursor:
                    if self.assets is not None:
                        self.assets.ensure_capacity_cursor(
                            cursor,
                            task.user_id,
                            len(image_bytes) + thumbnail_bytes,
                        )
                    cursor.execute(
                        """
                        UPDATE server_generation_tasks
                        SET status = 'completed', result_relative_path = %s,
                            thumbnail_relative_path = %s,
                            thumbnail_bytes = %s,
                            result_media_type = %s, result_sha256 = %s,
                            result_bytes = %s, revised_prompt = %s,
                            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE task_id = %s AND status = 'running'
                        RETURNING *
                        """,
                        (
                            relative_path.as_posix(),
                            thumbnail_relative_path,
                            thumbnail_bytes,
                            media_type,
                            digest,
                            len(image_bytes),
                            revised_prompt,
                            task.task_id,
                        ),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise TaskNotFound("running task was not found")
                    record_audit_event(
                        cursor,
                        action="task.completed",
                        actor_user_id=None,
                        subject_user_id=task.user_id,
                        details={"task_id": task.task_id, "result_sha256": digest},
                    )
        except (AssetNotFound, AssetQuotaExceeded, AssetValidationError) as error:
            absolute_path.unlink(missing_ok=True)
            if thumbnail_relative_path:
                (self.data_root / thumbnail_relative_path).unlink(missing_ok=True)
            raise TaskConfigurationError(str(error)) from error
        except TaskNotFound:
            absolute_path.unlink(missing_ok=True)
            if thumbnail_relative_path:
                (self.data_root / thumbnail_relative_path).unlink(missing_ok=True)
            raise
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
        return self._artifact_path(task, task.result_relative_path)

    def input_path(self, task: GenerationTask) -> Path:
        if not task.input_relative_path:
            raise TaskNotFound("task has no input")
        return self._artifact_path(task, task.input_relative_path)

    def asset_reference_path(self, task: GenerationTask, snapshot: dict[str, object]) -> Path:
        asset_id = str(snapshot.get("asset_id") or "")
        version_id = str(snapshot.get("asset_version_id") or "")
        relative_path = str(snapshot.get("stored_relative_path") or "")
        root = self.data_root.resolve()
        asset_root = (root / "assets" / task.user_id / asset_id).resolve()
        path = (root / relative_path).resolve()
        if (
            not asset_id
            or not version_id
            or path.parent != asset_root
            or not path.name.startswith(f"{version_id}.")
        ):
            raise TaskNotFound("task asset reference path is invalid")
        return path

    def thumbnail_path(self, task: GenerationTask) -> Path:
        if not task.thumbnail_relative_path:
            raise TaskNotFound("task has no thumbnail")
        return self._artifact_path(task, task.thumbnail_relative_path)

    def _artifact_path(self, task: GenerationTask, relative_path: str) -> Path:
        root = self.data_root.resolve()
        tasks_root = (root / "tasks").resolve()
        user_root = (root / "tasks" / task.user_id).resolve()
        path = (root / relative_path).resolve()
        outside_tasks = tasks_root != path and tasks_root not in path.parents
        if (
            outside_tasks
            or path.parent != user_root
            or not path.name.startswith(f"{task.task_id}.")
        ):
            raise TaskNotFound("task artifact path is invalid")
        return path

    def _write_thumbnail(self, task: GenerationTask, image_bytes: bytes) -> str | None:
        relative_path = Path("tasks") / task.user_id / f"{task.task_id}.thumb.jpg"
        absolute_path = self.data_root / relative_path
        temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
        try:
            from PIL import Image

            with Image.open(BytesIO(image_bytes)) as image:
                image.thumbnail((512, 512))
                thumbnail = image.convert("RGB")
                absolute_path.parent.mkdir(parents=True, exist_ok=True)
                thumbnail.save(temporary_path, format="JPEG", quality=85, optimize=True)
            temporary_path.replace(absolute_path)
            return relative_path.as_posix()
        except Exception:
            temporary_path.unlink(missing_ok=True)
            return None

    @staticmethod
    def _task_from_row(row: dict[str, Any]) -> GenerationTask:
        return GenerationTask(
            task_id=row["task_id"],
            user_id=row["user_id"],
            provider_version_id=row["provider_version_id"],
            model_id=row["model_id"],
            prompt=row["prompt"],
            request_parameters=row["request_parameters"],
            input_relative_path=row["input_relative_path"],
            input_media_type=row["input_media_type"],
            input_sha256=row["input_sha256"],
            input_bytes=row["input_bytes"],
            asset_versions=row.get("asset_versions") or [],
            thumbnail_bytes=row.get("thumbnail_bytes"),
            status=cast(TaskStatus, row["status"]),
            result_relative_path=row["result_relative_path"],
            thumbnail_relative_path=row["thumbnail_relative_path"],
            result_media_type=row["result_media_type"],
            result_sha256=row["result_sha256"],
            result_bytes=row["result_bytes"],
            revised_prompt=row["revised_prompt"],
            error_message=row["error_message"],
            created_at=row["created_at"].isoformat(),
            started_at=row["started_at"].isoformat() if row["started_at"] else None,
            completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
            updated_at=row["updated_at"].isoformat(),
            deleted_at=row.get("deleted_at").isoformat() if row.get("deleted_at") else None,
            purge_after=row.get("purge_after").isoformat() if row.get("purge_after") else None,
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

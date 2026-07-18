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
from .department_providers import DepartmentCredentialNotFound, DepartmentProviderRepository, DepartmentQuotaExceeded
from .provider_secrets import MasterKeyMismatch, ProviderSecretCipher
from .shared_assets import SharedAssetRepository
from .maintenance import assert_writes_allowed


TaskStatus = Literal["queued", "running", "interrupted", "completed", "failed", "cancelled"]


class TaskConfigurationError(RuntimeError):
    pass


class TaskNotFound(RuntimeError):
    pass


@dataclass(frozen=True)
class GenerationTask:
    task_id: str
    user_id: str
    provider_version_id: str
    provider_scope: Literal["personal", "department"]
    model_id: str
    prompt: str
    request_parameters: dict[str, object]
    input_relative_path: str | None
    input_media_type: str | None
    input_sha256: str | None
    input_bytes: int | None
    asset_versions: list[dict[str, object]]
    shared_asset_versions: list[dict[str, object]]
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
    cancel_requested: bool
    cancel_requested_at: str | None
    cancelled_at: str | None
    quota_units: int
    quota_period_start: str | None


@dataclass(frozen=True)
class ClaimedGenerationTask:
    task: GenerationTask
    attempt_id: str
    api_mode: Literal["responses", "images"] | None
    base_url: str | None
    api_key: str | None
    configuration_error: str | None = None
    quota_period_start: str | None = None


class GenerationTaskRepository:
    def __init__(
        self,
        connections: PostgresConnections,
        cipher: ProviderSecretCipher,
        data_root: Path,
        assets: AssetRepository | None = None,
        shared_assets: SharedAssetRepository | None = None,
        departments: DepartmentProviderRepository | None = None,
    ) -> None:
        self.connections = connections
        self.cipher = cipher
        self.data_root = data_root
        self.assets = assets
        self.shared_assets = shared_assets
        self.departments = departments

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
        shared_asset_version_ids: list[str] | None = None,
        provider_scope: Literal["personal", "department"] = "personal",
    ) -> GenerationTask:
        task_id = str(uuid4())
        if provider_scope not in {"personal", "department"}:
            raise TaskConfigurationError("provider scope is invalid")
        asset_snapshots: list[dict[str, object]] = []
        if asset_version_ids:
            if self.assets is None:
                raise TaskConfigurationError("asset repository is unavailable")
            try:
                asset_snapshots = self.assets.resolve_versions(user_id, asset_version_ids)
            except (AssetNotFound, AssetValidationError) as error:
                raise TaskConfigurationError(str(error)) from error
        shared_asset_snapshots: list[dict[str, object]] = []
        if shared_asset_version_ids:
            if self.shared_assets is None:
                raise TaskConfigurationError("shared asset repository is unavailable")
            try:
                shared_asset_snapshots = self.shared_assets.resolve_versions(shared_asset_version_ids)
            except (AssetNotFound, AssetValidationError) as error:
                raise TaskConfigurationError(str(error)) from error
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                if provider_scope == "department":
                    cursor.execute(
                        """
                        SELECT versions.provider_key, versions.version_number, versions.is_active,
                               versions.models, credentials.encrypted_api_key
                        FROM provider_catalog_versions AS versions
                        LEFT JOIN department_provider_credentials AS credentials
                          ON credentials.provider_version_id = versions.provider_version_id
                         AND credentials.is_active = TRUE
                        WHERE versions.provider_version_id = %s
                        FOR UPDATE OF versions
                        """,
                        (provider_version_id,),
                    )
                else:
                    cursor.execute(
                        """
                        SELECT versions.provider_key, versions.version_number, versions.is_active,
                               versions.models, credentials.encrypted_api_key
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
                    scope_label = "department" if provider_scope == "department" else "personal"
                    raise TaskConfigurationError(f"active {scope_label} provider credential is required")
                try:
                    if provider_scope == "department":
                        # Department credentials are intentionally decrypted only in Worker.
                        pass
                    else:
                        self.cipher.decrypt_personal_api_key(
                            user_id=user_id,
                            provider_version_id=provider_version_id,
                            encrypted_value=encrypted_api_key,
                        )
                except MasterKeyMismatch as error:
                    raise TaskConfigurationError("provider credential is unavailable") from error

                quota_period_start: str | None = None
                if provider_scope == "department":
                    if self.departments is None:
                        raise TaskConfigurationError("department provider is unavailable")
                    try:
                        quota_period_start = self.departments.reserve(user_id, 1)
                    except DepartmentQuotaExceeded as error:
                        raise TaskConfigurationError(str(error)) from error

                input_relative_path = Path("tasks") / user_id / f"{task_id}.input"
                input_path = self.data_root / input_relative_path
                input_path.parent.mkdir(parents=True, exist_ok=True)
                input_content = input_bytes if input_bytes is not None else prompt.encode("utf-8")
                input_type = input_media_type or "text/plain; charset=utf-8"
                if self.assets is not None:
                    try:
                        self.assets.ensure_capacity_cursor(cursor, user_id, len(input_content))
                    except (AssetNotFound, AssetQuotaExceeded, AssetValidationError) as error:
                        self._release_department_reservation(user_id, quota_period_start)
                        raise TaskConfigurationError(str(error)) from error
                temporary_path = input_path.with_name(f".{input_path.name}.{uuid4().hex}.tmp")
                try:
                    temporary_path.write_bytes(input_content)
                    temporary_path.replace(input_path)
                except Exception:
                    self._release_department_reservation(user_id, quota_period_start)
                    raise
                try:
                    cursor.execute(
                        """
                        INSERT INTO server_generation_tasks (
                            task_id, user_id, provider_version_id, model_id, prompt,
                            request_parameters, status, input_relative_path,
                            input_media_type, input_sha256, input_bytes, asset_versions, shared_asset_versions,
                            provider_scope, quota_units, quota_period_start
                        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'queued', %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s)
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
                            json.dumps(shared_asset_snapshots, separators=(",", ":")),
                            provider_scope,
                            1,
                            quota_period_start,
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
                    self._release_department_reservation(user_id, quota_period_start)
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
        if task.status not in {"failed", "interrupted", "cancelled"}:
            raise TaskConfigurationError("task is not retryable")
        try:
            self.input_path(task).stat()
        except (OSError, TaskNotFound) as error:
            raise TaskConfigurationError("task input is unavailable") from error
        quota_period_start: str | None = None
        if task.provider_scope == "department":
            if self.departments is None:
                raise TaskConfigurationError("department provider is unavailable")
            try:
                quota_period_start = self.departments.reserve(user_id, task.quota_units)
            except DepartmentQuotaExceeded as error:
                raise TaskConfigurationError(str(error)) from error
        try:
            with self.connections.connect() as connection:
                with connection.cursor(row_factory=dict_row) as cursor:
                    assert_writes_allowed(cursor)
                    cursor.execute(
                        """
                        UPDATE server_generation_tasks
                        SET status = 'queued', started_at = NULL, completed_at = NULL,
                            cancel_requested = FALSE, cancel_requested_at = NULL, cancelled_at = NULL,
                            error_message = NULL, result_relative_path = NULL,
                            thumbnail_relative_path = NULL, thumbnail_bytes = NULL,
                            result_media_type = NULL, result_sha256 = NULL, result_bytes = NULL,
                            revised_prompt = NULL, storage_purged_at = NULL,
                            quota_period_start = COALESCE(%s, quota_period_start),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE task_id = %s AND user_id = %s
                          AND status IN ('failed', 'interrupted', 'cancelled')
                        RETURNING *
                        """,
                        (quota_period_start, task_id, user_id),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise TaskConfigurationError("task is no longer retryable")
                    record_audit_event(
                        cursor,
                        action="task.resubmitted",
                        actor_user_id=user_id,
                        subject_user_id=user_id,
                        details={"task_id": task_id},
                    )
            return self._task_from_row(row)
        except Exception:
            if quota_period_start and self.departments is not None:
                self.departments.settle(user_id, quota_period_start, units=task.quota_units, consumed=False)
            raise

    def list_attempts(self, user_id: str, task_id: str) -> list[dict[str, object]]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT attempts.*
                    FROM server_generation_task_attempts AS attempts
                    JOIN server_generation_tasks AS tasks ON tasks.task_id = attempts.task_id
                    WHERE tasks.user_id = %s AND attempts.task_id = %s
                    ORDER BY attempts.attempt_number ASC
                    """,
                    (user_id, task_id),
                )
                rows = cursor.fetchall()
        return [
            {
                "attempt_id": row["attempt_id"],
                "attempt_number": int(row["attempt_number"]),
                "provider_version_id": row["provider_version_id"],
                "provider_scope": row["provider_scope"],
                "status": row["status"],
                "started_at": row["started_at"].isoformat(),
                "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
                "error_message": row["error_message"],
                "result_relative_path": row["result_relative_path"],
                "result_sha256": row["result_sha256"],
                "result_bytes": row["result_bytes"],
            }
            for row in rows
        ]

    def attempt_result_path(self, user_id: str, task_id: str, attempt_id: str) -> Path:
        task = self.get_task(user_id, task_id)
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT attempts.result_relative_path
                    FROM server_generation_task_attempts AS attempts
                    JOIN server_generation_tasks AS tasks ON tasks.task_id = attempts.task_id
                    WHERE tasks.user_id = %s AND tasks.deleted_at IS NULL
                      AND attempts.task_id = %s AND attempts.attempt_id = %s
                    """,
                    (user_id, task_id, attempt_id),
                )
                row = cursor.fetchone()
        if row is None or not row["result_relative_path"]:
            raise TaskNotFound("attempt result was not found")
        return self._artifact_path(task, str(row["result_relative_path"]))

    def cancel_task(self, user_id: str, task_id: str) -> GenerationTask:
        release_quota: tuple[str, str, int] | None = None
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT * FROM server_generation_tasks WHERE user_id = %s AND task_id = %s FOR UPDATE",
                    (user_id, task_id),
                )
                task_row = cursor.fetchone()
                if task_row is None:
                    raise TaskNotFound("task was not found")
                status = task_row["status"]
                if status not in {"queued", "running"}:
                    raise TaskConfigurationError("task is not cancellable")
                if status == "queued":
                    cursor.execute(
                        """
                        UPDATE server_generation_tasks
                        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
                            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
                            error_message = 'task cancelled by user'
                        WHERE task_id = %s
                        RETURNING *
                        """,
                        (task_id,),
                    )
                    row = cursor.fetchone()
                    if task_row["quota_period_start"]:
                        release_quota = (
                            user_id,
                            task_row["quota_period_start"].isoformat(),
                            int(task_row.get("quota_units") or 1),
                        )
                    action = "task.cancelled"
                else:
                    if task_row["cancel_requested"]:
                        row = task_row
                        action = None
                    else:
                        cursor.execute(
                            """
                            UPDATE server_generation_tasks
                            SET cancel_requested = TRUE, cancel_requested_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE task_id = %s AND status = 'running' AND cancel_requested = FALSE
                            RETURNING *
                            """,
                            (task_id,),
                        )
                        row = cursor.fetchone()
                        action = "task.cancel_requested"
                if row is None:
                    raise TaskNotFound("task was not found")
                if action:
                    record_audit_event(
                        cursor,
                        action=action,
                        actor_user_id=user_id,
                        subject_user_id=user_id,
                        details={"task_id": task_id},
                    )
        if release_quota and self.departments is not None:
            self.departments.settle(
                release_quota[0],
                release_quota[1],
                units=release_quota[2],
                consumed=False,
            )
        return self._task_from_row(row)

    def cancel_claimed_task(self, task: GenerationTask, *, attempt_id: str) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'cancelled', cancel_requested = FALSE,
                        cancelled_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP,
                        error_message = 'task cancelled by user'
                    WHERE task_id = %s AND status = 'running' AND cancel_requested = TRUE
                      AND EXISTS (
                          SELECT 1 FROM server_generation_task_attempts
                          WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                      )
                    RETURNING *
                    """,
                    (task.task_id, attempt_id, task.task_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("running task was not found")
                cursor.execute(
                    """
                    UPDATE server_generation_task_attempts
                    SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP, error_message = 'task cancelled by user'
                    WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                    """,
                    (attempt_id, task.task_id),
                )
                record_audit_event(
                    cursor,
                    action="task.cancelled",
                    actor_user_id=None,
                    subject_user_id=task.user_id,
                    details={"task_id": task.task_id},
                )
        return self._task_from_row(row)

    def soft_delete_task(self, user_id: str, task_id: str) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        if task.status in {"queued", "running"}:
            raise TaskConfigurationError("task is still active")
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
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
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET deleted_at = NULL, purge_after = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NOT NULL
                      AND storage_purged_at IS NULL
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

    def settle_quota(self, task: GenerationTask, *, consumed: bool) -> None:
        if task.provider_scope != "department" or not task.quota_period_start or self.departments is None:
            return
        self.departments.settle(
            task.user_id,
            task.quota_period_start,
            units=task.quota_units,
            consumed=consumed,
        )

    def _release_department_reservation(self, user_id: str, period_start: str | None) -> None:
        if period_start and self.departments is not None:
            try:
                self.departments.settle(user_id, period_start, units=1, consumed=False)
            except Exception:
                # Preserve the original submission error; reconciliation can repair a stale reservation.
                pass

    def claim_next_task(self) -> ClaimedGenerationTask | None:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT global_concurrency, per_user_concurrency FROM server_scheduler_settings WHERE singleton FOR UPDATE"
                )
                limits = cursor.fetchone()
                if limits is None:
                    return None
                cursor.execute(
                    """
                    SELECT
                        tasks.*,
                        versions.api_mode,
                        versions.base_url,
                        versions.is_active AS provider_is_active,
                        credentials.encrypted_api_key AS personal_encrypted_api_key,
                        department_credentials.encrypted_api_key AS department_encrypted_api_key,
                        tasks.provider_scope, tasks.quota_period_start
                    FROM server_generation_tasks AS tasks
                    JOIN server_users AS users
                      ON users.user_id = tasks.user_id
                     AND users.is_active = TRUE
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = tasks.provider_version_id
                    LEFT JOIN personal_provider_credentials AS credentials
                      ON credentials.provider_version_id = tasks.provider_version_id
                     AND credentials.user_id = tasks.user_id
                     AND credentials.is_active = TRUE
                    LEFT JOIN department_provider_credentials AS department_credentials
                      ON department_credentials.provider_version_id = tasks.provider_version_id
                     AND department_credentials.is_active = TRUE
                    LEFT JOIN server_scheduler_user_state AS scheduler_state
                      ON scheduler_state.user_id = tasks.user_id
                    WHERE tasks.status = 'queued' AND tasks.deleted_at IS NULL
                      AND versions.is_active = TRUE
                      AND (
                          (tasks.provider_scope = 'personal' AND credentials.encrypted_api_key IS NOT NULL)
                          OR (tasks.provider_scope = 'department' AND department_credentials.encrypted_api_key IS NOT NULL)
                      )
                      AND (
                          SELECT COUNT(*) FROM server_generation_tasks AS running_tasks
                          WHERE running_tasks.status = 'running'
                      ) < %s
                      AND (
                          SELECT COUNT(*) FROM server_generation_tasks AS user_running_tasks
                          WHERE user_running_tasks.status = 'running'
                            AND user_running_tasks.user_id = tasks.user_id
                      ) < %s
                    ORDER BY COALESCE(scheduler_state.last_claimed_at, TIMESTAMP 'epoch'),
                             tasks.created_at, tasks.task_id
                    FOR UPDATE OF tasks SKIP LOCKED
                    LIMIT 1
                    """,
                    (limits["global_concurrency"], limits["per_user_concurrency"]),
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
                cursor.execute(
                    """
                    INSERT INTO server_generation_task_attempts (
                        attempt_id, task_id, attempt_number, provider_version_id, provider_scope, status
                    )
                    SELECT %s, task_id,
                           COALESCE((
                               SELECT MAX(previous_attempts.attempt_number)
                               FROM server_generation_task_attempts AS previous_attempts
                               WHERE previous_attempts.task_id = server_generation_tasks.task_id
                           ), 0) + 1,
                           provider_version_id, provider_scope, 'running'
                    FROM server_generation_tasks
                    WHERE task_id = %s
                    RETURNING attempt_id
                    """,
                    (str(uuid4()), task.task_id),
                )
                attempt_id = cursor.fetchone()["attempt_id"]
                cursor.execute(
                    """
                    INSERT INTO server_scheduler_user_state (user_id, last_claimed_at)
                    VALUES (%s, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id) DO UPDATE SET last_claimed_at = EXCLUDED.last_claimed_at
                    """,
                    (task.user_id,),
                )
                api_key: str | None = None
                configuration_error: str | None = None
                encrypted_api_key = (
                    row["department_encrypted_api_key"]
                    if row["provider_scope"] == "department"
                    else row["personal_encrypted_api_key"]
                )
                if not row["provider_is_active"]:
                    configuration_error = "provider version is inactive"
                elif not encrypted_api_key:
                    configuration_error = "active provider credential is unavailable"
                else:
                    try:
                        if row["provider_scope"] == "department":
                            api_key = self.cipher.decrypt_department_api_key(
                                provider_version_id=task.provider_version_id,
                                encrypted_value=encrypted_api_key,
                            )
                        else:
                            api_key = self.cipher.decrypt_personal_api_key(
                                user_id=task.user_id,
                                provider_version_id=task.provider_version_id,
                                encrypted_value=encrypted_api_key,
                            )
                    except MasterKeyMismatch:
                        configuration_error = (
                            "department provider credential is unavailable"
                            if row["provider_scope"] == "department"
                            else "personal provider credential is unavailable"
                        )
                return ClaimedGenerationTask(
                    task=task,
                    attempt_id=attempt_id,
                    api_mode=cast(Literal["responses", "images"] | None, row["api_mode"]),
                    base_url=row["base_url"],
                    api_key=api_key,
                    configuration_error=configuration_error,
                    quota_period_start=row["quota_period_start"].isoformat() if row["quota_period_start"] else None,
                )

    def reconcile_running_tasks(self) -> list[GenerationTask]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT * FROM server_generation_tasks WHERE status = 'running' FOR UPDATE"
                )
                interrupted = [self._task_from_row(row) for row in cursor.fetchall()]
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'interrupted',
                        error_message = 'worker interrupted before completion',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE status = 'running'
                    """
                )
                cursor.execute(
                    """
                    UPDATE server_generation_task_attempts
                    SET status = 'interrupted', completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP,
                        error_message = 'worker interrupted before completion'
                    WHERE status = 'running'
                    """
                )
                return interrupted

    def complete_task(
        self,
        task: GenerationTask,
        *,
        attempt_id: str,
        image_bytes: bytes,
        output_format: str,
        revised_prompt: str,
    ) -> GenerationTask:
        # Hold a shared lock on the maintenance row across both file and DB writes.
        # Maintenance acquisition uses FOR UPDATE and therefore waits until the
        # generated bytes and their database pointers are committed together.
        with self.connections.connect() as guard_connection:
            with guard_connection.cursor() as guard_cursor:
                assert_writes_allowed(guard_cursor)
                return self._complete_task_unlocked(
                    task,
                    attempt_id=attempt_id,
                    image_bytes=image_bytes,
                    output_format=output_format,
                    revised_prompt=revised_prompt,
                )

    def _complete_task_unlocked(
        self,
        task: GenerationTask,
        *,
        attempt_id: str,
        image_bytes: bytes,
        output_format: str,
        revised_prompt: str,
    ) -> GenerationTask:
        relative_path = (
            Path("tasks") / task.user_id / task.task_id
            / f"attempt-{attempt_id}.{_safe_extension(output_format)}"
        )
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
                    assert_writes_allowed(cursor)
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
                        WHERE task_id = %s AND status = 'running' AND cancel_requested = FALSE
                          AND EXISTS (
                              SELECT 1 FROM server_generation_task_attempts
                              WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                          )
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
                            attempt_id,
                            task.task_id,
                        ),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        cursor.execute(
                            """
                            SELECT * FROM server_generation_tasks
                            WHERE task_id = %s AND status = 'running' AND cancel_requested = TRUE
                              AND EXISTS (
                                  SELECT 1 FROM server_generation_task_attempts
                                  WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                              )
                            """,
                            (task.task_id, attempt_id, task.task_id),
                        )
                        cancellation = cursor.fetchone()
                        if cancellation is None:
                            raise TaskNotFound("running task was not found")
                        cursor.execute(
                            """
                            UPDATE server_generation_tasks
                            SET status = 'cancelled', cancel_requested = FALSE,
                                cancelled_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP,
                                error_message = 'task cancelled by user'
                            WHERE task_id = %s AND status = 'running' AND cancel_requested = TRUE
                              AND EXISTS (
                                  SELECT 1 FROM server_generation_task_attempts
                                  WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                              )
                            RETURNING *
                            """,
                            (task.task_id, attempt_id, task.task_id),
                        )
                        row = cursor.fetchone()
                        cursor.execute(
                            """
                            UPDATE server_generation_task_attempts
                            SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP,
                                error_message = 'task cancelled by user'
                            WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                            """,
                            (attempt_id, task.task_id),
                        )
                        record_audit_event(
                            cursor,
                            action="task.cancelled",
                            actor_user_id=None,
                            subject_user_id=task.user_id,
                            details={"task_id": task.task_id},
                        )
                        absolute_path.unlink(missing_ok=True)
                        if thumbnail_relative_path:
                            (self.data_root / thumbnail_relative_path).unlink(missing_ok=True)
                        return self._task_from_row(row)
                    cursor.execute(
                        """
                        UPDATE server_generation_task_attempts
                        SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP, result_relative_path = %s,
                            result_sha256 = %s, result_bytes = %s
                        WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                        """,
                        (relative_path.as_posix(), digest, len(image_bytes), attempt_id, task.task_id),
                    )
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
        except Exception:
            absolute_path.unlink(missing_ok=True)
            if thumbnail_relative_path:
                (self.data_root / thumbnail_relative_path).unlink(missing_ok=True)
            raise
        return self._task_from_row(row)

    def fail_task(self, task: GenerationTask, *, attempt_id: str, error_message: str) -> GenerationTask:
        safe_message = " ".join(str(error_message).split())[:2000]
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'failed', error_message = %s,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND status = 'running' AND cancel_requested = FALSE
                      AND EXISTS (
                          SELECT 1 FROM server_generation_task_attempts
                          WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                      )
                    RETURNING *
                    """,
                    (safe_message or "provider request failed", task.task_id, attempt_id, task.task_id),
                )
                row = cursor.fetchone()
                if row is None:
                    cursor.execute(
                        """
                        SELECT * FROM server_generation_tasks
                        WHERE task_id = %s AND status = 'running' AND cancel_requested = TRUE
                          AND EXISTS (
                              SELECT 1 FROM server_generation_task_attempts
                              WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                          )
                        """,
                        (task.task_id, attempt_id, task.task_id),
                    )
                    cancellation = cursor.fetchone()
                    if cancellation is None:
                        raise TaskNotFound("running task was not found")
                    cursor.execute(
                        """
                        UPDATE server_generation_tasks
                        SET status = 'cancelled', cancel_requested = FALSE,
                            cancelled_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP,
                            error_message = 'task cancelled by user'
                        WHERE task_id = %s AND status = 'running' AND cancel_requested = TRUE
                          AND EXISTS (
                              SELECT 1 FROM server_generation_task_attempts
                              WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                          )
                        RETURNING *
                        """,
                        (task.task_id, attempt_id, task.task_id),
                    )
                    row = cursor.fetchone()
                    cursor.execute(
                        """
                        UPDATE server_generation_task_attempts
                        SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP,
                            error_message = 'task cancelled by user'
                        WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                        """,
                        (attempt_id, task.task_id),
                    )
                    record_audit_event(
                        cursor,
                        action="task.cancelled",
                        actor_user_id=None,
                        subject_user_id=task.user_id,
                        details={"task_id": task.task_id},
                    )
                    return self._task_from_row(row)
                cursor.execute(
                    """
                    UPDATE server_generation_task_attempts
                    SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP, error_message = %s
                    WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                    """,
                    (safe_message or "provider request failed", attempt_id, task.task_id),
                )
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
        scope = str(snapshot.get("scope") or "personal")
        root = self.data_root.resolve()
        if scope == "shared":
            storage_root = (root / "shared-assets").resolve()
            asset_root = (storage_root / asset_id).resolve()
        else:
            storage_root = (root / "assets").resolve()
            asset_root = (storage_root / task.user_id / asset_id).resolve()
        path = (root / relative_path).resolve()
        outside_storage = storage_root != path and storage_root not in path.parents
        if (
            outside_storage
            or not asset_id
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
        attempt_root = (user_root / task.task_id).resolve()
        path = (root / relative_path).resolve()
        outside_tasks = tasks_root != path and tasks_root not in path.parents
        if (
            outside_tasks
            or (path.parent != user_root and path.parent != attempt_root)
            or not (
                (path.parent == user_root and path.name.startswith(f"{task.task_id}."))
                or (path.parent == attempt_root and path.name.startswith("attempt-"))
            )
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
            provider_scope=cast(Literal["personal", "department"], row.get("provider_scope") or "personal"),
            model_id=row["model_id"],
            prompt=row["prompt"],
            request_parameters=row["request_parameters"],
            input_relative_path=row["input_relative_path"],
            input_media_type=row["input_media_type"],
            input_sha256=row["input_sha256"],
            input_bytes=row["input_bytes"],
            asset_versions=row.get("asset_versions") or [],
            shared_asset_versions=row.get("shared_asset_versions") or [],
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
            cancel_requested=bool(row.get("cancel_requested", False)),
            cancel_requested_at=(
                row.get("cancel_requested_at").isoformat() if row.get("cancel_requested_at") else None
            ),
            cancelled_at=row.get("cancelled_at").isoformat() if row.get("cancelled_at") else None,
            quota_units=int(row.get("quota_units") or 1),
            quota_period_start=row.get("quota_period_start").isoformat() if row.get("quota_period_start") else None,
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

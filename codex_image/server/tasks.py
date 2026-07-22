from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import secrets
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
from .model_capabilities import get_model_capability_profile


TaskStatus = Literal["queued", "running", "interrupted", "completed", "partial_failed", "failed", "cancelled"]


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
    generation_model_id: str | None
    model_display_name: str
    model_id: str
    capability_profile_id: str
    capability_profile_version: int
    capability_snapshot: dict[str, object]
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
    output_files: list[dict[str, object]]
    revised_prompt: str | None
    error_message: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None
    updated_at: str
    deleted_at: str | None
    purge_after: str | None
    storage_purged_at: str | None
    cancel_requested: bool
    cancel_requested_at: str | None
    cancelled_at: str | None
    quota_units: int
    quota_period_start: str | None
    archived_at: str | None
    viewed_at: str | None
    retry_of_task_id: str | None
    queue_position: int


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
        generation_model_id: str | None = None,
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
                if generation_model_id:
                    cursor.execute(
                        """
                        SELECT generation_model_id, display_name, model_id,
                               capability_profile_id, capability_profile_version,
                               is_enabled, validation_status
                        FROM generation_models
                        WHERE provider_version_id = %s
                          AND owner_user_id IS NOT DISTINCT FROM %s
                          AND generation_model_id = %s
                        """,
                        (
                            provider_version_id,
                            user_id if provider_scope == "personal" else None,
                            generation_model_id,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        SELECT generation_model_id, display_name, model_id,
                               capability_profile_id, capability_profile_version,
                               is_enabled, validation_status
                        FROM generation_models
                        WHERE provider_version_id = %s
                          AND owner_user_id IS NOT DISTINCT FROM %s
                          AND model_id = %s
                        """,
                        (
                            provider_version_id,
                            user_id if provider_scope == "personal" else None,
                            model_id,
                        ),
                    )
                generation_model = cursor.fetchone()
                if generation_model is None or not bool(generation_model["is_enabled"]):
                    raise TaskConfigurationError("model is not allowed for this provider version")
                if (
                    provider_scope == "department"
                    and generation_model["validation_status"] != "verified"
                ):
                    raise TaskConfigurationError("department model is not verified")
                profile_id = str(generation_model.get("capability_profile_id") or "generic-basic")
                try:
                    capability_snapshot = get_model_capability_profile(profile_id)
                except KeyError as error:
                    raise TaskConfigurationError("model capability profile is unavailable") from error
                profile_version = int(
                    generation_model.get("capability_profile_version")
                    or capability_snapshot["version"]
                )
                expected_profile_version = request_parameters.get("capability_profile_version")
                if expected_profile_version not in {None, ""}:
                    try:
                        version_matches = int(expected_profile_version) == profile_version
                    except (TypeError, ValueError):
                        version_matches = False
                    if not version_matches:
                        raise TaskConfigurationError("model capability changed; refresh and try again")
                model_id = str(generation_model.get("model_id") or model_id)
                model_display_name = str(generation_model.get("display_name") or model_id)
                generation_model_id = generation_model.get("generation_model_id")
                image_reference_count = int(
                    bool(input_bytes is not None and str(input_media_type or "").startswith("image/"))
                ) + sum(
                    1
                    for snapshot in [*asset_snapshots, *shared_asset_snapshots]
                    if str(snapshot.get("asset_kind") or "") in {"image", "reference"}
                )
                request_parameters = _validated_task_parameters(
                    request_parameters,
                    capability_snapshot,
                    reference_image_count=image_reference_count,
                )
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
                quota_units = int(request_parameters.get("n") or 1)
                if provider_scope == "department":
                    if self.departments is None:
                        raise TaskConfigurationError("department provider is unavailable")
                    try:
                        quota_period_start = self.departments.reserve(user_id, quota_units)
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
                        self._release_department_reservation(user_id, quota_period_start, quota_units)
                        raise TaskConfigurationError(str(error)) from error
                temporary_path = input_path.with_name(f".{input_path.name}.{uuid4().hex}.tmp")
                try:
                    temporary_path.write_bytes(input_content)
                    temporary_path.replace(input_path)
                except Exception:
                    self._release_department_reservation(user_id, quota_period_start, quota_units)
                    raise
                try:
                    cursor.execute(
                        """
                        SELECT COALESCE(MAX(queue_position), 0) + 1 AS queue_position
                        FROM server_generation_tasks
                        WHERE user_id = %s
                        """,
                        (user_id,),
                    )
                    queue_position = int(cursor.fetchone()["queue_position"])
                    cursor.execute(
                        """
                        INSERT INTO server_generation_tasks (
                            task_id, user_id, provider_version_id, generation_model_id,
                            model_display_name, model_id, capability_profile_id,
                            capability_profile_version, capability_snapshot, prompt,
                            request_parameters, status, input_relative_path,
                            input_media_type, input_sha256, input_bytes, asset_versions, shared_asset_versions,
                            provider_scope, quota_units, quota_period_start, queue_position
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s,
                            %s::jsonb, 'queued', %s, %s, %s, %s, %s::jsonb,
                            %s::jsonb, %s, %s, %s, %s
                        )
                        RETURNING *
                        """,
                        (
                            task_id,
                            user_id,
                            provider_version_id,
                            generation_model_id,
                            model_display_name,
                            model_id,
                            profile_id,
                            profile_version,
                            json.dumps(capability_snapshot, separators=(",", ":")),
                            prompt,
                            json.dumps(request_parameters, separators=(",", ":")),
                            input_relative_path.as_posix(),
                            input_type,
                            hashlib.sha256(input_content).hexdigest(),
                            len(input_content),
                            json.dumps(asset_snapshots, separators=(",", ":")),
                            json.dumps(shared_asset_snapshots, separators=(",", ":")),
                            provider_scope,
                            quota_units,
                            quota_period_start,
                            queue_position,
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
                            "generation_model_id": generation_model_id,
                        },
                    )
                except Exception:
                    input_path.unlink(missing_ok=True)
                    self._release_department_reservation(user_id, quota_period_start, quota_units)
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

    def list_tasks_page(
        self,
        user_id: str,
        *,
        page: int,
        page_size: int,
        status: TaskStatus | None = None,
        state: str = "active",
        query: str = "",
    ) -> tuple[list[GenerationTask], int]:
        clauses = ["user_id = %s"]
        values: list[object] = [user_id]
        if state == "active":
            clauses.append("deleted_at IS NULL")
        elif state == "deleted":
            clauses.append("deleted_at IS NOT NULL")
        if status is not None:
            clauses.append("status = %s")
            values.append(status)
        normalized_query = query.strip()
        if normalized_query:
            pattern = f"%{normalized_query}%"
            clauses.append("(task_id ILIKE %s OR prompt ILIKE %s OR model_id ILIKE %s)")
            values.extend((pattern, pattern, pattern))
        where = " AND ".join(clauses)
        offset = (page - 1) * page_size
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"SELECT COUNT(*) FROM server_generation_tasks WHERE {where}",
                    values,
                )
                total = int(cursor.fetchone()["count"])
                cursor.execute(
                    f"""
                    SELECT *
                    FROM server_generation_tasks
                    WHERE {where}
                    ORDER BY created_at DESC, task_id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (*values, page_size, offset),
                )
                return [self._task_from_row(row) for row in cursor.fetchall()], total

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

    def list_queue_tasks(self, user_id: str) -> list[GenerationTask]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_generation_tasks
                    WHERE user_id = %s AND deleted_at IS NULL
                      AND status IN ('queued', 'running')
                    ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END,
                             queue_position, created_at, task_id
                    """,
                    (user_id,),
                )
                return [self._task_from_row(row) for row in cursor.fetchall()]

    def reorder_queue(self, user_id: str, task_ids: list[str]) -> list[GenerationTask]:
        if not task_ids or len(task_ids) != len(set(task_ids)):
            raise TaskConfigurationError("queue order must contain each waiting task exactly once")
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT task_id
                    FROM server_generation_tasks
                    WHERE user_id = %s AND status = 'queued' AND deleted_at IS NULL
                    ORDER BY queue_position, created_at, task_id
                    FOR UPDATE
                    """,
                    (user_id,),
                )
                queued_ids = [str(row["task_id"]) for row in cursor.fetchall()]
                if set(queued_ids) != set(task_ids) or len(queued_ids) != len(task_ids):
                    raise TaskConfigurationError("queue changed; refresh and try again")
                cursor.executemany(
                    """
                    UPDATE server_generation_tasks
                    SET queue_position = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s AND task_id = %s AND status = 'queued'
                    """,
                    [(position, user_id, task_id) for position, task_id in enumerate(task_ids, start=1)],
                )
                record_audit_event(
                    cursor,
                    action="task.queue_reordered",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_ids": task_ids},
                )
        return self.list_queue_tasks(user_id)

    def promote_queue_task(self, user_id: str, task_id: str) -> list[GenerationTask]:
        queued = [task.task_id for task in self.list_queue_tasks(user_id) if task.status == "queued"]
        if task_id not in queued:
            raise TaskNotFound("queued task was not found")
        return self.reorder_queue(user_id, [task_id, *[item for item in queued if item != task_id]])

    def resubmit_task(
        self,
        user_id: str,
        task_id: str,
        *,
        confirm_capability_change: bool = False,
    ) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        if task.status not in {"failed", "partial_failed", "interrupted", "cancelled"}:
            raise TaskConfigurationError("task is not retryable")
        try:
            input_path = self.input_path(task)
            input_path.stat()
        except (OSError, TaskNotFound) as error:
            raise TaskConfigurationError("task input is unavailable") from error
        input_bytes = input_path.read_bytes() if (task.input_media_type or "").startswith("image/") else None
        asset_version_ids = [str(item.get("asset_version_id")) for item in task.asset_versions if item.get("asset_version_id")]
        shared_asset_version_ids = [
            str(item.get("asset_version_id")) for item in task.shared_asset_versions if item.get("asset_version_id")
        ]
        retry_parameters = {**task.request_parameters, "retry_of_task_id": task.task_id}
        if confirm_capability_change:
            retry_parameters["capability_change_confirmed_from_version"] = task.capability_profile_version
            retry_parameters.pop("capability_profile_version", None)
        if task.status == "partial_failed":
            failed_indices = [
                int(item)
                for item in task.request_parameters.get("failed_output_indices", [])
                if isinstance(item, int) or str(item).isdigit()
            ]
            if not failed_indices:
                raise TaskConfigurationError("partial task has no failed outputs to retry")
            retry_parameters["n"] = len(failed_indices)
            retry_parameters["output_indices"] = failed_indices
        try:
            created = self.create_task(
                user_id,
                provider_version_id=task.provider_version_id,
                model_id=task.model_id,
                generation_model_id=task.generation_model_id,
                prompt=task.prompt,
                request_parameters=retry_parameters,
                input_bytes=input_bytes,
                input_media_type=task.input_media_type if input_bytes is not None else None,
                asset_version_ids=asset_version_ids,
                shared_asset_version_ids=shared_asset_version_ids,
                provider_scope=task.provider_scope,
            )
        except TaskConfigurationError as error:
            if not confirm_capability_change and "model capability changed" in str(error):
                raise TaskConfigurationError("model_capability_changed_confirmation_required") from error
            raise
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "UPDATE server_generation_tasks SET retry_of_task_id = %s WHERE task_id = %s RETURNING *",
                    (task.task_id, created.task_id),
                )
                row = cursor.fetchone()
                record_audit_event(
                    cursor,
                    action="task.resubmitted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task.task_id, "new_task_id": created.task_id},
                )
        return self._task_from_row(row)

    def set_archived(self, user_id: str, task_id: str, *, archived: bool) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET archived_at = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (archived, task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
                record_audit_event(
                    cursor,
                    action="task.archived" if archived else "task.unarchived",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id},
                )
        return self._task_from_row(row)

    def mark_viewed(self, user_id: str, task_id: str) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
        return self._task_from_row(row)

    def set_output_selected(
        self,
        user_id: str,
        task_id: str,
        output_index: int,
        *,
        selected: bool,
    ) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        outputs = task_output_records(task)
        output_position = next(
            (
                position
                for position, output in enumerate(outputs)
                if int(output.get("index") or position + 1) == output_index
            ),
            None,
        )
        if (
            task.status not in {"completed", "partial_failed"}
            or output_position is None
            or bool(outputs[output_position].get("deleted"))
        ):
            raise TaskNotFound("task output was not found")
        outputs[output_position]["selected"] = bool(selected)
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET output_files = %s::jsonb, updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (json.dumps(outputs, separators=(",", ":")), task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
        return self._task_from_row(row)

    def accept_partial_successes(self, user_id: str, task_id: str) -> GenerationTask:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET status = 'completed', error_message = NULL,
                        request_parameters = request_parameters - 'failed_output_indices',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND status = 'partial_failed'
                      AND jsonb_array_length(COALESCE(output_files, '[]'::jsonb)) > 0
                    RETURNING *
                    """,
                    (task_id, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskConfigurationError("task has no partial successes to accept")
                record_audit_event(
                    cursor,
                    action="task.partial_successes_accepted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id},
                )
        return self._task_from_row(row)

    def delete_unselected_outputs(self, user_id: str, task_id: str) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        outputs = task_output_records(task)
        active = [dict(item) for item in outputs if not bool(item.get("deleted"))]
        existing_deleted = [dict(item) for item in outputs if bool(item.get("deleted"))]
        selected = [item for item in active if bool(item.get("selected", True))]
        removed = [item for item in active if not bool(item.get("selected", True))]
        if task.status not in {"completed", "partial_failed"} or not selected or not removed:
            raise TaskConfigurationError("select at least one result and leave at least one unselected result")
        deleted_at = datetime.now(timezone.utc)
        for index, item in enumerate(selected, start=1):
            item["index"] = index
            item["selected"] = True
        deleted_outputs = removed + existing_deleted
        for index, item in enumerate(deleted_outputs, start=len(selected) + 1):
            item["index"] = index
            item["selected"] = False
            item["deleted"] = True
            item.setdefault("deleted_at", deleted_at.isoformat())
            item.setdefault("purge_after", (deleted_at + timedelta(days=30)).isoformat())
        stored_outputs = selected + deleted_outputs
        first = selected[0]
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET output_files = %s::jsonb,
                        result_relative_path = %s,
                        thumbnail_relative_path = %s,
                        thumbnail_bytes = %s,
                        result_media_type = %s,
                        result_sha256 = %s,
                        result_bytes = %s,
                        revised_prompt = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (
                        json.dumps(stored_outputs, separators=(",", ":")),
                        first.get("relative_path"),
                        first.get("thumbnail_relative_path"),
                        first.get("thumbnail_bytes"),
                        first.get("media_type"),
                        first.get("sha256"),
                        first.get("byte_size"),
                        first.get("revised_prompt"),
                        task_id,
                        user_id,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
                cursor.execute(
                    """
                    UPDATE server_generation_task_attempts
                    SET result_relative_path = %s, result_sha256 = %s, result_bytes = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE attempt_id = (
                        SELECT attempt_id
                        FROM server_generation_task_attempts
                        WHERE task_id = %s AND status = 'completed'
                        ORDER BY attempt_number DESC
                        LIMIT 1
                    )
                    """,
                    (first.get("relative_path"), first.get("sha256"), first.get("byte_size"), task_id),
                )
                record_audit_event(
                    cursor,
                    action="task.outputs_deleted",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id, "deleted_output_count": len(removed)},
                )
        return self._task_from_row(row)

    def restore_output(self, user_id: str, task_id: str, output_index: int) -> GenerationTask:
        task = self.get_task(user_id, task_id)
        outputs = task_output_records(task)
        output_position = next(
            (
                position
                for position, output in enumerate(outputs)
                if int(output.get("index") or position + 1) == output_index
            ),
            None,
        )
        if task.status not in {"completed", "partial_failed"} or output_position is None:
            raise TaskNotFound("task output was not found")
        output = outputs[output_position]
        if not bool(output.get("deleted")) or output.get("storage_purged_at"):
            raise TaskNotFound("deleted task output was not found")
        for key in ("deleted", "deleted_at", "purge_after"):
            output.pop(key, None)
        output["selected"] = True
        active = [item for item in outputs if not bool(item.get("deleted"))]
        first = active[0]
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    UPDATE server_generation_tasks
                    SET output_files = %s::jsonb,
                        result_relative_path = %s,
                        thumbnail_relative_path = %s,
                        thumbnail_bytes = %s,
                        result_media_type = %s,
                        result_sha256 = %s,
                        result_bytes = %s,
                        revised_prompt = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE task_id = %s AND user_id = %s AND deleted_at IS NULL
                    RETURNING *
                    """,
                    (
                        json.dumps(outputs, separators=(",", ":")),
                        first.get("relative_path"),
                        first.get("thumbnail_relative_path"),
                        first.get("thumbnail_bytes"),
                        first.get("media_type"),
                        first.get("sha256"),
                        first.get("byte_size"),
                        first.get("revised_prompt"),
                        task_id,
                        user_id,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise TaskNotFound("task was not found")
                record_audit_event(
                    cursor,
                    action="task.output_restored",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"task_id": task_id, "output_index": output_index},
                )
        return self._task_from_row(row)

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

    def _release_department_reservation(
        self,
        user_id: str,
        period_start: str | None,
        units: int = 1,
    ) -> None:
        if period_start and self.departments is not None:
            try:
                self.departments.settle(user_id, period_start, units=units, consumed=False)
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
                             tasks.queue_position, tasks.created_at, tasks.task_id
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
        return self.complete_task_outputs(
            task,
            attempt_id=attempt_id,
            outputs=[(image_bytes, output_format, revised_prompt)],
        )

    def complete_task_outputs(
        self,
        task: GenerationTask,
        *,
        attempt_id: str,
        outputs: list[tuple[bytes, str, str] | tuple[bytes, str, str, dict[str, object]]],
        final_status: Literal["completed", "partial_failed"] = "completed",
        error_message: str | None = None,
        failed_output_indices: list[int] | None = None,
    ) -> GenerationTask:
        if not outputs or len(outputs) > 4:
            raise TaskConfigurationError("task output count is invalid")
        # Hold a shared lock on the maintenance row across both file and DB writes.
        # Maintenance acquisition uses FOR UPDATE and therefore waits until the
        # generated bytes and their database pointers are committed together.
        with self.connections.connect() as guard_connection:
            with guard_connection.cursor() as guard_cursor:
                assert_writes_allowed(guard_cursor)
                return self._complete_task_outputs_unlocked(
                    task,
                    attempt_id=attempt_id,
                    outputs=outputs,
                    final_status=final_status,
                    error_message=error_message,
                    failed_output_indices=failed_output_indices,
                )

    def _complete_task_outputs_unlocked(
        self,
        task: GenerationTask,
        *,
        attempt_id: str,
        outputs: list[tuple[bytes, str, str] | tuple[bytes, str, str, dict[str, object]]],
        final_status: Literal["completed", "partial_failed"],
        error_message: str | None,
        failed_output_indices: list[int] | None,
    ) -> GenerationTask:
        output_files: list[dict[str, object]] = []
        written_paths: list[Path] = []
        for fallback_index, output in enumerate(outputs, start=1):
            image_bytes, output_format, revised_prompt = output[:3]
            output_metadata = output[3] if len(output) > 3 else {}
            output_index = int(output_metadata.get("index") or fallback_index)
            suffix = "" if output_index == 1 else f"-{output_index}"
            relative_path = (
                Path("tasks") / task.user_id / task.task_id
                / f"attempt-{attempt_id}{suffix}.{_safe_extension(output_format)}"
            )
            absolute_path = self.data_root / relative_path
            absolute_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
            temporary_path.write_bytes(image_bytes)
            temporary_path.replace(absolute_path)
            written_paths.append(absolute_path)
            thumbnail_relative_path = self._write_thumbnail(
                task,
                image_bytes,
                output_index=output_index,
                attempt_id=attempt_id,
            )
            thumbnail_bytes = (
                (self.data_root / thumbnail_relative_path).stat().st_size
                if thumbnail_relative_path
                else 0
            )
            if thumbnail_relative_path:
                written_paths.append(self.data_root / thumbnail_relative_path)
            output_files.append(
                {
                    "index": output_index,
                    "relative_path": relative_path.as_posix(),
                    "thumbnail_relative_path": thumbnail_relative_path,
                    "media_type": _media_type(output_format),
                    "sha256": hashlib.sha256(image_bytes).hexdigest(),
                    "byte_size": len(image_bytes),
                    "thumbnail_bytes": thumbnail_bytes,
                    "revised_prompt": revised_prompt,
                    "output_format": _safe_extension(output_format),
                    "selected": True,
                    **(
                        {"seed": output_metadata.get("seed")}
                        if output_metadata.get("seed") is not None
                        else {}
                    ),
                }
            )
        first = output_files[0]

        def cleanup_outputs() -> None:
            for path in written_paths:
                path.unlink(missing_ok=True)

        try:
            with self.connections.connect() as connection:
                with connection.cursor(row_factory=dict_row) as cursor:
                    assert_writes_allowed(cursor)
                    if self.assets is not None:
                        self.assets.ensure_capacity_cursor(
                            cursor,
                            task.user_id,
                            sum(int(item["byte_size"]) + int(item["thumbnail_bytes"]) for item in output_files),
                        )
                    cursor.execute(
                        """
                        UPDATE server_generation_tasks
                        SET status = %s, result_relative_path = %s,
                            thumbnail_relative_path = %s,
                            thumbnail_bytes = %s,
                            result_media_type = %s, result_sha256 = %s,
                            result_bytes = %s, revised_prompt = %s, output_files = %s::jsonb,
                            error_message = %s,
                            request_parameters = request_parameters || %s::jsonb,
                            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE task_id = %s AND status = 'running' AND cancel_requested = FALSE
                          AND EXISTS (
                              SELECT 1 FROM server_generation_task_attempts
                              WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                          )
                        RETURNING *
                        """,
                        (
                            final_status,
                            first["relative_path"],
                            first["thumbnail_relative_path"],
                            first["thumbnail_bytes"],
                            first["media_type"],
                            first["sha256"],
                            first["byte_size"],
                            first["revised_prompt"],
                            json.dumps(output_files, separators=(",", ":")),
                            " ".join(str(error_message or "").split())[:2000] or None,
                            json.dumps(
                                {"failed_output_indices": list(failed_output_indices or [])},
                                separators=(",", ":"),
                            ),
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
                        cleanup_outputs()
                        return self._task_from_row(row)
                    cursor.execute(
                        """
                        UPDATE server_generation_task_attempts
                        SET status = %s, completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP, result_relative_path = %s,
                            result_sha256 = %s, result_bytes = %s, error_message = %s
                        WHERE attempt_id = %s AND task_id = %s AND status = 'running'
                        """,
                        (
                            final_status,
                            first["relative_path"],
                            first["sha256"],
                            sum(int(item["byte_size"]) for item in output_files),
                            " ".join(str(error_message or "").split())[:2000] or None,
                            attempt_id,
                            task.task_id,
                        ),
                    )
                    record_audit_event(
                        cursor,
                        action="task.completed" if final_status == "completed" else "task.partial_failed",
                        actor_user_id=None,
                        subject_user_id=task.user_id,
                        details={
                            "task_id": task.task_id,
                            "result_sha256": first["sha256"],
                            "output_count": len(output_files),
                        },
                    )
        except (AssetNotFound, AssetQuotaExceeded, AssetValidationError) as error:
            cleanup_outputs()
            raise TaskConfigurationError(str(error)) from error
        except TaskNotFound:
            cleanup_outputs()
            raise
        except Exception:
            cleanup_outputs()
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

    def result_path(self, task: GenerationTask, output_index: int = 1) -> Path:
        output = task_output_records(task)
        if (
            output_index < 1
            or output_index > len(output)
            or bool(output[output_index - 1].get("deleted"))
        ):
            raise TaskNotFound("task output was not found")
        relative_path = str(output[output_index - 1]["relative_path"])
        if output_index == 1 and task.result_relative_path and relative_path != task.result_relative_path:
            raise TaskNotFound("task output metadata is inconsistent")
        return self._artifact_path(task, relative_path)

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

    def thumbnail_path(self, task: GenerationTask, output_index: int = 1) -> Path:
        output = task_output_records(task)
        if (
            output_index < 1
            or output_index > len(output)
            or bool(output[output_index - 1].get("deleted"))
        ):
            raise TaskNotFound("task thumbnail was not found")
        relative_path = str(output[output_index - 1].get("thumbnail_relative_path") or "")
        if not relative_path:
            raise TaskNotFound("task has no thumbnail")
        if output_index == 1 and task.thumbnail_relative_path and relative_path != task.thumbnail_relative_path:
            raise TaskNotFound("task thumbnail metadata is inconsistent")
        return self._artifact_path(task, relative_path)

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

    def _write_thumbnail(
        self,
        task: GenerationTask,
        image_bytes: bytes,
        *,
        output_index: int = 1,
        attempt_id: str = "",
    ) -> str | None:
        relative_path = (
            Path("tasks") / task.user_id / f"{task.task_id}.thumb.jpg"
            if output_index == 1
            else Path("tasks") / task.user_id / task.task_id
            / f"attempt-{attempt_id}-{output_index}.thumb.jpg"
        )
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
            generation_model_id=row.get("generation_model_id"),
            model_display_name=str(row.get("model_display_name") or row["model_id"]),
            model_id=row["model_id"],
            capability_profile_id=str(row.get("capability_profile_id") or "generic-basic"),
            capability_profile_version=int(row.get("capability_profile_version") or 1),
            capability_snapshot=dict(row.get("capability_snapshot") or {}),
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
            output_files=row.get("output_files") or [],
            revised_prompt=row["revised_prompt"],
            error_message=row["error_message"],
            created_at=row["created_at"].isoformat(),
            started_at=row["started_at"].isoformat() if row["started_at"] else None,
            completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
            updated_at=row["updated_at"].isoformat(),
            deleted_at=row.get("deleted_at").isoformat() if row.get("deleted_at") else None,
            purge_after=row.get("purge_after").isoformat() if row.get("purge_after") else None,
            storage_purged_at=(
                row.get("storage_purged_at").isoformat() if row.get("storage_purged_at") else None
            ),
            cancel_requested=bool(row.get("cancel_requested", False)),
            cancel_requested_at=(
                row.get("cancel_requested_at").isoformat() if row.get("cancel_requested_at") else None
            ),
            cancelled_at=row.get("cancelled_at").isoformat() if row.get("cancelled_at") else None,
            quota_units=int(row.get("quota_units") or 1),
            quota_period_start=row.get("quota_period_start").isoformat() if row.get("quota_period_start") else None,
            archived_at=row.get("archived_at").isoformat() if row.get("archived_at") else None,
            viewed_at=row.get("viewed_at").isoformat() if row.get("viewed_at") else None,
            retry_of_task_id=row.get("retry_of_task_id"),
            queue_position=int(row.get("queue_position") or 1),
        )


def task_output_records(task: GenerationTask) -> list[dict[str, object]]:
    records = [dict(item) for item in task.output_files if isinstance(item, dict)]
    for record in records:
        record.setdefault("selected", True)
    records.sort(key=lambda item: int(item.get("index") or 0))
    if records:
        return records
    if not task.result_relative_path:
        return []
    return [
        {
            "index": 1,
            "relative_path": task.result_relative_path,
            "thumbnail_relative_path": task.thumbnail_relative_path,
            "media_type": task.result_media_type,
            "sha256": task.result_sha256,
            "byte_size": task.result_bytes,
            "thumbnail_bytes": task.thumbnail_bytes,
            "revised_prompt": task.revised_prompt,
            "output_format": _safe_extension(str(task.request_parameters.get("output_format") or "png")),
            "selected": True,
        }
    ]


def _model_is_allowed(models: object, model_id: str) -> bool:
    model = _resolve_generation_model(models, model_id)
    return model is not None and bool(model.get("is_enabled", True))


def _resolve_generation_model(models: object, model_id: str) -> dict[str, object] | None:
    if not isinstance(models, list):
        return None
    matches = [
        model
        for model in models
        if isinstance(model, dict)
        and model.get("model_id") == model_id
        and (
            "capability_profile_id" in model
            or "image_generation" in model.get("capabilities", [])
        )
    ]
    if len(matches) != 1:
        return None
    return cast(dict[str, object], matches[0])


def _validated_task_parameters(
    value: dict[str, object],
    profile: dict[str, object],
    *,
    reference_image_count: int,
) -> dict[str, object]:
    parameters = dict(value)
    mode = str(parameters.get("mode") or "generate")
    supported_modes = [str(item) for item in profile.get("task_modes", [])]
    if mode not in supported_modes:
        raise TaskConfigurationError("selected model does not support this task mode")
    maximum_references = int(profile.get("max_reference_images") or 0)
    if reference_image_count > maximum_references:
        raise TaskConfigurationError(
            f"selected model supports at most {maximum_references} reference images"
        )

    size = str(parameters.get("size") or profile.get("default_size") or "")
    supported_sizes = [str(item) for item in profile.get("sizes", [])]
    if size not in supported_sizes:
        if not bool(profile.get("custom_size")):
            raise TaskConfigurationError("selected model does not support this output size")
        try:
            width_text, height_text = size.lower().split("x", 1)
            width, height = int(width_text), int(height_text)
        except (TypeError, ValueError) as error:
            raise TaskConfigurationError("output size is invalid") from error
        constraints = profile.get("size_constraints")
        constraints = constraints if isinstance(constraints, dict) else {}
        minimum = int(constraints.get("min_dimension") or 1)
        maximum = int(constraints.get("max_dimension") or 32768)
        aspect = width / height if height else 0
        if (
            width < minimum
            or height < minimum
            or width > maximum
            or height > maximum
            or aspect < float(constraints.get("min_aspect_ratio") or 0)
            or aspect > float(constraints.get("max_aspect_ratio") or 1_000_000)
        ):
            raise TaskConfigurationError("selected model does not support this output size")
    parameters["size"] = size

    output_format = str(
        parameters.get("output_format") or profile.get("default_output_format") or "png"
    ).lower()
    if output_format not in [str(item) for item in profile.get("output_formats", [])]:
        raise TaskConfigurationError("selected model does not support this output format")
    parameters["output_format"] = output_format
    try:
        output_count = int(parameters.get("n") or 1)
    except (TypeError, ValueError) as error:
        raise TaskConfigurationError("output count is invalid") from error
    if output_count < int(profile.get("min_output_count") or 1) or output_count > int(
        profile.get("max_output_count") or 1
    ):
        raise TaskConfigurationError("selected model does not support this output count")
    parameters["n"] = output_count

    prompt_mode = str(parameters.get("prompt_optimization_mode") or "off").lower()
    prompt_modes = [str(item) for item in profile.get("prompt_optimization_modes", [])]
    if prompt_mode != "off" and prompt_mode not in prompt_modes:
        raise TaskConfigurationError("selected model does not support this prompt optimization mode")
    parameters["prompt_optimization_mode"] = prompt_mode

    seed_profile = profile.get("seed")
    seed_profile = seed_profile if isinstance(seed_profile, dict) else {}
    seed_mode = str(parameters.get("seed_mode") or "random").lower()
    if seed_mode not in {"random", "fixed", "unsupported"}:
        raise TaskConfigurationError("seed mode is invalid")
    if seed_profile.get("supported"):
        if seed_mode == "unsupported":
            seed_mode = "random"
        minimum_seed = int(seed_profile.get("minimum") or 0)
        maximum_seed = int(seed_profile.get("maximum") or 2147483647)
        if seed_mode == "random":
            if parameters.get("retry_of_task_id") and parameters.get("seed") not in {None, ""}:
                seed = int(parameters["seed"])
            else:
                seed = secrets.randbelow(maximum_seed - minimum_seed + 1) + minimum_seed
        else:
            try:
                seed = int(parameters.get("seed"))
            except (TypeError, ValueError) as error:
                raise TaskConfigurationError("seed must be an integer") from error
            if seed < minimum_seed or seed > maximum_seed:
                raise TaskConfigurationError("seed is outside the supported range")
        parameters["seed_mode"] = seed_mode
        parameters["seed"] = seed
    else:
        if seed_mode == "fixed" or parameters.get("seed") not in {None, ""}:
            raise TaskConfigurationError("selected model does not support seed")
        parameters.pop("seed", None)
        parameters["seed_mode"] = "unsupported"

    parameters["watermark"] = False
    parameters["capability_profile_version"] = int(profile.get("version") or 1)
    return parameters


def _safe_extension(output_format: str) -> str:
    return output_format if output_format in {"png", "jpeg", "webp"} else "png"


def _media_type(output_format: str) -> str:
    return {"jpeg": "image/jpeg", "webp": "image/webp"}.get(output_format, "image/png")

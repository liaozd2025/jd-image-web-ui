from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import subprocess
from typing import Any
from urllib.parse import quote, unquote, urlsplit, urlunsplit

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections


class MaintenanceLockError(RuntimeError):
    pass


@dataclass(frozen=True)
class MaintenanceLock:
    token: str
    purpose: str


def assert_writes_allowed(cursor: Any) -> None:
    """Serialize data writes with maintenance lock acquisition.

    The HTTP middleware protects browser requests, but the Worker and ops code
    write through repositories directly. A shared row lock makes an in-flight
    worker write finish before maintenance starts and blocks subsequent writes
    until the lock is released.
    """
    cursor.execute("SELECT locked FROM server_maintenance_lock WHERE singleton FOR SHARE")
    row = cursor.fetchone()
    locked = row.get("locked") if isinstance(row, dict) else (row[0] if row is not None else False)
    if locked:
        raise MaintenanceLockError("maintenance is in progress")


def acquire_lock(connections: PostgresConnections, *, purpose: str) -> MaintenanceLock:
    token = secrets.token_urlsafe(24)
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT locked FROM server_maintenance_lock WHERE singleton FOR UPDATE")
            row = cursor.fetchone()
            if row is None:
                raise MaintenanceLockError("maintenance lock is not initialized")
            if row[0]:
                raise MaintenanceLockError("maintenance lock is already held")
            cursor.execute(
                """
                UPDATE server_maintenance_lock
                SET locked = TRUE, lock_token = %s, purpose = %s,
                    acquired_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE singleton
                """,
                (token, purpose[:200]),
            )
    return MaintenanceLock(token=token, purpose=purpose[:200])


def release_lock(connections: PostgresConnections, token: str) -> None:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE server_maintenance_lock
                SET locked = FALSE, lock_token = NULL, purpose = NULL,
                    acquired_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE singleton AND locked AND lock_token = %s
                """,
                (token,),
            )
            if cursor.rowcount != 1:
                raise MaintenanceLockError("maintenance lock token is invalid")


def force_release_lock(connections: PostgresConnections) -> None:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE server_maintenance_lock
                SET locked = FALSE, lock_token = NULL, purpose = NULL,
                    acquired_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE singleton AND locked
                """
            )


def is_locked(connections: PostgresConnections) -> bool:
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT locked FROM server_maintenance_lock WHERE singleton")
            row = cursor.fetchone()
    return bool(row and row[0])


def create_backup(
    connections: PostgresConnections,
    *,
    data_root: Path,
    output_root: Path,
) -> dict[str, object]:
    data_root = data_root.resolve()
    output_root = output_root.resolve()
    if data_root == output_root or data_root in output_root.parents:
        raise MaintenanceLockError("backup output must be outside the server data root")
    output_root.mkdir(parents=True, exist_ok=True)
    output_root.chmod(0o700)
    dump_path = output_root / "database.dump"
    try:
        subprocess.run(
            ["pg_dump", "--format=custom", "--file", str(dump_path), _safe_database_url(connections.database_url)],
            check=True,
            capture_output=True,
            text=True,
            env=_database_client_environment(connections.database_url),
        )
    except FileNotFoundError as error:
        raise MaintenanceLockError("pg_dump is required for database backup") from error
    except subprocess.CalledProcessError as error:
        raise MaintenanceLockError("database backup failed") from error
    manifest_files: list[dict[str, object]] = []
    if data_root.exists():
        for path in sorted(path for path in data_root.rglob("*") if path.is_file()):
            if path.is_symlink():
                raise MaintenanceLockError(f"symbolic link is not allowed in data volume: {path}")
            relative = path.relative_to(data_root).as_posix()
            digest = _sha256(path)
            destination = output_root / "files" / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            destination.chmod(0o600)
            manifest_files.append({"path": relative, "bytes": path.stat().st_size, "sha256": digest})
    manifest = {
        "format": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database_dump": {"path": dump_path.name, "bytes": dump_path.stat().st_size, "sha256": _sha256(dump_path)},
        "files": manifest_files,
    }
    manifest_path = output_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dump_path.chmod(0o600)
    manifest_path.chmod(0o600)
    return manifest


def restore_backup(
    connections: PostgresConnections,
    *,
    backup_root: Path,
    data_root: Path,
    maintenance_token: str | None = None,
) -> dict[str, int]:
    backup_root = backup_root.resolve()
    data_root = data_root.resolve()
    if backup_root == data_root or backup_root in data_root.parents or data_root in backup_root.parents:
        raise MaintenanceLockError("backup root must be separate from the server data root")
    manifest_path = backup_root / "manifest.json"
    if not manifest_path.is_file():
        raise MaintenanceLockError("backup manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    dump = _safe_child_path(backup_root, manifest.get("database_dump", {}).get("path", "database.dump"))
    if not dump.is_file() or _sha256(dump) != manifest.get("database_dump", {}).get("sha256"):
        raise MaintenanceLockError("database dump checksum mismatch")
    for item in manifest.get("files", []):
        source = _safe_child_path(backup_root / "files", item["path"])
        if source.is_symlink():
            raise MaintenanceLockError(f"backup file must not be a symbolic link: {item['path']}")
        if not source.is_file() or _sha256(source) != item["sha256"]:
            raise MaintenanceLockError(f"backup file checksum mismatch: {item['path']}")
    try:
        subprocess.run(
            [
                "pg_restore", "--clean", "--if-exists", "--no-owner",
                "--dbname", _safe_database_url(connections.database_url), str(dump),
            ],
            check=True,
            capture_output=True,
            text=True,
            env=_database_client_environment(connections.database_url),
        )
    except FileNotFoundError as error:
        raise MaintenanceLockError("pg_restore is required for database restore") from error
    except subprocess.CalledProcessError as error:
        raise MaintenanceLockError("database restore failed") from error
    manifest_paths = {str(item["path"]) for item in manifest.get("files", [])}
    removed = 0
    for root_name in ("assets", "shared-assets", "tasks"):
        root = data_root / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.is_symlink():
                continue
            if path.relative_to(data_root).as_posix() not in manifest_paths:
                path.unlink()
                removed += 1
    restored = 0
    for item in manifest.get("files", []):
        source = _safe_child_path(backup_root / "files", item["path"])
        target = _safe_child_path(data_root, item["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        target.chmod(0o600)
        restored += 1
    if maintenance_token:
        with connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE server_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE revoked_at IS NULL"
                )
                cursor.execute(
                    """
                    UPDATE server_maintenance_lock
                    SET locked = TRUE, lock_token = %s, purpose = 'restore backup',
                        acquired_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE singleton
                    """,
                    (maintenance_token,),
                )
    return {"files": restored, "removed": removed, "sessions_revoked": 1}


def reconcile_storage(connections: PostgresConnections, *, data_root: Path) -> dict[str, object]:
    expected: dict[str, str] = {}
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            for table, column in (
                ("server_asset_versions", "stored_relative_path"),
                ("server_shared_asset_versions", "stored_relative_path"),
                ("server_generation_tasks", "input_relative_path"),
                ("server_generation_tasks", "result_relative_path"),
                ("server_generation_tasks", "thumbnail_relative_path"),
                ("server_generation_task_attempts", "result_relative_path"),
            ):
                if table == "server_asset_versions":
                    condition = "{column} IS NOT NULL AND EXISTS (SELECT 1 FROM server_assets WHERE server_assets.asset_id = server_asset_versions.asset_id AND server_assets.storage_purged_at IS NULL)".format(column=column)
                elif table == "server_generation_tasks":
                    condition = "{column} IS NOT NULL AND storage_purged_at IS NULL".format(column=column)
                elif table == "server_generation_task_attempts":
                    condition = "{column} IS NOT NULL AND EXISTS (SELECT 1 FROM server_generation_tasks WHERE server_generation_tasks.task_id = server_generation_task_attempts.task_id AND server_generation_tasks.storage_purged_at IS NULL)".format(column=column)
                else:
                    condition = f"{column} IS NOT NULL"
                cursor.execute(f"SELECT {column} FROM {table} WHERE {condition}")
                for (relative_path,) in cursor.fetchall():
                    expected[str(relative_path)] = table
            cursor.execute(
                """
                SELECT output_files
                FROM server_generation_tasks
                WHERE storage_purged_at IS NULL
                """
            )
            for (output_files,) in cursor.fetchall():
                for item in output_files or []:
                    if not isinstance(item, dict):
                        continue
                    for key in ("relative_path", "thumbnail_relative_path"):
                        if item.get(key):
                            expected[str(item[key])] = "server_generation_tasks"
            cursor.execute(
                """
                SELECT COUNT(*) FROM server_assets
                WHERE deleted_at IS NOT NULL AND purge_after <= CURRENT_TIMESTAMP
                  AND storage_purged_at IS NULL
                """
            )
            expired_assets = int(cursor.fetchone()[0])
            cursor.execute(
                """
                SELECT COUNT(*) FROM server_generation_tasks
                WHERE deleted_at IS NOT NULL AND purge_after <= CURRENT_TIMESTAMP
                  AND storage_purged_at IS NULL
                """
            )
            expired_tasks = int(cursor.fetchone()[0])
    missing = [path for path in sorted(expected) if not (data_root / path).is_file()]
    known_roots = {"assets", "shared-assets", "tasks"}
    files = {
        path.relative_to(data_root).as_posix()
        for path in data_root.rglob("*")
        if path.is_file() and not path.is_symlink()
        and path.relative_to(data_root).parts
        and path.relative_to(data_root).parts[0] in known_roots
    }
    orphaned = sorted(files - set(expected))
    return {
        "missing": [{"path": path, "table": expected[path]} for path in missing],
        "orphaned": orphaned,
        "expired": {"assets": expired_assets, "tasks": expired_tasks},
    }


def purge_expired_trash(connections: PostgresConnections, *, data_root: Path) -> dict[str, int]:
    report = reconcile_storage(connections, data_root=data_root)
    removed_files = 0
    paths: list[str] = []
    asset_paths: dict[str, list[str]] = {}
    task_paths: dict[str, list[str]] = {}
    with connections.connect() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT asset_id, stored_relative_path
                FROM server_asset_versions
                JOIN server_assets USING (asset_id)
                WHERE server_assets.deleted_at IS NOT NULL
                  AND server_assets.purge_after <= CURRENT_TIMESTAMP
                  AND server_assets.storage_purged_at IS NULL
                """
            )
            for row in cursor.fetchall():
                relative = row["stored_relative_path"]
                paths.append(relative)
                asset_paths.setdefault(row["asset_id"], []).append(relative)
            cursor.execute(
                """
                SELECT task_id, input_relative_path, result_relative_path, thumbnail_relative_path, output_files
                FROM server_generation_tasks
                WHERE deleted_at IS NOT NULL AND purge_after <= CURRENT_TIMESTAMP
                  AND storage_purged_at IS NULL
                """
            )
            for row in cursor.fetchall():
                task_values = [
                    value
                    for key, value in row.items()
                    if key not in {"task_id", "output_files"} and value
                ]
                for item in row.get("output_files") or []:
                    if not isinstance(item, dict):
                        continue
                    task_values.extend(
                        str(item[key])
                        for key in ("relative_path", "thumbnail_relative_path")
                        if item.get(key)
                    )
                task_paths[row["task_id"]] = task_values
                paths.extend(task_values)
            cursor.execute(
                """
                SELECT attempts.task_id, attempts.result_relative_path
                FROM server_generation_task_attempts AS attempts
                JOIN server_generation_tasks AS tasks ON tasks.task_id = attempts.task_id
                WHERE attempts.result_relative_path IS NOT NULL
                  AND tasks.deleted_at IS NOT NULL
                  AND tasks.purge_after <= CURRENT_TIMESTAMP
                  AND tasks.storage_purged_at IS NULL
                """
            )
            for row in cursor.fetchall():
                if row["result_relative_path"]:
                    task_paths.setdefault(row["task_id"], []).append(row["result_relative_path"])
                    paths.append(row["result_relative_path"])
    root = data_root.resolve()
    for relative in paths:
        path = (data_root / str(relative)).resolve()
        if path == root or root not in path.parents or path.is_symlink():
            continue
        try:
            if path.is_file():
                path.unlink()
                removed_files += 1
        except OSError:
            continue
    with connections.connect() as connection:
        with connection.cursor() as cursor:
            purgeable_assets = [
                asset_id for asset_id, values in asset_paths.items()
                if all(not (data_root / value).exists() for value in values)
            ]
            purgeable_tasks = [
                task_id for task_id, values in task_paths.items()
                if all(not (data_root / value).exists() for value in values)
            ]
            cursor.execute(
                """
                UPDATE server_assets
                SET storage_purged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE deleted_at IS NOT NULL AND purge_after <= CURRENT_TIMESTAMP
                  AND storage_purged_at IS NULL
                  AND asset_id = ANY(%s)
                """
                , (purgeable_assets,)
            )
            purged_assets = cursor.rowcount
            cursor.execute(
                """
                UPDATE server_generation_tasks
                SET storage_purged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE deleted_at IS NOT NULL AND purge_after <= CURRENT_TIMESTAMP
                  AND storage_purged_at IS NULL
                  AND task_id = ANY(%s)
                """
                , (purgeable_tasks,)
            )
            purged_tasks = cursor.rowcount
            record_audit_event(
                cursor,
                action="maintenance.trash_purged",
                actor_user_id=None,
                subject_user_id=None,
                details={"removed_files": removed_files, "assets": purged_assets, "tasks": purged_tasks},
            )
    return {"removed_files": removed_files, "assets": purged_assets, "tasks": purged_tasks, "before": report}


def _safe_child_path(root: Path, raw_path: object) -> Path:
    value = str(raw_path or "")
    relative = Path(value)
    if not value or relative.is_absolute() or ".." in relative.parts:
        raise MaintenanceLockError("backup manifest contains an unsafe path")
    root = root.resolve()
    candidate = (root / relative).resolve()
    if candidate != root and root not in candidate.parents:
        raise MaintenanceLockError("backup manifest path escapes its root")
    return candidate


def _safe_database_url(database_url: str) -> str:
    parts = urlsplit(database_url)
    if not parts.password:
        return database_url
    username = quote(unquote(parts.username or ""), safe="")
    host = parts.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = username
    if host:
        netloc += f"@{host}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _database_client_environment(database_url: str) -> dict[str, str]:
    import os

    environment = os.environ.copy()
    password = urlsplit(database_url).password
    if password is not None:
        environment["PGPASSWORD"] = unquote(password)
    return environment


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

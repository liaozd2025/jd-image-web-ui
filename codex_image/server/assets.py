from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
from typing import Any, Literal, cast
from uuid import uuid4

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections


AssetKind = Literal["image", "reference", "template", "prompt"]
ASSET_KINDS = {"image", "reference", "template", "prompt"}
MAX_ASSET_BYTES = 20 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


class AssetNotFound(RuntimeError):
    pass


class AssetValidationError(RuntimeError):
    pass


class AssetQuotaExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class AssetVersion:
    asset_version_id: str
    asset_id: str
    user_id: str
    version_number: int
    original_filename: str
    mime_type: str
    stored_relative_path: str
    sha256: str
    byte_size: int
    created_at: str


@dataclass(frozen=True)
class Asset:
    asset_id: str
    user_id: str
    asset_kind: AssetKind
    name: str
    current_version_id: str | None
    deleted_at: str | None
    created_at: str
    updated_at: str
    current_version: AssetVersion | None


@dataclass(frozen=True)
class AssetQuota:
    quota_bytes: int
    used_bytes: int
    available_bytes: int


class AssetRepository:
    def __init__(self, connections: PostgresConnections, data_root: Path) -> None:
        self.connections = connections
        self.data_root = data_root

    def create_asset(
        self,
        user_id: str,
        *,
        asset_kind: str,
        name: str,
        original_filename: str,
        mime_type: str,
        content: bytes,
    ) -> Asset:
        kind = _validate_kind(asset_kind)
        clean_name = _clean_name(name or original_filename)
        filename = _clean_filename(original_filename)
        normalized_mime = _normalize_mime(mime_type)
        _validate_content(kind, normalized_mime, content)
        asset_id = str(uuid4())
        version_id = str(uuid4())
        relative_path = Path("assets") / user_id / asset_id / f"{version_id}.bin"
        absolute_path = self.data_root / relative_path
        self._ensure_quota_and_write(
            user_id,
            byte_size=len(content),
            relative_path=relative_path,
            content=content,
            operation="asset.created",
            audit_details={"asset_id": asset_id, "asset_version_id": version_id, "asset_kind": kind},
            insert=lambda cursor: self._insert_new_asset(
                cursor,
                asset_id=asset_id,
                version_id=version_id,
                user_id=user_id,
                kind=kind,
                name=clean_name,
                filename=filename,
                mime_type=normalized_mime,
                relative_path=relative_path,
                content=content,
            ),
        )
        return self.get_asset(user_id, asset_id)

    def create_version(
        self,
        user_id: str,
        asset_id: str,
        *,
        original_filename: str,
        mime_type: str,
        content: bytes,
    ) -> Asset:
        filename = _clean_filename(original_filename)
        normalized_mime = _normalize_mime(mime_type)
        version_id = str(uuid4())
        relative_path = Path("assets") / user_id / asset_id / f"{version_id}.bin"
        result: dict[str, object] = {}

        def insert(cursor: Any) -> None:
            cursor.execute(
                """
                SELECT asset_kind, name, deleted_at
                FROM server_assets
                WHERE asset_id = %s AND user_id = %s
                FOR UPDATE
                """,
                (asset_id, user_id),
            )
            asset = cursor.fetchone()
            if asset is None or asset["deleted_at"] is not None:
                raise AssetNotFound("asset was not found")
            kind = cast(AssetKind, asset["asset_kind"])
            _validate_content(kind, normalized_mime, content)
            cursor.execute(
                "SELECT COALESCE(MAX(version_number), 0) FROM server_asset_versions WHERE asset_id = %s",
                (asset_id,),
            )
            version_number = int(cursor.fetchone()[0]) + 1
            cursor.execute(
                """
                INSERT INTO server_asset_versions (
                    asset_version_id, asset_id, user_id, version_number,
                    original_filename, mime_type, stored_relative_path, sha256, byte_size
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    version_id,
                    asset_id,
                    user_id,
                    version_number,
                    filename,
                    normalized_mime,
                    relative_path.as_posix(),
                    hashlib.sha256(content).hexdigest(),
                    len(content),
                ),
            )
            cursor.execute(
                """
                UPDATE server_assets
                SET current_version_id = %s, updated_at = CURRENT_TIMESTAMP
                WHERE asset_id = %s AND user_id = %s
                """,
                (version_id, asset_id, user_id),
            )
            result["version_id"] = version_id

        self._ensure_quota_and_write(
            user_id,
            byte_size=len(content),
            relative_path=relative_path,
            content=content,
            operation="asset.version_created",
            audit_details={"asset_id": asset_id, "asset_version_id": version_id},
            insert=insert,
        )
        return self.get_asset(user_id, asset_id)

    def list_assets(
        self,
        user_id: str,
        *,
        kind: AssetKind | None = None,
        include_deleted: bool = False,
        limit: int = 50,
    ) -> list[Asset]:
        clauses = ["assets.user_id = %s"]
        params: list[object] = [user_id]
        if not include_deleted:
            clauses.append("assets.deleted_at IS NULL")
        if kind is not None:
            clauses.append("assets.asset_kind = %s")
            params.append(kind)
        params.append(limit)
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT assets.*, versions.asset_version_id AS current_asset_version_id,
                           versions.asset_id AS version_asset_id, versions.user_id AS version_user_id,
                           versions.version_number, versions.original_filename, versions.mime_type,
                           versions.stored_relative_path, versions.sha256, versions.byte_size,
                           versions.created_at AS version_created_at
                    FROM server_assets AS assets
                    LEFT JOIN server_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    WHERE {' AND '.join(clauses)}
                    ORDER BY assets.updated_at DESC, assets.asset_id DESC
                    LIMIT %s
                    """,
                    params,
                )
                return [self._asset_from_row(row) for row in cursor.fetchall()]

    def get_asset(self, user_id: str, asset_id: str, *, include_deleted: bool = False) -> Asset:
        condition = "" if include_deleted else "AND assets.deleted_at IS NULL"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT assets.*, versions.asset_version_id AS current_asset_version_id,
                           versions.asset_id AS version_asset_id, versions.user_id AS version_user_id,
                           versions.version_number, versions.original_filename, versions.mime_type,
                           versions.stored_relative_path, versions.sha256, versions.byte_size,
                           versions.created_at AS version_created_at
                    FROM server_assets AS assets
                    LEFT JOIN server_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    WHERE assets.asset_id = %s AND assets.user_id = %s {condition}
                    """,
                    (asset_id, user_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise AssetNotFound("asset was not found")
        return self._asset_from_row(row)

    def get_version(
        self,
        user_id: str,
        asset_version_id: str,
        *,
        include_deleted: bool = False,
    ) -> AssetVersion:
        condition = "" if include_deleted else "AND assets.deleted_at IS NULL"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT versions.*
                    FROM server_asset_versions AS versions
                    JOIN server_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.asset_version_id = %s AND versions.user_id = %s {condition}
                    """,
                    (asset_version_id, user_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise AssetNotFound("asset version was not found")
        return self._version_from_row(row)

    def list_versions(self, user_id: str, asset_id: str, *, include_deleted: bool = False) -> list[AssetVersion]:
        condition = "" if include_deleted else "AND assets.deleted_at IS NULL"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT versions.*
                    FROM server_asset_versions AS versions
                    JOIN server_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.asset_id = %s AND versions.user_id = %s {condition}
                    ORDER BY versions.version_number DESC
                    """,
                    (asset_id, user_id),
                )
                return [self._version_from_row(row) for row in cursor.fetchall()]

    def soft_delete(self, user_id: str, asset_id: str) -> Asset:
        self._set_deleted(user_id, asset_id, deleted=True)
        return self.get_asset(user_id, asset_id, include_deleted=True)

    def restore(self, user_id: str, asset_id: str) -> Asset:
        self._set_deleted(user_id, asset_id, deleted=False)
        return self.get_asset(user_id, asset_id)

    def quota(self, user_id: str) -> AssetQuota:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT users.storage_quota_bytes,
                           COALESCE(SUM(versions.byte_size), 0)
                    FROM server_users AS users
                    LEFT JOIN server_asset_versions AS versions ON versions.user_id = users.user_id
                    WHERE users.user_id = %s
                    GROUP BY users.storage_quota_bytes
                    """,
                    (user_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise AssetNotFound("user was not found")
        quota, used = max(0, int(row[0])), max(0, int(row[1]))
        return AssetQuota(quota_bytes=quota, used_bytes=used, available_bytes=max(0, quota - used))

    def resolve_versions(self, user_id: str, asset_version_ids: list[str]) -> list[dict[str, object]]:
        if not asset_version_ids:
            return []
        if len(asset_version_ids) > 16 or len(set(asset_version_ids)) != len(asset_version_ids):
            raise AssetValidationError("too many or duplicate asset versions")
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT versions.asset_version_id, versions.asset_id, versions.version_number,
                           versions.original_filename, versions.mime_type, versions.stored_relative_path,
                           versions.sha256, versions.byte_size, assets.asset_kind, assets.name
                    FROM server_asset_versions AS versions
                    JOIN server_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.user_id = %s
                      AND versions.asset_version_id = ANY(%s)
                      AND assets.deleted_at IS NULL
                    """,
                    (user_id, asset_version_ids),
                )
                rows = {row["asset_version_id"]: row for row in cursor.fetchall()}
        if len(rows) != len(asset_version_ids):
            raise AssetNotFound("one or more asset versions were not found")
        return [
            {
                "asset_version_id": rows[version_id]["asset_version_id"],
                "asset_id": rows[version_id]["asset_id"],
                "version_number": rows[version_id]["version_number"],
                "asset_kind": rows[version_id]["asset_kind"],
                "name": rows[version_id]["name"],
                "original_filename": rows[version_id]["original_filename"],
                "mime_type": rows[version_id]["mime_type"],
                "stored_relative_path": rows[version_id]["stored_relative_path"],
                "sha256": rows[version_id]["sha256"],
                "byte_size": rows[version_id]["byte_size"],
            }
            for version_id in asset_version_ids
        ]

    def asset_path(self, version: AssetVersion) -> Path:
        root = self.data_root.resolve()
        asset_root = (root / "assets" / version.user_id / version.asset_id).resolve()
        path = (root / version.stored_relative_path).resolve()
        if path.parent != asset_root or not path.name.startswith(f"{version.asset_version_id}."):
            raise AssetNotFound("asset path is invalid")
        return path

    def _ensure_quota_and_write(
        self,
        user_id: str,
        *,
        byte_size: int,
        relative_path: Path,
        content: bytes,
        operation: str,
        audit_details: dict[str, object],
        insert: Any,
    ) -> None:
        absolute_path = self.data_root / relative_path
        temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
        with self.connections.connect() as connection:
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT storage_quota_bytes FROM server_users WHERE user_id = %s FOR UPDATE",
                        (user_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise AssetNotFound("user was not found")
                    cursor.execute(
                        "SELECT COALESCE(SUM(byte_size), 0) FROM server_asset_versions WHERE user_id = %s",
                        (user_id,),
                    )
                    used = int(cursor.fetchone()[0])
                    quota = max(0, int(row[0]))
                    if used + byte_size > quota:
                        raise AssetQuotaExceeded("personal storage quota exceeded")
                    absolute_path.parent.mkdir(parents=True, exist_ok=True)
                    temporary_path.write_bytes(content)
                    insert(cursor)
                    record_audit_event(
                        cursor,
                        action=operation,
                        actor_user_id=user_id,
                        subject_user_id=user_id,
                        details=audit_details,
                    )
                    temporary_path.replace(absolute_path)
            except Exception:
                temporary_path.unlink(missing_ok=True)
                absolute_path.unlink(missing_ok=True)
                raise

    def _insert_new_asset(
        self,
        cursor: Any,
        *,
        asset_id: str,
        version_id: str,
        user_id: str,
        kind: AssetKind,
        name: str,
        filename: str,
        mime_type: str,
        relative_path: Path,
        content: bytes,
    ) -> None:
        cursor.execute(
            """
            INSERT INTO server_assets (asset_id, user_id, asset_kind, name, current_version_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (asset_id, user_id, kind, name, version_id),
        )
        cursor.execute(
            """
            INSERT INTO server_asset_versions (
                asset_version_id, asset_id, user_id, version_number,
                original_filename, mime_type, stored_relative_path, sha256, byte_size
            ) VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s)
            """,
            (
                version_id,
                asset_id,
                user_id,
                filename,
                mime_type,
                relative_path.as_posix(),
                hashlib.sha256(content).hexdigest(),
                len(content),
            ),
        )

    def _set_deleted(self, user_id: str, asset_id: str, *, deleted: bool) -> None:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE server_assets
                    SET deleted_at = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE asset_id = %s AND user_id = %s
                    RETURNING asset_id
                    """,
                    (deleted, asset_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise AssetNotFound("asset was not found")
                record_audit_event(
                    cursor,
                    action="asset.deleted" if deleted else "asset.restored",
                    actor_user_id=user_id,
                    subject_user_id=user_id,
                    details={"asset_id": asset_id},
                )

    @staticmethod
    def _version_from_row(row: dict[str, Any]) -> AssetVersion:
        return AssetVersion(
            asset_version_id=row["asset_version_id"],
            asset_id=row["asset_id"],
            user_id=row["user_id"],
            version_number=int(row["version_number"]),
            original_filename=row["original_filename"],
            mime_type=row["mime_type"],
            stored_relative_path=row["stored_relative_path"],
            sha256=row["sha256"],
            byte_size=int(row["byte_size"]),
            created_at=row["created_at"].isoformat(),
        )

    @classmethod
    def _asset_from_row(cls, row: dict[str, Any]) -> Asset:
        version = None
        if row.get("current_asset_version_id") is not None:
            version = AssetVersion(
                asset_version_id=row["current_asset_version_id"],
                asset_id=row["version_asset_id"],
                user_id=row["version_user_id"],
                version_number=int(row["version_number"]),
                original_filename=row["original_filename"],
                mime_type=row["mime_type"],
                stored_relative_path=row["stored_relative_path"],
                sha256=row["sha256"],
                byte_size=int(row["byte_size"]),
                created_at=row["version_created_at"].isoformat(),
            )
        return Asset(
            asset_id=row["asset_id"],
            user_id=row["user_id"],
            asset_kind=cast(AssetKind, row["asset_kind"]),
            name=row["name"],
            current_version_id=row["current_version_id"],
            deleted_at=row["deleted_at"].isoformat() if row["deleted_at"] else None,
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat(),
            current_version=version,
        )


def _validate_kind(value: str) -> AssetKind:
    normalized = value.strip().lower()
    if normalized not in ASSET_KINDS:
        raise AssetValidationError("asset kind is invalid")
    return cast(AssetKind, normalized)


def _clean_name(value: str) -> str:
    normalized = " ".join(value.replace("\x00", "").split())
    if not normalized or len(normalized) > 160:
        raise AssetValidationError("asset name is invalid")
    return normalized


def _clean_filename(value: str) -> str:
    normalized = Path(value.replace("\x00", "")).name.strip()[:160]
    normalized = _SAFE_FILENAME.sub("-", normalized)
    return normalized or "asset.bin"


def _normalize_mime(value: str) -> str:
    normalized = value.split(";", 1)[0].strip().lower()
    if not normalized or len(normalized) > 160 or "/" not in normalized:
        raise AssetValidationError("asset media type is invalid")
    return normalized


def _validate_content(kind: AssetKind, mime_type: str, content: bytes) -> None:
    if not content or len(content) > MAX_ASSET_BYTES:
        raise AssetValidationError("asset content is invalid")
    if kind in {"image", "reference"} and mime_type not in SUPPORTED_IMAGE_TYPES:
        raise AssetValidationError("image asset media type is unsupported")
    if kind in {"template", "prompt"} and not mime_type.startswith("text/"):
        raise AssetValidationError("text asset media type is unsupported")

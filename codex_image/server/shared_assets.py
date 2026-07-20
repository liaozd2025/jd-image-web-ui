from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from psycopg import errors
from psycopg.rows import dict_row

from .assets import (
    ASSET_KINDS,
    AssetKind,
    AssetNotFound,
    AssetValidationError,
    _clean_filename,
    _clean_name,
    _normalize_mime,
    _validate_content,
)
from .audit import record_audit_event
from .database import PostgresConnections
from .maintenance import assert_writes_allowed


class SharedAssetForbidden(RuntimeError):
    pass


class SharedAssetConflict(RuntimeError):
    pass


SHARED_GALLERY_ASSET_KINDS = frozenset({"image", "reference"})


@dataclass(frozen=True)
class SharedAssetVersion:
    asset_version_id: str
    asset_id: str
    publisher_user_id: str
    version_number: int
    original_filename: str
    mime_type: str
    stored_relative_path: str
    sha256: str
    byte_size: int
    created_at: str


@dataclass(frozen=True)
class SharedAsset:
    asset_id: str
    publisher_user_id: str
    asset_kind: AssetKind
    name: str
    current_version_id: str | None
    is_active: bool
    created_at: str
    updated_at: str
    current_version: SharedAssetVersion | None
    category_id: str | None = None
    category_name: str | None = None
    prompt_note: str = ""
    sort_order: int = 0


@dataclass(frozen=True)
class SharedStorageUsage:
    used_bytes: int
    asset_count: int
    active_asset_count: int
    version_count: int


class SharedAssetRepository:
    def __init__(self, connections: PostgresConnections, data_root: Path) -> None:
        self.connections = connections
        self.data_root = data_root

    def create_asset(
        self,
        publisher_user_id: str,
        *,
        actor_role: str,
        asset_kind: str,
        name: str,
        original_filename: str,
        mime_type: str,
        content: bytes,
        category_id: str | None = None,
        prompt_note: str = "",
    ) -> SharedAsset:
        kind = _validate_shared_kind(asset_kind)
        if kind in SHARED_GALLERY_ASSET_KINDS and actor_role != "admin":
            raise SharedAssetForbidden("only an administrator can create shared gallery images")
        clean_name = _clean_name(name or original_filename)
        filename = _clean_filename(original_filename)
        normalized_mime = _normalize_mime(mime_type)
        if kind in SHARED_GALLERY_ASSET_KINDS and not category_id:
            raise AssetValidationError("shared gallery category is required")
        _validate_shared_content(kind, normalized_mime, content)
        asset_id = str(uuid4())
        version_id = str(uuid4())
        relative_path = Path("shared-assets") / asset_id / f"{version_id}.bin"

        def insert(cursor: Any) -> None:
            cursor.execute(
                """
                INSERT INTO server_shared_assets (
                    asset_id, publisher_user_id, asset_kind, name, current_version_id
                ) VALUES (%s, %s, %s, %s, %s)
                """,
                (asset_id, publisher_user_id, kind, clean_name, version_id),
            )
            cursor.execute(
                """
                INSERT INTO server_shared_asset_versions (
                    asset_version_id, asset_id, publisher_user_id, version_number,
                    original_filename, mime_type, stored_relative_path, sha256, byte_size
                ) VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s)
                """,
                (
                    version_id,
                    asset_id,
                    publisher_user_id,
                    filename,
                    normalized_mime,
                    relative_path.as_posix(),
                    hashlib.sha256(content).hexdigest(),
                    len(content),
                ),
            )
            if kind in SHARED_GALLERY_ASSET_KINDS:
                cursor.execute(
                    "SELECT category_id FROM server_shared_gallery_categories WHERE category_id = %s",
                    (category_id,),
                )
                if cursor.fetchone() is None:
                    raise AssetValidationError("shared gallery category was not found")
                cursor.execute(
                    """
                    SELECT COALESCE(MAX(sort_order), 0) + 10
                    FROM server_shared_gallery_items
                    WHERE category_id = %s
                    """,
                    (category_id,),
                )
                sort_order = int(cursor.fetchone()[0])
                cursor.execute(
                    """
                    INSERT INTO server_shared_gallery_items (
                        asset_id, category_id, prompt_note, sort_order
                    ) VALUES (%s, %s, %s, %s)
                    """,
                    (asset_id, category_id, _clean_prompt_note(prompt_note), sort_order),
                )

        try:
            self._write_atomically(
                publisher_user_id,
                relative_path=relative_path,
                content=content,
                insert=insert,
                action="shared_gallery.item_created" if kind in SHARED_GALLERY_ASSET_KINDS else "shared_asset.published",
                details={
                    "asset_id": asset_id,
                    "asset_version_id": version_id,
                    **({"category_id": category_id} if category_id else {}),
                },
            )
        except errors.UniqueViolation as error:
            raise SharedAssetConflict("shared gallery item name already exists") from error
        return self.get_asset(asset_id)

    def create_version(
        self,
        actor_user_id: str,
        actor_role: str,
        asset_id: str,
        *,
        original_filename: str,
        mime_type: str,
        content: bytes,
    ) -> SharedAsset:
        filename = _clean_filename(original_filename)
        normalized_mime = _normalize_mime(mime_type)
        version_id = str(uuid4())
        relative_path = Path("shared-assets") / asset_id / f"{version_id}.bin"

        def insert(cursor: Any) -> None:
            cursor.execute(
                """
                SELECT publisher_user_id, asset_kind, is_active
                FROM server_shared_assets
                WHERE asset_id = %s
                FOR UPDATE
                """,
                (asset_id,),
            )
            asset = cursor.fetchone()
            if asset is None:
                raise AssetNotFound("shared asset was not found")
            kind = cast(AssetKind, asset[1])
            if kind in SHARED_GALLERY_ASSET_KINDS and actor_role != "admin":
                raise SharedAssetForbidden("only an administrator can update shared gallery images")
            if kind not in SHARED_GALLERY_ASSET_KINDS and asset[0] != actor_user_id and actor_role != "admin":
                raise SharedAssetForbidden("only the publisher or administrator can update this asset")
            if not asset[2]:
                raise AssetValidationError("shared asset is inactive")
            _validate_shared_content(kind, normalized_mime, content)
            cursor.execute(
                "SELECT COALESCE(MAX(version_number), 0) FROM server_shared_asset_versions WHERE asset_id = %s",
                (asset_id,),
            )
            version_number = int(cursor.fetchone()[0]) + 1
            cursor.execute(
                """
                INSERT INTO server_shared_asset_versions (
                    asset_version_id, asset_id, publisher_user_id, version_number,
                    original_filename, mime_type, stored_relative_path, sha256, byte_size
                )
                SELECT %s, asset_id, publisher_user_id, %s, %s, %s, %s, %s, %s
                FROM server_shared_assets WHERE asset_id = %s
                """,
                (
                    version_id,
                    version_number,
                    filename,
                    normalized_mime,
                    relative_path.as_posix(),
                    hashlib.sha256(content).hexdigest(),
                    len(content),
                    asset_id,
                ),
            )
            cursor.execute(
                "UPDATE server_shared_assets SET current_version_id = %s, updated_at = CURRENT_TIMESTAMP WHERE asset_id = %s",
                (version_id, asset_id),
            )

        self._write_atomically(
            actor_user_id,
            relative_path=relative_path,
            content=content,
            insert=insert,
            action="shared_asset.version_created",
            details={"asset_id": asset_id, "asset_version_id": version_id},
        )
        return self.get_asset(asset_id)

    def list_assets(self, *, include_inactive: bool = False, limit: int = 100) -> list[SharedAsset]:
        condition = "" if include_inactive else "WHERE assets.is_active"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT assets.*, versions.asset_version_id AS current_asset_version_id,
                           versions.publisher_user_id AS version_publisher_user_id,
                           versions.version_number, versions.original_filename, versions.mime_type,
                           versions.stored_relative_path, versions.sha256, versions.byte_size,
                           versions.created_at AS version_created_at,
                           gallery_items.category_id, categories.name AS category_name,
                           gallery_items.prompt_note, gallery_items.sort_order
                    FROM server_shared_assets AS assets
                    LEFT JOIN server_shared_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    LEFT JOIN server_shared_gallery_items AS gallery_items
                      ON gallery_items.asset_id = assets.asset_id
                    LEFT JOIN server_shared_gallery_categories AS categories
                      ON categories.category_id = gallery_items.category_id
                    {condition}
                    ORDER BY categories.sort_order NULLS LAST,
                             gallery_items.sort_order NULLS LAST,
                             assets.updated_at DESC, assets.asset_id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                return [self._asset_from_row(row) for row in cursor.fetchall()]

    def list_assets_page(
        self,
        *,
        page: int,
        page_size: int,
        status: str = "active",
        kind: AssetKind | None = None,
        category_id: str | None = None,
        query: str = "",
    ) -> tuple[list[SharedAsset], int]:
        clauses = ["TRUE"]
        values: list[object] = []
        if status == "active":
            clauses.append("assets.is_active")
        elif status == "inactive":
            clauses.append("NOT assets.is_active")
        if kind is not None:
            clauses.append("assets.asset_kind = %s")
            values.append(kind)
        if category_id:
            clauses.append("gallery_items.category_id = %s")
            values.append(category_id)
        normalized_query = query.strip()
        if normalized_query:
            pattern = f"%{normalized_query}%"
            clauses.append("(assets.name ILIKE %s OR COALESCE(gallery_items.prompt_note, '') ILIKE %s)")
            values.extend((pattern, pattern))
        where = " AND ".join(clauses)
        offset = (page - 1) * page_size
        joins = """
            LEFT JOIN server_shared_gallery_items AS gallery_items
              ON gallery_items.asset_id = assets.asset_id
            LEFT JOIN server_shared_gallery_categories AS categories
              ON categories.category_id = gallery_items.category_id
        """
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"SELECT COUNT(*) FROM server_shared_assets AS assets {joins} WHERE {where}",
                    values,
                )
                total = int(cursor.fetchone()["count"])
                cursor.execute(
                    f"""
                    SELECT assets.*, versions.asset_version_id AS current_asset_version_id,
                           versions.publisher_user_id AS version_publisher_user_id,
                           versions.version_number, versions.original_filename, versions.mime_type,
                           versions.stored_relative_path, versions.sha256, versions.byte_size,
                           versions.created_at AS version_created_at,
                           gallery_items.category_id, categories.name AS category_name,
                           gallery_items.prompt_note, gallery_items.sort_order
                    FROM server_shared_assets AS assets
                    LEFT JOIN server_shared_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    {joins}
                    WHERE {where}
                    ORDER BY categories.sort_order NULLS LAST,
                             gallery_items.sort_order NULLS LAST,
                             assets.updated_at DESC, assets.asset_id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (*values, page_size, offset),
                )
                return [self._asset_from_row(row) for row in cursor.fetchall()], total

    def get_asset(self, asset_id: str, *, include_inactive: bool = False) -> SharedAsset:
        condition = "" if include_inactive else "AND assets.is_active"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT assets.*, versions.asset_version_id AS current_asset_version_id,
                           versions.publisher_user_id AS version_publisher_user_id,
                           versions.version_number, versions.original_filename, versions.mime_type,
                           versions.stored_relative_path, versions.sha256, versions.byte_size,
                           versions.created_at AS version_created_at,
                           gallery_items.category_id, categories.name AS category_name,
                           gallery_items.prompt_note, gallery_items.sort_order
                    FROM server_shared_assets AS assets
                    LEFT JOIN server_shared_asset_versions AS versions
                      ON versions.asset_version_id = assets.current_version_id
                    LEFT JOIN server_shared_gallery_items AS gallery_items
                      ON gallery_items.asset_id = assets.asset_id
                    LEFT JOIN server_shared_gallery_categories AS categories
                      ON categories.category_id = gallery_items.category_id
                    WHERE assets.asset_id = %s {condition}
                    """,
                    (asset_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise AssetNotFound("shared asset was not found")
        return self._asset_from_row(row)

    def list_versions(self, asset_id: str, *, include_inactive: bool = False) -> list[SharedAssetVersion]:
        condition = "" if include_inactive else "AND assets.is_active"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT versions.*
                    FROM server_shared_asset_versions AS versions
                    JOIN server_shared_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.asset_id = %s {condition}
                    ORDER BY versions.version_number DESC
                    """,
                    (asset_id,),
                )
                return [self._version_from_row(row) for row in cursor.fetchall()]

    def set_active(self, actor_user_id: str, actor_role: str, asset_id: str, *, is_active: bool) -> SharedAsset:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT publisher_user_id, asset_kind FROM server_shared_assets WHERE asset_id = %s FOR UPDATE",
                    (asset_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise AssetNotFound("shared asset was not found")
                if row[1] in SHARED_GALLERY_ASSET_KINDS and actor_role != "admin":
                    raise SharedAssetForbidden("only an administrator can change shared gallery image status")
                if row[1] not in SHARED_GALLERY_ASSET_KINDS and row[0] != actor_user_id and actor_role != "admin":
                    raise SharedAssetForbidden("only the publisher or administrator can change shared asset status")
                cursor.execute(
                    "UPDATE server_shared_assets SET is_active = %s, updated_at = CURRENT_TIMESTAMP WHERE asset_id = %s",
                    (is_active, asset_id),
                )
                record_audit_event(
                    cursor,
                    action="shared_asset.activated" if is_active else "shared_asset.deactivated",
                    actor_user_id=actor_user_id,
                    subject_user_id=row[0],
                    details={"asset_id": asset_id},
                )
        return self.get_asset(asset_id, include_inactive=True)

    def storage_usage(self) -> SharedStorageUsage:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COALESCE(SUM(versions.byte_size), 0),
                           COUNT(DISTINCT assets.asset_id),
                           COUNT(DISTINCT assets.asset_id) FILTER (WHERE assets.is_active),
                           COUNT(versions.asset_version_id)
                    FROM server_shared_assets AS assets
                    LEFT JOIN server_shared_asset_versions AS versions
                      ON versions.asset_id = assets.asset_id
                    """
                )
                row = cursor.fetchone()
        return SharedStorageUsage(
            used_bytes=max(0, int(row[0] if row else 0)),
            asset_count=max(0, int(row[1] if row else 0)),
            active_asset_count=max(0, int(row[2] if row else 0)),
            version_count=max(0, int(row[3] if row else 0)),
        )

    def resolve_versions(self, asset_version_ids: list[str]) -> list[dict[str, object]]:
        if len(asset_version_ids) > 16 or len(set(asset_version_ids)) != len(asset_version_ids):
            raise AssetValidationError("too many or duplicate shared asset versions")
        if not asset_version_ids:
            return []
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT versions.*, assets.asset_kind, assets.name
                    FROM server_shared_asset_versions AS versions
                    JOIN server_shared_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.asset_version_id = ANY(%s) AND assets.is_active
                    """,
                    (asset_version_ids,),
                )
                rows = {row["asset_version_id"]: row for row in cursor.fetchall()}
        if len(rows) != len(asset_version_ids):
            raise AssetNotFound("one or more shared asset versions were not found")
        return [
            {
                "scope": "shared",
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
                "publisher_user_id": rows[version_id]["publisher_user_id"],
            }
            for version_id in asset_version_ids
        ]

    def asset_path(self, version: SharedAssetVersion) -> Path:
        root = self.data_root.resolve()
        shared_root = (root / "shared-assets").resolve()
        asset_root = (shared_root / version.asset_id).resolve()
        path = (root / version.stored_relative_path).resolve()
        outside_shared = shared_root != path and shared_root not in path.parents
        if (
            outside_shared
            or path.parent != asset_root
            or not path.name.startswith(f"{version.asset_version_id}.")
        ):
            raise AssetNotFound("shared asset path is invalid")
        return path

    def get_version(self, asset_version_id: str, *, include_inactive: bool = False) -> SharedAssetVersion:
        condition = "" if include_inactive else "AND assets.is_active"
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT versions.*
                    FROM server_shared_asset_versions AS versions
                    JOIN server_shared_assets AS assets ON assets.asset_id = versions.asset_id
                    WHERE versions.asset_version_id = %s {condition}
                    """,
                    (asset_version_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise AssetNotFound("shared asset version was not found")
        return self._version_from_row(row)

    def _write_atomically(
        self,
        user_id: str,
        *,
        relative_path: Path,
        content: bytes,
        insert: Any,
        action: str,
        details: dict[str, object],
    ) -> None:
        absolute_path = self.data_root / relative_path
        temporary_path = absolute_path.with_name(f".{absolute_path.name}.{uuid4().hex}.tmp")
        with self.connections.connect() as connection:
            try:
                with connection.cursor() as cursor:
                    assert_writes_allowed(cursor)
                    absolute_path.parent.mkdir(parents=True, exist_ok=True)
                    temporary_path.write_bytes(content)
                    insert(cursor)
                    record_audit_event(
                        cursor,
                        action=action,
                        actor_user_id=user_id,
                        subject_user_id=user_id,
                        details=details,
                    )
                    temporary_path.replace(absolute_path)
            except Exception:
                temporary_path.unlink(missing_ok=True)
                absolute_path.unlink(missing_ok=True)
                raise

    @staticmethod
    def _version_from_row(row: dict[str, Any]) -> SharedAssetVersion:
        return SharedAssetVersion(
            asset_version_id=row["asset_version_id"],
            asset_id=row["asset_id"],
            publisher_user_id=row["publisher_user_id"],
            version_number=int(row["version_number"]),
            original_filename=row["original_filename"],
            mime_type=row["mime_type"],
            stored_relative_path=row["stored_relative_path"],
            sha256=row["sha256"],
            byte_size=int(row["byte_size"]),
            created_at=row["created_at"].isoformat(),
        )

    @staticmethod
    def _asset_from_row(row: dict[str, Any]) -> SharedAsset:
        version = None
        if row.get("current_asset_version_id") is not None:
            version = SharedAssetVersion(
                asset_version_id=row["current_asset_version_id"],
                asset_id=row["asset_id"],
                publisher_user_id=row["version_publisher_user_id"],
                version_number=int(row["version_number"]),
                original_filename=row["original_filename"],
                mime_type=row["mime_type"],
                stored_relative_path=row["stored_relative_path"],
                sha256=row["sha256"],
                byte_size=int(row["byte_size"]),
                created_at=row["version_created_at"].isoformat(),
            )
        return SharedAsset(
            asset_id=row["asset_id"],
            publisher_user_id=row["publisher_user_id"],
            asset_kind=cast(AssetKind, row["asset_kind"]),
            name=row["name"],
            current_version_id=row["current_version_id"],
            is_active=row["is_active"],
            created_at=row["created_at"].isoformat(),
            updated_at=row["updated_at"].isoformat(),
            current_version=version,
            category_id=row.get("category_id"),
            category_name=row.get("category_name"),
            prompt_note=str(row.get("prompt_note") or ""),
            sort_order=int(row.get("sort_order") or 0),
        )


def _validate_shared_kind(value: str) -> AssetKind:
    normalized = value.strip().lower()
    if normalized not in ASSET_KINDS:
        raise AssetValidationError("shared asset kind is invalid")
    return cast(AssetKind, normalized)


def _clean_prompt_note(value: str) -> str:
    normalized = value.replace("\x00", "").strip()
    if len(normalized) > 1000:
        raise AssetValidationError("shared gallery prompt note is invalid")
    return normalized


def _validate_shared_content(kind: AssetKind, mime_type: str, content: bytes) -> None:
    _validate_content(kind, mime_type, content)
    if kind not in SHARED_GALLERY_ASSET_KINDS:
        return
    signatures = {
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/gif": content.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if not signatures.get(mime_type, False):
        raise AssetValidationError("shared gallery file content is not a valid image")

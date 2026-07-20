from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from psycopg import errors
from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .maintenance import assert_writes_allowed


class SharedGalleryNotFound(RuntimeError):
    pass


class SharedGalleryConflict(RuntimeError):
    pass


class SharedGalleryValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SharedGalleryCategory:
    category_id: str
    name: str
    sort_order: int
    is_system: bool


class SharedGalleryRepository:
    def __init__(self, connections: PostgresConnections) -> None:
        self.connections = connections

    def list_categories(self) -> list[SharedGalleryCategory]:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT category_id, name, sort_order, is_system
                    FROM server_shared_gallery_categories
                    ORDER BY sort_order, created_at, category_id
                    """
                )
                return [self._category_from_row(row) for row in cursor.fetchall()]

    def create_category(self, actor_user_id: str, *, name: str) -> SharedGalleryCategory:
        clean_name = _clean_category_name(name)
        category_id = str(uuid4())
        try:
            with self.connections.connect() as connection:
                with connection.cursor() as cursor:
                    assert_writes_allowed(cursor)
                    cursor.execute(
                        "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM server_shared_gallery_categories"
                    )
                    sort_order = int(cursor.fetchone()[0])
                    cursor.execute(
                        """
                        INSERT INTO server_shared_gallery_categories (
                            category_id, name, sort_order, is_system
                        ) VALUES (%s, %s, %s, FALSE)
                        """,
                        (category_id, clean_name, sort_order),
                    )
                    record_audit_event(
                        cursor,
                        action="shared_gallery.category_created",
                        actor_user_id=actor_user_id,
                        subject_user_id=None,
                        details={"category_id": category_id, "name": clean_name},
                    )
        except errors.UniqueViolation as error:
            raise SharedGalleryConflict("shared gallery category name already exists") from error
        return self.get_category(category_id)

    def get_category(self, category_id: str) -> SharedGalleryCategory:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT category_id, name, sort_order, is_system
                    FROM server_shared_gallery_categories
                    WHERE category_id = %s
                    """,
                    (category_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise SharedGalleryNotFound("shared gallery category was not found")
        return self._category_from_row(row)

    def update_category(self, actor_user_id: str, category_id: str, *, name: str) -> SharedGalleryCategory:
        clean_name = _clean_category_name(name)
        try:
            with self.connections.connect() as connection:
                with connection.cursor() as cursor:
                    assert_writes_allowed(cursor)
                    cursor.execute(
                        """
                        UPDATE server_shared_gallery_categories
                        SET name = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE category_id = %s
                        RETURNING is_system
                        """,
                        (clean_name, category_id),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise SharedGalleryNotFound("shared gallery category was not found")
                    if bool(row[0]):
                        raise SharedGalleryConflict("system shared gallery category cannot be renamed")
                    record_audit_event(
                        cursor,
                        action="shared_gallery.category_updated",
                        actor_user_id=actor_user_id,
                        subject_user_id=None,
                        details={"category_id": category_id, "name": clean_name},
                    )
        except errors.UniqueViolation as error:
            raise SharedGalleryConflict("shared gallery category name already exists") from error
        return self.get_category(category_id)

    def reorder_categories(self, actor_user_id: str, category_ids: list[str]) -> list[SharedGalleryCategory]:
        if not category_ids or len(category_ids) != len(set(category_ids)):
            raise SharedGalleryValidationError("shared gallery category order is invalid")
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT category_id FROM server_shared_gallery_categories FOR UPDATE"
                )
                existing_ids = [str(row[0]) for row in cursor.fetchall()]
                if any(category_id not in existing_ids for category_id in category_ids):
                    raise SharedGalleryNotFound("shared gallery category was not found")
                remaining_ids = [category_id for category_id in existing_ids if category_id not in category_ids]
                ordered_ids = [*category_ids, *remaining_ids]
                for index, category_id in enumerate(ordered_ids, start=1):
                    cursor.execute(
                        """
                        UPDATE server_shared_gallery_categories
                        SET sort_order = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE category_id = %s
                        """,
                        (index * 10, category_id),
                    )
                record_audit_event(
                    cursor,
                    action="shared_gallery.categories_reordered",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"category_ids": ordered_ids},
                )
        return self.list_categories()

    def delete_category(self, actor_user_id: str, category_id: str) -> list[SharedGalleryCategory]:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    """
                    SELECT is_system
                    FROM server_shared_gallery_categories
                    WHERE category_id = %s
                    FOR UPDATE
                    """,
                    (category_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise SharedGalleryNotFound("shared gallery category was not found")
                if bool(row[0]):
                    raise SharedGalleryConflict("system shared gallery category cannot be deleted")
                cursor.execute(
                    """
                    UPDATE server_shared_gallery_items
                    SET category_id = 'uncategorized', updated_at = CURRENT_TIMESTAMP
                    WHERE category_id = %s
                    """,
                    (category_id,),
                )
                moved_count = cursor.rowcount
                cursor.execute(
                    "DELETE FROM server_shared_gallery_categories WHERE category_id = %s",
                    (category_id,),
                )
                record_audit_event(
                    cursor,
                    action="shared_gallery.category_deleted",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"category_id": category_id, "moved_item_count": moved_count},
                )
        return self.list_categories()

    def update_item(
        self,
        actor_user_id: str,
        asset_id: str,
        *,
        name: str,
        category_id: str,
        prompt_note: str,
    ) -> None:
        clean_name = _clean_item_name(name)
        clean_note = _clean_prompt_note(prompt_note)
        try:
            with self.connections.connect() as connection:
                with connection.cursor() as cursor:
                    assert_writes_allowed(cursor)
                    cursor.execute(
                        """
                        SELECT publisher_user_id, asset_kind
                        FROM server_shared_assets
                        WHERE asset_id = %s
                        FOR UPDATE
                        """,
                        (asset_id,),
                    )
                    asset = cursor.fetchone()
                    if asset is None or asset[1] not in {"image", "reference"}:
                        raise SharedGalleryNotFound("shared gallery item was not found")
                    cursor.execute(
                        "SELECT category_id FROM server_shared_gallery_categories WHERE category_id = %s",
                        (category_id,),
                    )
                    if cursor.fetchone() is None:
                        raise SharedGalleryNotFound("shared gallery category was not found")
                    cursor.execute(
                        """
                        UPDATE server_shared_assets
                        SET name = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE asset_id = %s
                        """,
                        (clean_name, asset_id),
                    )
                    cursor.execute(
                        """
                        UPDATE server_shared_gallery_items
                        SET category_id = %s,
                            prompt_note = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE asset_id = %s
                        """,
                        (category_id, clean_note, asset_id),
                    )
                    if cursor.rowcount != 1:
                        raise SharedGalleryNotFound("shared gallery item metadata was not found")
                    record_audit_event(
                        cursor,
                        action="shared_gallery.item_updated",
                        actor_user_id=actor_user_id,
                        subject_user_id=asset[0],
                        details={
                            "asset_id": asset_id,
                            "name": clean_name,
                            "category_id": category_id,
                        },
                    )
        except errors.UniqueViolation as error:
            raise SharedGalleryConflict("shared gallery item name already exists") from error

    def record_batch_completed(self, actor_user_id: str, results: list[dict[str, object]]) -> None:
        audit_results = [
            {
                key: value
                for key, value in result.items()
                if key in {"filename", "name", "status", "error", "asset_id"}
            }
            for result in results
        ]
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                record_audit_event(
                    cursor,
                    action="shared_gallery.batch_completed",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    outcome="success" if all(result.get("status") == "created" for result in results) else "failure",
                    details={"results": audit_results},
                )

    def reorder_items(
        self,
        actor_user_id: str,
        *,
        category_id: str,
        item_ids: list[str],
    ) -> None:
        if not item_ids or len(item_ids) != len(set(item_ids)):
            raise SharedGalleryValidationError("shared gallery item order is invalid")
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                assert_writes_allowed(cursor)
                cursor.execute(
                    "SELECT category_id FROM server_shared_gallery_categories WHERE category_id = %s",
                    (category_id,),
                )
                if cursor.fetchone() is None:
                    raise SharedGalleryNotFound("shared gallery category was not found")
                cursor.execute(
                    """
                    SELECT items.asset_id
                    FROM server_shared_gallery_items AS items
                    JOIN server_shared_assets AS assets ON assets.asset_id = items.asset_id
                    WHERE items.category_id = %s AND assets.is_active
                    FOR UPDATE OF items
                    """,
                    (category_id,),
                )
                existing_ids = {str(row[0]) for row in cursor.fetchall()}
                if set(item_ids) != existing_ids:
                    raise SharedGalleryValidationError(
                        "shared gallery item order must contain every active item in the category"
                    )
                for index, asset_id in enumerate(item_ids, start=1):
                    cursor.execute(
                        """
                        UPDATE server_shared_gallery_items
                        SET sort_order = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE asset_id = %s AND category_id = %s
                        """,
                        (index * 10, asset_id, category_id),
                    )
                record_audit_event(
                    cursor,
                    action="shared_gallery.items_reordered",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"category_id": category_id, "item_ids": item_ids},
                )

    @staticmethod
    def _category_from_row(row: dict[str, Any]) -> SharedGalleryCategory:
        return SharedGalleryCategory(
            category_id=str(row["category_id"]),
            name=str(row["name"]),
            sort_order=int(row["sort_order"]),
            is_system=bool(row["is_system"]),
        )


def _clean_category_name(value: str) -> str:
    normalized = " ".join(value.replace("\x00", "").split())
    if not normalized or len(normalized) > 64:
        raise SharedGalleryValidationError("shared gallery category name is invalid")
    return normalized


def _clean_item_name(value: str) -> str:
    normalized = " ".join(value.replace("\x00", "").split())
    if not normalized or len(normalized) > 160:
        raise SharedGalleryValidationError("shared gallery item name is invalid")
    return normalized


def _clean_prompt_note(value: str) -> str:
    normalized = value.replace("\x00", "").strip()
    if len(normalized) > 1000:
        raise SharedGalleryValidationError("shared gallery prompt note is invalid")
    return normalized

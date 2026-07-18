from __future__ import annotations

import json
from typing import Any
from uuid import uuid4


def record_audit_event(
    cursor: Any,
    *,
    action: str,
    actor_user_id: str | None,
    subject_user_id: str | None,
    outcome: str = "success",
    details: dict[str, object] | None = None,
) -> None:
    cursor.execute(
        """
        INSERT INTO server_audit_events (
            event_id,
            action,
            outcome,
            actor_user_id,
            subject_user_id,
            details
        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(uuid4()),
            action,
            outcome,
            actor_user_id,
            subject_user_id,
            json.dumps(details or {}, separators=(",", ":")),
        ),
    )

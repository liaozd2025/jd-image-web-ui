from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


SUMMARY_KEYS = {
    "task_id",
    "created_at",
    "updated_at",
    "viewed_at",
    "queued_at",
    "started_at",
    "attempt_started_at",
    "retry_requested_at",
    "mode",
    "status",
    "prompt",
    "prompt_for_model",
    "prompt_constraints",
    "params",
    "input_files",
    "input_urls",
    "input_thumbnail_urls",
    "input_sources",
    "mask_file",
    "gallery_refs",
    "reference_assets",
    "generated_count",
    "failed_count",
    "total_count",
    "original_total_count",
    "cleared_failed_count",
    "pruned_output_count",
    "output_file",
    "output_files",
    "output_url",
    "output_urls",
    "thumbnail_urls",
    "outputs",
    "output_size",
    "output_sizes",
    "output_format",
    "output_formats",
    "quality",
    "qualities",
    "background",
    "backgrounds",
    "revised_prompt",
    "revised_prompts",
    "usage",
    "usages",
    "attempts",
    "max_attempts",
    "retrying_failed_slots",
    "retry_failed_slots",
    "last_error",
    "error",
    "orphaned_running",
    "archived_at",
    "selected_output_indexes",
    "deleted_output_indexes",
    "api_provider_id",
    "api_provider_name",
    "api_images_concurrency",
    "requested_backend",
    "backend",
    "assigned_auth_source",
}


class SQLiteTaskIndex:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_schema(self) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    create table if not exists task_index (
                        task_id text primary key,
                        created_at text not null default '',
                        updated_at text not null default '',
                        status text not null default '',
                        prompt text not null default '',
                        summary_json text not null
                    )
                    """
                )
                connection.execute("create index if not exists idx_task_index_created_at on task_index(created_at desc)")

    def upsert(self, metadata: dict[str, Any]) -> None:
        task_id = str(metadata.get("task_id") or "")
        if not task_id:
            return
        summary = _summary_for_metadata(metadata)
        created_at = str(metadata.get("created_at") or "")
        updated_at = str(metadata.get("updated_at") or "")
        status = str(metadata.get("status") or "")
        prompt = str(metadata.get("prompt") or "")
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    insert into task_index(task_id, created_at, updated_at, status, prompt, summary_json)
                    values(?, ?, ?, ?, ?, ?)
                    on conflict(task_id) do update set
                        created_at = excluded.created_at,
                        updated_at = excluded.updated_at,
                        status = excluded.status,
                        prompt = excluded.prompt,
                        summary_json = excluded.summary_json
                    """,
                    (task_id, created_at, updated_at, status, prompt, json.dumps(summary, ensure_ascii=False)),
                )

    def delete(self, task_id: str) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute("delete from task_index where task_id = ?", (task_id,))

    def list_summaries(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "select summary_json from task_index order by created_at desc, task_id desc"
            ).fetchall()
        summaries: list[dict[str, Any]] = []
        for row in rows:
            try:
                summary = json.loads(str(row["summary_json"]))
            except json.JSONDecodeError:
                continue
            if isinstance(summary, dict):
                summaries.append(summary)
        return summaries


def _summary_for_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    summary = {key: metadata[key] for key in SUMMARY_KEYS if key in metadata}
    params = summary.get("params")
    request_payload = metadata.get("request")
    if isinstance(params, dict) and not params.get("main_model") and isinstance(request_payload, dict) and request_payload.get("model"):
        summary["params"] = {**params, "main_model": str(request_payload["model"])}
    return summary

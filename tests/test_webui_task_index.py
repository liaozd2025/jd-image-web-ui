from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from codex_image.webui.task_index import SQLiteTaskIndex


class WebUITaskIndexTests(unittest.TestCase):
    def test_index_upserts_and_lists_newest_first(self) -> None:
        with TemporaryDirectory() as tmp:
            index = SQLiteTaskIndex(Path(tmp) / "tasks.db")
            index.upsert(
                {
                    "task_id": "old",
                    "created_at": "2026-05-09T10:00:00+00:00",
                    "updated_at": "2026-05-09T10:01:00+00:00",
                    "status": "completed",
                    "prompt": "old prompt",
                    "params": {"size": "1152x2048"},
                    "generated_count": 1,
                    "failed_count": 0,
                    "total_count": 1,
                    "request": {"input": [{"content": "large payload should not be indexed"}]},
                    "outputs": [{"index": 1, "status": "completed", "thumbnail_url": "/thumb-old.jpg"}],
                }
            )
            index.upsert(
                {
                    "task_id": "new",
                    "created_at": "2026-05-09T11:00:00+00:00",
                    "updated_at": "2026-05-09T11:01:00+00:00",
                    "status": "failed",
                    "prompt": "new prompt",
                    "params": {"size": "2160x3840"},
                    "generated_count": 0,
                    "failed_count": 1,
                    "total_count": 1,
                    "outputs": [],
                }
            )

            tasks = index.list_summaries()

        self.assertEqual([task["task_id"] for task in tasks], ["new", "old"])
        self.assertEqual(tasks[0]["params"]["size"], "2160x3840")
        self.assertNotIn("request", tasks[1])

    def test_index_deletes_task(self) -> None:
        with TemporaryDirectory() as tmp:
            index = SQLiteTaskIndex(Path(tmp) / "tasks.db")
            index.upsert({"task_id": "task-1", "created_at": "2026-05-09T10:00:00+00:00"})

            index.delete("task-1")

            self.assertEqual(index.list_summaries(), [])

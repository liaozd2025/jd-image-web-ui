from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from codex_image.webui.events import event_snapshot
from tests.webui_helpers import FakeImageClient


class WebUIEventSnapshotTests(unittest.TestCase):
    def test_generation_snapshot_limits_history_and_keeps_older_active_task(self) -> None:
        from codex_image.webui.app import create_app

        with tempfile.TemporaryDirectory() as tmp:
            app = create_app(
                output_root=Path(tmp),
                client_factory=lambda: FakeImageClient(),
                auth_checker=lambda: True,
                auto_start_queue=False,
            )
            active_task_id = "20260601000000-active"
            app.state.storage.write_metadata(
                active_task_id,
                {
                    "task_id": active_task_id,
                    "created_at": "2026-06-01T00:00:00+00:00",
                    "updated_at": "2026-06-01T00:00:00+00:00",
                    "status": "queued",
                    "mode": "generate",
                    "prompt": "older active task",
                    "params": {},
                    "input_files": [],
                },
            )
            app.state.queue_storage.enqueue(active_task_id)

            for index in range(55):
                task_id = f"20260701{index:06d}-recent"
                app.state.storage.write_metadata(
                    task_id,
                    {
                        "task_id": task_id,
                        "created_at": f"2026-07-01T12:{index:02d}:00+00:00",
                        "updated_at": f"2026-07-01T12:{index:02d}:00+00:00",
                        "status": "completed",
                        "mode": "generate",
                        "prompt": f"recent task {index}",
                        "params": {},
                        "input_files": [],
                    },
                )

            snapshot = event_snapshot(app.state.ctx)

        task_ids = [task["task_id"] for task in snapshot["tasks"]]
        self.assertEqual(len(task_ids), 51)
        self.assertEqual(len(set(task_ids)), 51)
        self.assertIn(active_task_id, task_ids)
        self.assertEqual(snapshot["queue"]["summary"]["waiting_count"], 1)


if __name__ == "__main__":
    unittest.main()

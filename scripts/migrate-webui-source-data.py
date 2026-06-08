#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from codex_image.webui.schemas import DEFAULT_WEBUI_SETTINGS_PATH
from codex_image.webui.settings_store import WebUISettings
from codex_image.webui.storage import TASK_SOURCE_DATA_SUFFIXES, TaskStorage


def main() -> int:
    parser = argparse.ArgumentParser(description="Move flat WebUI task source-data files into date-sharded directories.")
    parser.add_argument("--settings", type=Path, default=DEFAULT_WEBUI_SETTINGS_PATH, help="Path to webui-settings.json.")
    parser.add_argument("--dry-run", action="store_true", help="Only report flat task source-data files that would be moved.")
    args = parser.parse_args()

    paths = WebUISettings(args.settings).read_paths()
    storage = TaskStorage(
        output_root=paths["output_root"],
        input_root=paths["input_root"],
        source_data_root=paths["source_data_root"],
    )
    if args.dry_run:
        result = _flat_file_counts(storage)
    else:
        result = storage.migrate_source_data_files()
        result["indexed_tasks"] = len(storage.rebuild_task_index())
    result["source_data_root"] = str(storage.source_data_root)
    result["task_source_data_root"] = str(storage.source_data_root / "tasks")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def _flat_file_counts(storage: TaskStorage) -> dict[str, int]:
    result = {
        "would_move": 0,
        "metadata": 0,
        "request": 0,
        "debug_sse": 0,
    }
    if not storage.source_data_root.exists():
        return result
    for suffix in TASK_SOURCE_DATA_SUFFIXES:
        count = len(list(storage.source_data_root.glob(f"*.{suffix}")))
        result["would_move"] += count
        if suffix == "metadata.json":
            result["metadata"] = count
        elif suffix == "request.json":
            result["request"] = count
        elif suffix == "debug-sse.jsonl":
            result["debug_sse"] = count
    return result


if __name__ == "__main__":
    raise SystemExit(main())

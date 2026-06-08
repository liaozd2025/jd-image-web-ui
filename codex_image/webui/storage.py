from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .schemas import (
    CreatedTask,
    DEFAULT_WEBUI_OUTPUT_ROOT,
)
from .gallery_storage import (
    DEFAULT_GALLERY_CATEGORIES,
    GALLERY_CATEGORIES,
    GalleryStorage,
    _clean_gallery_category,
    _clean_gallery_category_id,
    _clean_gallery_category_name,
    _clean_gallery_name,
    _clean_gallery_prompt_note,
    _clean_gallery_prompt_role,
    _gallery_name_key,
    _normalize_gallery_category,
)
from .reference_assets import (
    MAX_REFERENCE_ASSETS,
    REFERENCE_ASSET_SUFFIXES,
    ReferenceAssetStorage,
    _reference_asset_suffix,
)
from .queue_storage import QueueStorage, SQLiteQueueStorage
from .task_index import SQLiteTaskIndex
from .storage_utils import (
    _guess_mime_type,
    _safe_extension,
    _safe_filename,
    _safe_output_relative_path,
    _task_date_directory,
    utc_now,
)
from .thumbnails import create_image_thumbnail, input_thumbnail_filename, output_thumbnail_filename


TASK_SOURCE_DATA_SUBDIR = "tasks"
TASK_SOURCE_DATA_SUFFIXES = ("metadata.json", "request.json", "debug-sse.jsonl")


class TaskStorage:
    def __init__(
        self,
        output_root: Path | str = DEFAULT_WEBUI_OUTPUT_ROOT,
        *,
        input_root: Path | str | None = None,
        source_data_root: Path | str | None = None,
    ) -> None:
        self.output_root = Path(output_root)
        self.input_root = Path(input_root) if input_root is not None else self.output_root.parent / "webui-inputs"
        self.source_data_root = Path(source_data_root) if source_data_root is not None else self.output_root / "source-data"
        # `root` is kept as a compatibility alias for existing app code while
        # paths are migrated to the explicit roots above.
        self.root = self.output_root
        self.task_index = SQLiteTaskIndex(self.source_data_root / "webui-task-index.db")

    def create_task(self, mode: str) -> CreatedTask:
        task_id = datetime.now(UTC).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:8]
        self.input_root.mkdir(parents=True, exist_ok=True)
        self.output_root.mkdir(parents=True, exist_ok=True)
        self.source_data_root.mkdir(parents=True, exist_ok=True)
        task_source_dir = self._task_source_data_dir(task_id)
        task_source_dir.mkdir(parents=True, exist_ok=True)
        return CreatedTask(task_id=task_id, path=task_source_dir, mode=mode)

    def write_metadata(self, task_id: str, metadata: dict[str, Any]) -> Path:
        path = self.metadata_path(task_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        self.task_index.upsert(metadata)
        return path

    def read_metadata(self, task_id: str) -> dict[str, Any]:
        path = self.metadata_path(task_id)
        return json.loads(path.read_text(encoding="utf-8"))

    def write_request(self, task_id: str, request: dict[str, Any]) -> Path:
        path = self.request_path(task_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(request, indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    def write_input(self, task_id: str, filename: str, data: bytes, *, kind: str = "input", index: int | None = None) -> Path:
        if kind not in {"input", "mask"}:
            raise ValueError("Input kind must be input or mask")
        self._validate_task_id(task_id)
        next_index = index if index is not None else self._next_input_index(task_id, kind)
        prefix = f"{task_id}-{kind}-{next_index:02d}-"
        safe_name = _safe_filename(filename, max_bytes=255 - len(prefix.encode("utf-8")))
        path = self.input_root / f"{prefix}{safe_name}"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        if kind == "input":
            create_image_thumbnail(path, self.input_thumbnail_path(task_id, next_index))
        return path

    def write_output(self, task_id: str, data: bytes, output_format: str, *, index: int | None = None) -> Path:
        self._validate_task_id(task_id)
        suffix = _safe_extension(output_format)
        output_index = index if index is not None else 1
        filename = f"{task_id}-image-{output_index}.{suffix}"
        path = self.output_root / _task_date_directory(task_id) / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def delete_task(self, task_id: str) -> None:
        self._validate_task_id(task_id)
        output_paths = list(self.output_root.rglob(f"{task_id}-image-*")) if self.output_root.exists() else []
        thumbnail_root = self.output_root / "thumbnails"
        thumbnail_paths = list(thumbnail_root.rglob(f"{task_id}-*-thumb.*")) if thumbnail_root.exists() else []
        paths = [
            *self.input_root.glob(f"{task_id}-input-*"),
            *self.input_root.glob(f"{task_id}-mask-*"),
            *output_paths,
            *thumbnail_paths,
            *self._task_source_data_paths(task_id),
        ]
        if not paths:
            raise FileNotFoundError(task_id)
        output_dirs = {path.parent for path in [*output_paths, *thumbnail_paths]}
        source_data_dirs = {path.parent for path in self._task_source_data_paths(task_id)}
        for path in paths:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
        self.task_index.delete(task_id)
        for path in output_dirs:
            self._prune_empty_output_dir(path)
        for path in source_data_dirs:
            self._prune_empty_source_data_dir(path)

    def list_tasks(self) -> list[dict[str, Any]]:
        indexed_tasks = self.task_index.list_summaries()
        if indexed_tasks:
            return indexed_tasks
        if not self.source_data_root.exists():
            return []
        return self.rebuild_task_index()

    def rebuild_task_index(self) -> list[dict[str, Any]]:
        if not self.source_data_root.exists():
            return []
        return self._list_tasks_from_metadata(list(self.iter_metadata_paths()))

    def iter_metadata_paths(self) -> list[Path]:
        if not self.source_data_root.exists():
            return []
        flat_paths = list(self.source_data_root.glob("*.metadata.json"))
        sharded_root = self.source_data_root / TASK_SOURCE_DATA_SUBDIR
        sharded_paths = list(sharded_root.glob("*/*.metadata.json")) if sharded_root.exists() else []
        return [*flat_paths, *sharded_paths]

    def migrate_source_data_files(self) -> dict[str, int]:
        self.source_data_root.mkdir(parents=True, exist_ok=True)
        result = {
            "moved": 0,
            "metadata_moved": 0,
            "request_moved": 0,
            "debug_sse_moved": 0,
            "skipped": 0,
            "duplicates_removed": 0,
        }
        for suffix in TASK_SOURCE_DATA_SUFFIXES:
            pattern = f"*.{suffix}"
            for legacy_path in sorted(self.source_data_root.glob(pattern)):
                task_id = legacy_path.name.removesuffix(f".{suffix}")
                try:
                    target_path = self._sharded_source_data_path(task_id, suffix)
                except ValueError:
                    result["skipped"] += 1
                    continue
                if legacy_path == target_path:
                    continue
                target_path.parent.mkdir(parents=True, exist_ok=True)
                if target_path.exists():
                    if _same_file_bytes(legacy_path, target_path):
                        try:
                            legacy_path.unlink()
                            result["duplicates_removed"] += 1
                        except OSError:
                            result["skipped"] += 1
                    else:
                        result["skipped"] += 1
                    continue
                try:
                    legacy_path.replace(target_path)
                except OSError:
                    result["skipped"] += 1
                    continue
                result["moved"] += 1
                if suffix == "metadata.json":
                    result["metadata_moved"] += 1
                    try:
                        metadata = json.loads(target_path.read_text(encoding="utf-8"))
                    except (OSError, json.JSONDecodeError):
                        continue
                    if isinstance(metadata, dict):
                        self.task_index.upsert(metadata)
                elif suffix == "request.json":
                    result["request_moved"] += 1
                elif suffix == "debug-sse.jsonl":
                    result["debug_sse_moved"] += 1
        return result

    def _list_tasks_from_metadata(self, metadata_paths: list[Path]) -> list[dict[str, Any]]:
        tasks_by_id: dict[str, dict[str, Any]] = {}
        for metadata_path in metadata_paths:
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            task_id = str(metadata.get("task_id") or metadata_path.name.removesuffix(".metadata.json"))
            if not task_id:
                continue
            metadata["task_id"] = task_id
            self.task_index.upsert(metadata)
            tasks_by_id[task_id] = metadata

        return sorted(tasks_by_id.values(), key=lambda task: str(task.get("created_at", "")), reverse=True)

    def metadata_path(self, task_id: str) -> Path:
        return self._source_data_path(task_id, "metadata.json")

    def request_path(self, task_id: str) -> Path:
        return self._source_data_path(task_id, "request.json")

    def debug_sse_path(self, task_id: str) -> Path:
        return self._source_data_path(task_id, "debug-sse.jsonl")

    def input_path(self, filename: str) -> Path:
        return self.input_root / Path(filename).name

    def output_path(self, filename: str) -> Path:
        return self.output_root / _safe_output_relative_path(filename)

    def output_file(self, path: Path) -> str:
        try:
            return path.resolve(strict=False).relative_to(self.output_root.resolve(strict=False)).as_posix()
        except ValueError:
            return path.name

    def output_thumbnail_path(self, task_id: str, output_index: int) -> Path:
        self._validate_task_id(task_id)
        return self.output_root / "thumbnails" / _task_date_directory(task_id) / output_thumbnail_filename(task_id, output_index)

    def input_thumbnail_path(self, task_id: str, input_index: int) -> Path:
        self._validate_task_id(task_id)
        return self.output_root / "thumbnails" / _task_date_directory(task_id) / input_thumbnail_filename(task_id, input_index)

    def _source_data_path(self, task_id: str, suffix: str) -> Path:
        legacy_path = self._legacy_source_data_path(task_id, suffix)
        sharded_path = self._sharded_source_data_path(task_id, suffix)
        if legacy_path.exists() and not sharded_path.exists():
            return legacy_path
        return sharded_path

    def _legacy_source_data_path(self, task_id: str, suffix: str) -> Path:
        self._validate_task_id(task_id)
        if suffix not in TASK_SOURCE_DATA_SUFFIXES:
            raise ValueError("Invalid source data suffix")
        return self.source_data_root / f"{task_id}.{suffix}"

    def _sharded_source_data_path(self, task_id: str, suffix: str) -> Path:
        self._validate_task_id(task_id)
        if suffix not in TASK_SOURCE_DATA_SUFFIXES:
            raise ValueError("Invalid source data suffix")
        return self._task_source_data_dir(task_id) / f"{task_id}.{suffix}"

    def _task_source_data_dir(self, task_id: str) -> Path:
        self._validate_task_id(task_id)
        return self.source_data_root / TASK_SOURCE_DATA_SUBDIR / _task_date_directory(task_id)

    def _task_source_data_paths(self, task_id: str) -> list[Path]:
        paths: list[Path] = []
        for suffix in TASK_SOURCE_DATA_SUFFIXES:
            paths.append(self._legacy_source_data_path(task_id, suffix))
            paths.append(self._sharded_source_data_path(task_id, suffix))
        return paths

    def _next_input_index(self, task_id: str, kind: str) -> int:
        existing = list(self.input_root.glob(f"{task_id}-{kind}-*-*"))
        return len(existing) + 1

    def _validate_task_id(self, task_id: str) -> None:
        if not task_id or "/" in task_id or "\\" in task_id:
            raise ValueError("Invalid task id")

    def _prune_empty_output_dir(self, path: Path) -> None:
        if path == self.output_root:
            return
        try:
            path.relative_to(self.output_root)
        except ValueError:
            return
        try:
            path.rmdir()
        except OSError:
            pass

    def _prune_empty_source_data_dir(self, path: Path) -> None:
        if path in {self.source_data_root, self.source_data_root / TASK_SOURCE_DATA_SUBDIR}:
            return
        try:
            path.relative_to(self.source_data_root / TASK_SOURCE_DATA_SUBDIR)
        except ValueError:
            return
        try:
            path.rmdir()
        except OSError:
            return
        try:
            (self.source_data_root / TASK_SOURCE_DATA_SUBDIR).rmdir()
        except OSError:
            pass


def _same_file_bytes(first: Path, second: Path) -> bool:
    try:
        return first.read_bytes() == second.read_bytes()
    except OSError:
        return False

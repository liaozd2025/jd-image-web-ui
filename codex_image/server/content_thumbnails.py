from __future__ import annotations

from pathlib import Path
import re
from uuid import uuid4


_SAFE_PART = re.compile(r"^[A-Za-z0-9_-]+$")


def ensure_image_thumbnail(
    data_root: Path,
    *,
    scope: str,
    version_id: str,
    source_path: Path,
) -> Path:
    if scope not in {"personal", "shared"} or not _SAFE_PART.fullmatch(version_id):
        raise ValueError("invalid thumbnail identity")
    if not source_path.is_file():
        raise FileNotFoundError(source_path)

    root = data_root.resolve()
    thumbnail_root = (root / "content-thumbnails" / scope).resolve()
    target = (thumbnail_root / f"{version_id}.jpg").resolve()
    if thumbnail_root not in target.parents:
        raise ValueError("invalid thumbnail path")
    if target.is_file() and target.stat().st_mtime_ns >= source_path.stat().st_mtime_ns:
        return target

    temporary = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
    try:
        from PIL import Image

        thumbnail_root.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as image:
            image.thumbnail((512, 512))
            image.convert("RGB").save(temporary, format="JPEG", quality=85, optimize=True)
        temporary.replace(target)
        return target
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

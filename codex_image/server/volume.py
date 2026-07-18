from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from .health import FileVolumeHealth, HealthStatus


VOLUME_ID_FILE = ".server-volume-id"


def check_file_volume(data_root: Path, *, component: str = "web") -> FileVolumeHealth:
    probe_path: Path | None = None
    try:
        data_root.mkdir(parents=True, exist_ok=True)
        identity_path = data_root / VOLUME_ID_FILE
        try:
            with identity_path.open("x", encoding="utf-8") as identity_file:
                identity_file.write(str(uuid4()))
        except FileExistsError:
            pass
        volume_id = identity_path.read_text(encoding="utf-8").strip()
        if not volume_id:
            raise OSError("file volume identity is empty")

        health_root = data_root / ".health"
        health_root.mkdir(exist_ok=True)
        probe_path = health_root / f"{component}-{os.getpid()}-{uuid4().hex}.probe"
        probe_path.write_text("ok", encoding="utf-8")
        if probe_path.read_text(encoding="utf-8") != "ok":
            raise OSError("file volume probe could not be read")
        return {"status": HealthStatus.READY, "volume_id": volume_id}
    except OSError:
        return {"status": HealthStatus.UNAVAILABLE}
    finally:
        if probe_path is not None:
            probe_path.unlink(missing_ok=True)

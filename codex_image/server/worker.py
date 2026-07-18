from __future__ import annotations

import signal
import threading
from uuid import uuid4

from .config import ServerSettings
from .database import PostgresConnections, ServerRuntimeRepository
from .migrations import MigrationRunner
from .volume import check_file_volume


class HeartbeatWorker:
    def __init__(self, settings: ServerSettings) -> None:
        self.settings = settings
        connections = PostgresConnections(
            settings.database_url,
            connect_timeout_seconds=settings.database_connect_timeout_seconds,
        )
        self.migrations = MigrationRunner(connections)
        self.runtime = ServerRuntimeRepository(connections)
        self.instance_id = str(uuid4())
        self.stop_event = threading.Event()
        self.volume_id: str | None = None
        self.schema_ready = False

    def stop(self) -> None:
        self.stop_event.set()

    def run_forever(self) -> None:
        try:
            while not self.stop_event.is_set():
                if not self.schema_ready:
                    self.schema_ready = self.migrations.try_apply()
                file_volume = check_file_volume(self.settings.data_root, component="worker")
                self.volume_id = file_volume.get("volume_id")
                if self.schema_ready and self.volume_id is not None:
                    try:
                        self.runtime.record_worker_heartbeat(
                            volume_id=self.volume_id,
                            instance_id=self.instance_id,
                            ready=True,
                        )
                    except Exception:
                        pass
                self.stop_event.wait(self.settings.worker_heartbeat_interval_seconds)
        finally:
            if self.volume_id is not None:
                try:
                    self.runtime.record_worker_heartbeat(
                        volume_id=self.volume_id,
                        instance_id=self.instance_id,
                        ready=False,
                    )
                except Exception:
                    pass


def main() -> int:
    worker = HeartbeatWorker(ServerSettings.from_env())
    signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    signal.signal(signal.SIGINT, lambda *_: worker.stop())
    worker.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

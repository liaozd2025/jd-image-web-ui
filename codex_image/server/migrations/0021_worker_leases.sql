CREATE TABLE IF NOT EXISTS server_worker_leases (
    component TEXT NOT NULL,
    volume_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    ready BOOLEAN NOT NULL DEFAULT TRUE,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (component, volume_id, instance_id)
);

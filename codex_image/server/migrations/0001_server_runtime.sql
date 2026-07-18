CREATE TABLE IF NOT EXISTS server_component_heartbeats (
    component TEXT NOT NULL,
    volume_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    ready BOOLEAN NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (component, volume_id)
);

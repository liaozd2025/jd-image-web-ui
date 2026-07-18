CREATE TABLE IF NOT EXISTS server_maintenance_lock (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    lock_token TEXT,
    purpose TEXT,
    acquired_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO server_maintenance_lock (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

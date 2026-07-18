CREATE TABLE IF NOT EXISTS server_runtime_identity (
    singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
    database_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO server_runtime_identity (singleton, database_id)
VALUES (1, md5(random()::TEXT || clock_timestamp()::TEXT))
ON CONFLICT (singleton) DO NOTHING;

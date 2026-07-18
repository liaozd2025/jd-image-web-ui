CREATE TABLE IF NOT EXISTS server_scheduler_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    global_concurrency INTEGER NOT NULL DEFAULT 1,
    per_user_concurrency INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO server_scheduler_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS server_scheduler_user_state (
    user_id TEXT PRIMARY KEY REFERENCES server_users(user_id),
    last_claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

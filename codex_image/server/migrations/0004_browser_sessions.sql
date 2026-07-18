CREATE TABLE IF NOT EXISTS server_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    csrf_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS server_sessions_active_user_idx
    ON server_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

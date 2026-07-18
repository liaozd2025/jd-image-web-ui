ALTER TABLE server_users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE server_sessions
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT 'Unknown browser',
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE server_sessions
SET session_id = md5(token_hash || created_at::text)
WHERE session_id IS NULL;

ALTER TABLE server_sessions
    ALTER COLUMN session_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS server_sessions_session_id_idx
    ON server_sessions (session_id);

CREATE TABLE IF NOT EXISTS server_audit_events (
    event_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
    actor_user_id TEXT REFERENCES server_users(user_id),
    subject_user_id TEXT REFERENCES server_users(user_id),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS server_audit_events_occurred_at_idx
    ON server_audit_events (occurred_at, event_id);

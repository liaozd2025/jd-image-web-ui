ALTER TABLE server_generation_tasks
    DROP CONSTRAINT IF EXISTS server_generation_tasks_status_check;

ALTER TABLE server_generation_tasks
    ADD CONSTRAINT server_generation_tasks_status_check
    CHECK (status IN ('queued', 'running', 'interrupted', 'completed', 'failed', 'cancelled'));

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS server_generation_task_attempts (
    attempt_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES server_generation_tasks(task_id),
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id),
    provider_scope TEXT NOT NULL CHECK (provider_scope IN ('personal', 'department')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'interrupted', 'cancelled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    result_relative_path TEXT,
    result_sha256 TEXT,
    result_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS server_generation_task_attempts_task_idx
    ON server_generation_task_attempts (task_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS server_generation_tasks (
    task_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id),
    model_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    request_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    result_relative_path TEXT,
    result_media_type TEXT,
    result_sha256 TEXT,
    result_bytes BIGINT,
    revised_prompt TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS server_generation_tasks_queue_idx
    ON server_generation_tasks (status, created_at, task_id);

CREATE INDEX IF NOT EXISTS server_generation_tasks_user_idx
    ON server_generation_tasks (user_id, created_at DESC, task_id);

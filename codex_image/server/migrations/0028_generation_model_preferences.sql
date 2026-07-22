CREATE TABLE IF NOT EXISTS generation_model_selection_preferences (
    user_id TEXT NOT NULL REFERENCES server_users(user_id) ON DELETE CASCADE,
    provider_scope TEXT NOT NULL CHECK (provider_scope IN ('personal', 'department')),
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id) ON DELETE CASCADE,
    generation_model_id TEXT NOT NULL REFERENCES generation_models(generation_model_id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider_scope, provider_version_id)
);

CREATE TABLE IF NOT EXISTS generation_model_parameter_preferences (
    user_id TEXT NOT NULL REFERENCES server_users(user_id) ON DELETE CASCADE,
    generation_model_id TEXT NOT NULL REFERENCES generation_models(generation_model_id) ON DELETE CASCADE,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, generation_model_id)
);

CREATE INDEX IF NOT EXISTS generation_model_parameter_preferences_user_idx
    ON generation_model_parameter_preferences (user_id, updated_at DESC);

ALTER TABLE server_generation_tasks
    DROP CONSTRAINT IF EXISTS server_generation_tasks_status_check;

ALTER TABLE server_generation_tasks
    ADD CONSTRAINT server_generation_tasks_status_check
    CHECK (status IN ('queued', 'running', 'interrupted', 'completed', 'partial_failed', 'failed', 'cancelled'));

ALTER TABLE server_generation_task_attempts
    DROP CONSTRAINT IF EXISTS server_generation_task_attempts_status_check;

ALTER TABLE server_generation_task_attempts
    ADD CONSTRAINT server_generation_task_attempts_status_check
    CHECK (status IN ('running', 'completed', 'partial_failed', 'failed', 'interrupted', 'cancelled'));

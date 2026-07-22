CREATE TABLE IF NOT EXISTS generation_model_validations (
    validation_id TEXT PRIMARY KEY,
    generation_model_id TEXT NOT NULL REFERENCES generation_models(generation_model_id),
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id),
    capability_profile_id TEXT NOT NULL,
    capability_profile_version INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'verifying', 'verified', 'failed')),
    request_parameters JSONB NOT NULL,
    provider_request_id TEXT,
    error_message TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES server_users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS generation_model_validations_queue_idx
    ON generation_model_validations (status, created_at, validation_id);

CREATE INDEX IF NOT EXISTS generation_model_validations_model_idx
    ON generation_model_validations (generation_model_id, created_at DESC);

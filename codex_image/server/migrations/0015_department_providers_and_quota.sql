CREATE TABLE IF NOT EXISTS department_provider_credentials (
    provider_version_id TEXT PRIMARY KEY REFERENCES provider_catalog_versions(provider_version_id),
    encrypted_api_key TEXT NOT NULL,
    api_key_mask TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    configured_by_user_id TEXT NOT NULL REFERENCES server_users(user_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS department_quota_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    period_end DATE NOT NULL DEFAULT (CURRENT_DATE + 30),
    quota_units BIGINT NOT NULL DEFAULT 1000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO department_quota_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS department_user_quotas (
    user_id TEXT PRIMARY KEY REFERENCES server_users(user_id),
    quota_units BIGINT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS department_usage (
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    period_start DATE NOT NULL,
    reserved_units BIGINT NOT NULL DEFAULT 0,
    consumed_units BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, period_start)
);

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS provider_scope TEXT NOT NULL DEFAULT 'personal',
    ADD COLUMN IF NOT EXISTS quota_units BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS quota_period_start DATE,
    ADD CONSTRAINT server_generation_tasks_provider_scope_check
        CHECK (provider_scope IN ('personal', 'department'));

CREATE TABLE IF NOT EXISTS server_master_key_state (
    singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
    check_ciphertext TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_catalog_versions (
    provider_version_id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    display_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_mode TEXT NOT NULL CHECK (api_mode IN ('responses', 'images')),
    models JSONB NOT NULL,
    parameter_constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id TEXT NOT NULL REFERENCES server_users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider_key, version_number)
);

CREATE INDEX IF NOT EXISTS provider_catalog_active_idx
    ON provider_catalog_versions (is_active, provider_key, version_number DESC);

CREATE TABLE IF NOT EXISTS personal_provider_credentials (
    binding_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id),
    encrypted_api_key TEXT,
    api_key_mask TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, provider_version_id),
    CHECK (
        (encrypted_api_key IS NULL AND api_key_mask IS NULL AND is_active = FALSE)
        OR (encrypted_api_key IS NOT NULL AND api_key_mask IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS personal_provider_credentials_user_idx
    ON personal_provider_credentials (user_id, is_active, updated_at DESC);

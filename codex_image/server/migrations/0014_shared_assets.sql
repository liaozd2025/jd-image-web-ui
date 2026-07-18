CREATE TABLE IF NOT EXISTS server_shared_storage_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    quota_bytes BIGINT NOT NULL DEFAULT 10737418240,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO server_shared_storage_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS server_shared_assets (
    asset_id TEXT PRIMARY KEY,
    publisher_user_id TEXT NOT NULL REFERENCES server_users(user_id),
    asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'reference', 'template', 'prompt')),
    name TEXT NOT NULL,
    current_version_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS server_shared_assets_active_idx
    ON server_shared_assets (is_active, updated_at DESC, asset_id);

CREATE TABLE IF NOT EXISTS server_shared_asset_versions (
    asset_version_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES server_shared_assets(asset_id),
    publisher_user_id TEXT NOT NULL REFERENCES server_users(user_id),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    stored_relative_path TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (asset_id, version_number)
);

CREATE INDEX IF NOT EXISTS server_shared_asset_versions_asset_idx
    ON server_shared_asset_versions (asset_id, version_number DESC);

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS shared_asset_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

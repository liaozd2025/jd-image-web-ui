ALTER TABLE server_users
    ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NOT NULL DEFAULT 1073741824;

CREATE TABLE IF NOT EXISTS server_assets (
    asset_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'reference', 'template', 'prompt')),
    name TEXT NOT NULL,
    current_version_id TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS server_assets_user_idx
    ON server_assets (user_id, deleted_at, updated_at DESC, asset_id);

CREATE TABLE IF NOT EXISTS server_asset_versions (
    asset_version_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES server_assets(asset_id),
    user_id TEXT NOT NULL REFERENCES server_users(user_id),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    stored_relative_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (asset_id, version_number),
    UNIQUE (stored_relative_path)
);

CREATE INDEX IF NOT EXISTS server_asset_versions_asset_idx
    ON server_asset_versions (asset_id, version_number DESC);

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS asset_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

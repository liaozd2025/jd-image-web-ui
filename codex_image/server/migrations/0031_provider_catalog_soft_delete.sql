ALTER TABLE provider_catalog_versions
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS provider_catalog_visible_idx
    ON provider_catalog_versions (is_active, provider_key, version_number DESC)
    WHERE deleted_at IS NULL;

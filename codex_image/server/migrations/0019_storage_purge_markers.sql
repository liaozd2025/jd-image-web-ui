ALTER TABLE server_assets
    ADD COLUMN IF NOT EXISTS storage_purged_at TIMESTAMPTZ;

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS storage_purged_at TIMESTAMPTZ;

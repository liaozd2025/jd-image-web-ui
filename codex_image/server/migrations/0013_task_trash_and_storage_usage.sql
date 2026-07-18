ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS thumbnail_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS server_generation_tasks_trash_idx
    ON server_generation_tasks (user_id, deleted_at, updated_at DESC, task_id);

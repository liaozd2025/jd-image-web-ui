ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_of_task_id TEXT REFERENCES server_generation_tasks(task_id);

CREATE INDEX IF NOT EXISTS server_generation_tasks_user_archive_idx
    ON server_generation_tasks (user_id, archived_at, created_at DESC, task_id);

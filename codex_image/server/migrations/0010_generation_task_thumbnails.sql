ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS thumbnail_relative_path TEXT;

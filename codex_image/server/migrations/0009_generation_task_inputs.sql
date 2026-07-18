ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS input_relative_path TEXT,
    ADD COLUMN IF NOT EXISTS input_media_type TEXT,
    ADD COLUMN IF NOT EXISTS input_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS input_bytes BIGINT;

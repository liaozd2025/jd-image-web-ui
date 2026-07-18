ALTER TABLE server_schema_migrations
    ADD COLUMN IF NOT EXISTS checksum TEXT;

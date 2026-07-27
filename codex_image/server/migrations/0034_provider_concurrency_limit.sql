ALTER TABLE provider_catalog_versions
    ADD COLUMN concurrency_limit INTEGER NOT NULL DEFAULT 1
    CHECK (concurrency_limit BETWEEN 1 AND 128);

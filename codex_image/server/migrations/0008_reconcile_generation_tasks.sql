ALTER TABLE server_generation_tasks
    DROP CONSTRAINT IF EXISTS server_generation_tasks_status_check;

ALTER TABLE server_generation_tasks
    ADD CONSTRAINT server_generation_tasks_status_check
    CHECK (status IN ('queued', 'running', 'interrupted', 'completed', 'failed'));

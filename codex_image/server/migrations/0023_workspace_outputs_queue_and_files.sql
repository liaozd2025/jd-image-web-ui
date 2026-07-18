ALTER TABLE server_assets
    DROP CONSTRAINT IF EXISTS server_assets_asset_kind_check;

ALTER TABLE server_assets
    ADD CONSTRAINT server_assets_asset_kind_check
    CHECK (asset_kind IN ('image', 'reference', 'template', 'prompt', 'file'));

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS output_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS queue_position BIGINT;

WITH ranked AS (
    SELECT task_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, task_id) AS position
    FROM server_generation_tasks
)
UPDATE server_generation_tasks AS tasks
SET queue_position = ranked.position
FROM ranked
WHERE tasks.task_id = ranked.task_id
  AND tasks.queue_position IS NULL;

ALTER TABLE server_generation_tasks
    ALTER COLUMN queue_position SET NOT NULL;

ALTER TABLE server_generation_tasks
    ADD CONSTRAINT server_generation_tasks_queue_position_check
    CHECK (queue_position > 0);

CREATE INDEX IF NOT EXISTS server_generation_tasks_user_queue_idx
    ON server_generation_tasks (user_id, status, queue_position, created_at, task_id);

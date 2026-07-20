CREATE TABLE IF NOT EXISTS server_shared_gallery_categories (
    category_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS server_shared_gallery_categories_name_unique_idx
    ON server_shared_gallery_categories (LOWER(name));

INSERT INTO server_shared_gallery_categories (category_id, name, sort_order, is_system)
VALUES
    ('uncategorized', '未分类', 10, TRUE),
    ('product-images', '产品图片', 20, FALSE),
    ('brand-assets', '品牌素材', 30, FALSE),
    ('people', '人物形象', 40, FALSE),
    ('scenes', '场景参考', 50, FALSE)
ON CONFLICT (category_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS server_shared_gallery_items (
    asset_id TEXT PRIMARY KEY REFERENCES server_shared_assets(asset_id),
    category_id TEXT NOT NULL REFERENCES server_shared_gallery_categories(category_id),
    prompt_note TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO server_shared_gallery_items (asset_id, category_id, prompt_note, sort_order)
SELECT
    assets.asset_id,
    'uncategorized',
    '',
    ROW_NUMBER() OVER (ORDER BY assets.created_at, assets.asset_id) * 10
FROM server_shared_assets AS assets
WHERE assets.asset_kind IN ('image', 'reference')
ON CONFLICT (asset_id) DO NOTHING;

WITH duplicate_names AS (
    SELECT
        asset_id,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(name)
            ORDER BY created_at, asset_id
        ) AS duplicate_number
    FROM server_shared_assets
    WHERE asset_kind IN ('image', 'reference')
)
UPDATE server_shared_assets AS assets
SET name = LEFT(assets.name, 145) || ' [' || LEFT(assets.asset_id, 8) || ']'
FROM duplicate_names
WHERE duplicate_names.asset_id = assets.asset_id
  AND duplicate_names.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS server_shared_gallery_asset_name_unique_idx
    ON server_shared_assets (LOWER(name))
    WHERE asset_kind IN ('image', 'reference');

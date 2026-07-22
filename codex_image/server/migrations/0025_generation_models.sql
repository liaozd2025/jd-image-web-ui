CREATE TABLE IF NOT EXISTS generation_models (
    generation_model_id TEXT PRIMARY KEY,
    provider_version_id TEXT NOT NULL REFERENCES provider_catalog_versions(provider_version_id),
    owner_user_id TEXT REFERENCES server_users(user_id),
    display_name TEXT NOT NULL,
    model_id TEXT NOT NULL,
    capability_profile_id TEXT NOT NULL,
    capability_profile_version INTEGER NOT NULL CHECK (capability_profile_version > 0),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    validation_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (validation_status IN ('not_required', 'unverified', 'queued', 'verifying', 'verified', 'failed')),
    validation_request_id TEXT,
    validation_error TEXT,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_models_department_model_idx
    ON generation_models (provider_version_id, model_id)
    WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS generation_models_personal_model_idx
    ON generation_models (provider_version_id, owner_user_id, model_id)
    WHERE owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS generation_models_department_default_idx
    ON generation_models (provider_version_id)
    WHERE owner_user_id IS NULL AND is_default;

CREATE UNIQUE INDEX IF NOT EXISTS generation_models_personal_default_idx
    ON generation_models (provider_version_id, owner_user_id)
    WHERE owner_user_id IS NOT NULL AND is_default;

WITH legacy_models AS (
    SELECT
        versions.provider_version_id,
        item.value AS model,
        item.ordinality
    FROM provider_catalog_versions AS versions
    CROSS JOIN LATERAL jsonb_array_elements(versions.models) WITH ORDINALITY AS item(value, ordinality)
)
INSERT INTO generation_models (
    generation_model_id,
    provider_version_id,
    owner_user_id,
    display_name,
    model_id,
    capability_profile_id,
    capability_profile_version,
    is_default,
    is_enabled,
    validation_status
)
SELECT
    'gm-' || substr(md5(provider_version_id || ':' || ordinality::text || ':' || COALESCE(model->>'model_id', '')), 1, 24),
    provider_version_id,
    NULL,
    COALESCE(NULLIF(model->>'display_name', ''), model->>'model_id'),
    model->>'model_id',
    COALESCE(NULLIF(model->>'capability_profile_id', ''), 'generic-basic'),
    COALESCE((model->>'capability_profile_version')::INTEGER, 1),
    COALESCE((model->>'is_default')::BOOLEAN, ordinality = 1),
    COALESCE((model->>'is_enabled')::BOOLEAN, TRUE),
    COALESCE(NULLIF(model->>'validation_status', ''), 'unverified')
FROM legacy_models
WHERE NULLIF(model->>'model_id', '') IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE provider_catalog_versions AS versions
SET models = canonical.models
FROM (
    SELECT
        provider_version_id,
        jsonb_agg(
            jsonb_build_object(
                'generation_model_id', generation_model_id,
                'display_name', display_name,
                'model_id', model_id,
                'capability_profile_id', capability_profile_id,
                'capability_profile_version', capability_profile_version,
                'is_default', is_default,
                'is_enabled', is_enabled,
                'validation_status', validation_status
            )
            ORDER BY is_default DESC, created_at, generation_model_id
        ) AS models
    FROM generation_models
    WHERE owner_user_id IS NULL
    GROUP BY provider_version_id
) AS canonical
WHERE canonical.provider_version_id = versions.provider_version_id;

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS generation_model_id TEXT REFERENCES generation_models(generation_model_id),
    ADD COLUMN IF NOT EXISTS model_display_name TEXT,
    ADD COLUMN IF NOT EXISTS capability_profile_id TEXT,
    ADD COLUMN IF NOT EXISTS capability_profile_version INTEGER,
    ADD COLUMN IF NOT EXISTS capability_snapshot JSONB;

UPDATE server_generation_tasks AS tasks
SET generation_model_id = models.generation_model_id,
    model_display_name = models.display_name,
    capability_profile_id = models.capability_profile_id,
    capability_profile_version = models.capability_profile_version
FROM generation_models AS models
WHERE tasks.generation_model_id IS NULL
  AND models.owner_user_id IS NULL
  AND models.provider_version_id = tasks.provider_version_id
  AND models.model_id = tasks.model_id;

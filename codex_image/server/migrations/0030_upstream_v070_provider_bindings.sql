ALTER TABLE generation_models
    ADD COLUMN IF NOT EXISTS model_family_id TEXT,
    ADD COLUMN IF NOT EXISTS canonical_model_id TEXT,
    ADD COLUMN IF NOT EXISTS protocol_profile TEXT,
    ADD COLUMN IF NOT EXISTS parameter_codec TEXT,
    ADD COLUMN IF NOT EXISTS supported_operations JSONB,
    ADD COLUMN IF NOT EXISTS append_aspect_ratio_prompt BOOLEAN;

UPDATE generation_models AS models
SET model_family_id = COALESCE(
        models.model_family_id,
        CASE
            WHEN models.capability_profile_id IN (
                'nano-banana-pro', 'nano-banana-2', 'nano-banana-2-lite'
            ) THEN 'gemini-image'
            WHEN models.capability_profile_id LIKE 'seedream-%' THEN 'seedream-image'
            ELSE 'gpt-image'
        END
    ),
    canonical_model_id = COALESCE(
        models.canonical_model_id,
        CASE
            WHEN models.capability_profile_id IN (
                'nano-banana-pro', 'nano-banana-2', 'nano-banana-2-lite'
            ) THEN models.capability_profile_id
            WHEN lower(models.model_id) = 'gpt-image-2' THEN 'gpt-image-2'
            ELSE models.model_id
        END
    ),
    protocol_profile = COALESCE(
        models.protocol_profile,
        CASE
            WHEN models.capability_profile_id IN (
                'nano-banana-pro', 'nano-banana-2', 'nano-banana-2-lite'
            ) THEN 'gemini_generate_content'
            WHEN versions.api_mode = 'responses' THEN 'openai_responses'
            ELSE 'openai_images'
        END
    ),
    parameter_codec = COALESCE(
        models.parameter_codec,
        CASE
            WHEN models.capability_profile_id IN (
                'nano-banana-pro', 'nano-banana-2', 'nano-banana-2-lite'
            ) THEN 'gemini_generate_content_image'
            WHEN versions.api_mode = 'responses' THEN 'gpt_openai_responses'
            ELSE 'gpt_openai_images'
        END
    ),
    supported_operations = COALESCE(
        models.supported_operations,
        '["generate","edit"]'::jsonb
    ),
    append_aspect_ratio_prompt = COALESCE(models.append_aspect_ratio_prompt, FALSE)
FROM provider_catalog_versions AS versions
WHERE versions.provider_version_id = models.provider_version_id;

ALTER TABLE generation_models
    ALTER COLUMN model_family_id SET NOT NULL,
    ALTER COLUMN canonical_model_id SET NOT NULL,
    ALTER COLUMN protocol_profile SET NOT NULL,
    ALTER COLUMN parameter_codec SET NOT NULL,
    ALTER COLUMN supported_operations SET NOT NULL,
    ALTER COLUMN supported_operations SET DEFAULT '["generate","edit"]'::jsonb,
    ALTER COLUMN append_aspect_ratio_prompt SET NOT NULL,
    ALTER COLUMN append_aspect_ratio_prompt SET DEFAULT FALSE;

ALTER TABLE generation_models
    DROP CONSTRAINT IF EXISTS generation_models_supported_operations_check;

ALTER TABLE generation_models
    ADD CONSTRAINT generation_models_supported_operations_check CHECK (
        jsonb_typeof(supported_operations) = 'array'
        AND supported_operations <@ '["generate","edit"]'::jsonb
        AND jsonb_array_length(supported_operations) > 0
    );

ALTER TABLE server_generation_tasks
    ADD COLUMN IF NOT EXISTS generation_snapshot JSONB;

UPDATE server_generation_tasks AS tasks
SET generation_snapshot = jsonb_build_object(
        'schema_version', 1,
        'model_family_id', models.model_family_id,
        'canonical_model_id', models.canonical_model_id,
        'remote_model_id', tasks.model_id,
        'provider_version_id', tasks.provider_version_id,
        'generation_model_id', tasks.generation_model_id,
        'protocol_profile', models.protocol_profile,
        'parameter_codec', models.parameter_codec,
        'supported_operations', models.supported_operations,
        'append_aspect_ratio_prompt', models.append_aspect_ratio_prompt,
        'capability_profile_id', tasks.capability_profile_id,
        'capability_profile_version', tasks.capability_profile_version,
        'capability_snapshot', COALESCE(tasks.capability_snapshot, '{}'::jsonb),
        'requested_parameters', COALESCE(tasks.request_parameters, '{}'::jsonb)
    )
FROM generation_models AS models
WHERE tasks.generation_snapshot IS NULL
  AND models.generation_model_id = tasks.generation_model_id;

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
                'model_family_id', model_family_id,
                'canonical_model_id', canonical_model_id,
                'protocol_profile', protocol_profile,
                'parameter_codec', parameter_codec,
                'supported_operations', supported_operations,
                'append_aspect_ratio_prompt', append_aspect_ratio_prompt,
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

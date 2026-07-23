WITH recognized AS (
    UPDATE generation_models
    SET capability_profile_id = 'seedream-5-lite',
        capability_profile_version = 1,
        model_family_id = 'seedream-image',
        validation_status = CASE
            WHEN owner_user_id IS NULL THEN 'unverified'
            ELSE 'not_required'
        END,
        validation_request_id = NULL,
        validation_error = NULL,
        validated_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE capability_profile_id = 'generic-basic'
      AND lower(model_id) IN (
          'doubao-seedream-5-0-260128',
          'doubao-seedream-5-0-lite-260128'
      )
    RETURNING provider_version_id
), affected AS (
    SELECT DISTINCT provider_version_id FROM recognized
), canonical AS (
    SELECT
        models.provider_version_id,
        jsonb_agg(
            jsonb_build_object(
                'generation_model_id', models.generation_model_id,
                'display_name', models.display_name,
                'model_id', models.model_id,
                'capability_profile_id', models.capability_profile_id,
                'capability_profile_version', models.capability_profile_version,
                'is_default', models.is_default,
                'is_enabled', models.is_enabled,
                'validation_status', models.validation_status
            )
            ORDER BY models.is_default DESC, models.created_at, models.generation_model_id
        ) AS models
    FROM generation_models AS models
    JOIN affected USING (provider_version_id)
    WHERE models.owner_user_id IS NULL
    GROUP BY models.provider_version_id
)
UPDATE provider_catalog_versions AS versions
SET models = canonical.models
FROM canonical
WHERE canonical.provider_version_id = versions.provider_version_id;

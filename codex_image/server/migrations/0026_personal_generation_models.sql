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
    'gm-personal-' || substr(
        md5(credentials.user_id || ':' || models.generation_model_id),
        1,
        24
    ),
    models.provider_version_id,
    credentials.user_id,
    models.display_name,
    models.model_id,
    models.capability_profile_id,
    models.capability_profile_version,
    models.is_default,
    models.is_enabled,
    'not_required'
FROM personal_provider_credentials AS credentials
JOIN generation_models AS models
  ON models.provider_version_id = credentials.provider_version_id
 AND models.owner_user_id IS NULL
ON CONFLICT DO NOTHING;

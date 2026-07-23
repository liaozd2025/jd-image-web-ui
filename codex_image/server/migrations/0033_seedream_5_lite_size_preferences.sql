UPDATE generation_model_parameter_preferences AS preferences
SET parameters = jsonb_set(
        jsonb_set(
            preferences.parameters - 'canvas.size' - 'canvas.resolution',
            '{size}',
            '"2048x2048"'::jsonb,
            TRUE
        ),
        '{resolution}',
        '"2k"'::jsonb,
        TRUE
    ),
    updated_at = CURRENT_TIMESTAMP
FROM generation_models AS models
WHERE models.generation_model_id = preferences.generation_model_id
  AND models.capability_profile_id = 'seedream-5-lite'
  AND lower(models.model_id) IN (
      'doubao-seedream-5-0-260128',
      'doubao-seedream-5-0-lite-260128'
  )
  AND COALESCE(
      NULLIF(preferences.parameters->>'size', ''),
      NULLIF(preferences.parameters->>'canvas.size', ''),
      ''
  ) IN ('', '1024x1024');

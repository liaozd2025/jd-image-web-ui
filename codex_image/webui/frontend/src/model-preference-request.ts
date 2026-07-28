export type GenerationModelPreferencePayload = {
  provider_scope: "personal" | "department";
  provider_version_id: string;
  generation_model_id: string;
  parameters: Record<string, unknown>;
};

export function buildGenerationModelPreferencePayload(
  provider: unknown,
  model: unknown,
  parameters: Record<string, unknown>,
): GenerationModelPreferencePayload | null {
  if (!provider || typeof provider !== "object" || !model || typeof model !== "object") return null;

  const providerRecord = provider as Record<string, unknown>;
  const modelRecord = model as Record<string, unknown>;
  const providerScope = providerRecord.provider_scope;
  const providerVersionId = String(providerRecord.provider_version_id || "").trim();
  const generationModelId = String(modelRecord.generation_model_id || "").trim();
  if ((providerScope !== "personal" && providerScope !== "department")
      || !providerVersionId || !generationModelId) return null;

  return {
    provider_scope: providerScope,
    provider_version_id: providerVersionId,
    generation_model_id: generationModelId,
    parameters,
  };
}

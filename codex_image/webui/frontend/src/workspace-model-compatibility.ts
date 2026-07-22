export function usesLegacyWorkspaceControls(
  modelId: string | null | undefined,
  familyId: string | null | undefined = null,
): boolean {
  const normalizedModelId = String(modelId || "").trim();
  return normalizedModelId === "gpt-image-2"
    || familyId === "seedream-image"
    || /(?:^|[\/_-])seedream(?:[\/_-]|$)/i.test(normalizedModelId);
}

export function usesLegacyMainModelControl(modelId: string | null | undefined): boolean {
  return !modelId || modelId === "gpt-image-2";
}

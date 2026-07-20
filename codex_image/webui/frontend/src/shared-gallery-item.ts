import { translate } from "./i18n";

export function sharedGalleryItemFromAsset(asset: any, fallbackName = "") {
  const assetId = String(asset?.asset_id || "");
  const versionId = String(asset?.current_version_id || "");
  if (!assetId || !versionId) return null;
  return {
    id: `shared:${assetId}`,
    asset_id: assetId,
    asset_version_id: versionId,
    name: String(asset.name || fallbackName || translate("gallery.sharedImageFallbackName")),
    category: String(asset.category_id || "uncategorized"),
    category_name: String(asset.category_name || translate("gallery.uncategorized")),
    category_prompt_role: "",
    prompt_note: String(asset.prompt_note || ""),
    order: Number(asset.sort_order) || 0,
    image_url: asset.download_url || `/api/shared-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/download`,
    scope: "shared",
    read_only: true,
    is_active: asset.is_active !== false,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

import { translate } from "./i18n";

export type ResourceScope = "personal" | "shared";

export function normalizeResourceScope(value: any): ResourceScope {
  return value === "shared" ? "shared" : "personal";
}

export function resourceScopeBadgeHtml(value: any): string {
  const scope = normalizeResourceScope(value);
  const key = scope === "shared" ? "resourceScope.shared" : "resourceScope.personal";
  return `<span class="resource-scope-badge resource-scope-${scope}">${translate(key)}</span>`;
}

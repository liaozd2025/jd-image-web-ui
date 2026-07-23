export function isModelSizeSupported(profile: any, size: string): boolean {
  if (!profile || !size) return false;
  if (!profile.custom_size && !(profile.sizes || []).includes(size)) return false;
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return (profile.sizes || []).includes(size);
  const width = Number(match[1]);
  const height = Number(match[2]);
  const constraints = profile.size_constraints || {};
  const aspect = height ? width / height : 0;
  return width >= Number(constraints.min_dimension || 1)
    && height >= Number(constraints.min_dimension || 1)
    && width <= Number(constraints.max_dimension || Number.MAX_SAFE_INTEGER)
    && height <= Number(constraints.max_dimension || Number.MAX_SAFE_INTEGER)
    && width * height >= Number(constraints.min_pixels || 1)
    && aspect >= Number(constraints.min_aspect_ratio || 0)
    && aspect <= Number(constraints.max_aspect_ratio || Number.MAX_SAFE_INTEGER);
}

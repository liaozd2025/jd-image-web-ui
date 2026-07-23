function parseSize(size: string): [number, number] | null {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || ""));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? [width, height]
    : null;
}

function parseRatio(ratio: string): [number, number] | null {
  const match = /^(\d+):(\d+)$/.exec(String(ratio || ""));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? [width, height]
    : null;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function leastCommonMultiple(left: number, right: number): number {
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function sizeMatchesRatio(size: [number, number], ratio: [number, number]): boolean {
  return size[0] * ratio[1] === size[1] * ratio[0];
}

export function isModelSizeSupported(profile: any, size: string): boolean {
  if (!profile || !size) return false;
  if (!profile.custom_size && !(profile.sizes || []).includes(size)) return false;
  const dimensions = parseSize(size);
  if (!dimensions) return (profile.sizes || []).includes(size);
  const [width, height] = dimensions;
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

export function constrainedSizeForRatio(
  profile: any,
  size: string,
  ratio: string,
): string {
  const dimensions = parseSize(size);
  const ratioDimensions = parseRatio(ratio);
  if (!profile?.custom_size || !dimensions || !ratioDimensions) return size;
  if (isModelSizeSupported(profile, size) && sizeMatchesRatio(dimensions, ratioDimensions)) {
    return size;
  }

  const ratioDivisor = greatestCommonDivisor(ratioDimensions[0], ratioDimensions[1]);
  const ratioWidth = ratioDimensions[0] / ratioDivisor;
  const ratioHeight = ratioDimensions[1] / ratioDivisor;
  const constraints = profile.size_constraints || {};
  const minimumDimension = Number(constraints.min_dimension || 1);
  const minimumPixels = Number(constraints.min_pixels || 1);
  const multipleOf = Math.max(1, Number(constraints.multiple_of || 16));
  const unitMultiple = leastCommonMultiple(
    multipleOf / greatestCommonDivisor(ratioWidth, multipleOf),
    multipleOf / greatestCommonDivisor(ratioHeight, multipleOf),
  );
  const selectedArea = dimensions[0] * dimensions[1];
  const minimumUnit = Math.max(
    Math.sqrt(selectedArea / (ratioWidth * ratioHeight)),
    minimumDimension / ratioWidth,
    minimumDimension / ratioHeight,
    Math.sqrt(minimumPixels / (ratioWidth * ratioHeight)),
  );
  const unit = Math.ceil(minimumUnit / unitMultiple) * unitMultiple;
  const candidate = `${ratioWidth * unit}x${ratioHeight * unit}`;
  return isModelSizeSupported(profile, candidate) ? candidate : size;
}

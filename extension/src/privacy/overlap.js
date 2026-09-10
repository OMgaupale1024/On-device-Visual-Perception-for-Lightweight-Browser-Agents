// Both inputs are screenshot pixels. Two pixels cover rounding at mask edges.
export function validateRegions(regions) {
  if (!Array.isArray(regions) || regions.some((r) => !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0)) {
    throw new Error('Sensitive geometry unavailable.');
  }
}
export function overlapsSensitive(box, regions) {
  validateRegions(regions);
  const padding = 2;
  return regions.some((r) => Math.min(box.x + box.width, r.x + r.width + padding) > Math.max(box.x, r.x - padding) &&
    Math.min(box.y + box.height, r.y + r.height + padding) > Math.max(box.y, r.y - padding));
}

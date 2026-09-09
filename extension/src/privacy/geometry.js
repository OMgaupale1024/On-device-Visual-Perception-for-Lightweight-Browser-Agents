function validSize(size) {
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

export function mapRect(rect, viewport, screenshot) {
  if (!validSize(viewport) || !validSize(screenshot) || !validSize(rect) ||
      !Number.isFinite(rect.x) || !Number.isFinite(rect.y)) throw new Error('Invalid capture geometry.');
  const scaleX = screenshot.width / viewport.width;
  const scaleY = screenshot.height / viewport.height;
  // Round outward, never inward: cover fractional CSS borders completely.
  const x = Math.max(0, Math.min(screenshot.width, Math.floor(rect.x * scaleX)));
  const y = Math.max(0, Math.min(screenshot.height, Math.floor(rect.y * scaleY)));
  const right = Math.max(0, Math.min(screenshot.width, Math.ceil((rect.x + rect.width) * scaleX)));
  const bottom = Math.max(0, Math.min(screenshot.height, Math.ceil((rect.y + rect.height) * scaleY)));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function sensitiveRegions(fields, viewport, screenshot) {
  if (!validSize(viewport) || !validSize(screenshot)) throw new Error('Invalid capture geometry.');
  return fields.filter((f) => f.sensitive).map((f) => {
    const rect = mapRect(f.rect, viewport, screenshot);
    if (!rect) throw new Error('Sensitive field outside capture.');
    return { id: f.id, role: f.role, ...rect };
  });
}

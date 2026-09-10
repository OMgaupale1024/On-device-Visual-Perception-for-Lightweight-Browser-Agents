import { ENGINE, ENGINE_VERSION } from './config.js';

export function normalizeBBox(box, width, height) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid OCR image dimensions.');
  if (!box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0) throw new Error('Malformed OCR geometry.');
  const x = Math.max(0, Math.min(width, Math.floor(box.x0)));
  const y = Math.max(0, Math.min(height, Math.floor(box.y0)));
  const right = Math.max(0, Math.min(width, Math.ceil(box.x1)));
  const bottom = Math.max(0, Math.min(height, Math.ceil(box.y1)));
  if (right <= x || bottom <= y) throw new Error('OCR box outside image.');
  return { x, y, width: right - x, height: bottom - y };
}

export function normalizeResult(result) {
  const { data, width, height, timing } = result ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      !data || typeof data.text !== 'string' || !timing || typeof timing.cold !== 'boolean' ||
      ![timing.initializationMs, timing.inferenceMs, timing.totalMs].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error('Malformed OCR result.');
  }
  const blocks = data.blocks ?? [];
  if (!Array.isArray(blocks) || (!blocks.length && data.text.trim())) throw new Error('OCR boxes unavailable.');
  const items = [];
  for (const block of blocks) {
    if (!Array.isArray(block.paragraphs)) throw new Error('Malformed OCR blocks.');
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph.lines)) throw new Error('Malformed OCR lines.');
      for (const line of paragraph.lines) {
        if (typeof line.text !== 'string') throw new Error('Malformed OCR text.');
        if (!line.text.trim()) continue;
        if (items.length >= 2000 || line.text.length > 2000) throw new Error('OCR result too large.');
        const confidence = typeof line.confidence === 'number' && Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 100 ? line.confidence / 100 : null;
        items.push({ id: `visual_${items.length + 1}`, text: line.text,
          bbox: normalizeBBox(line.bbox, width, height), confidence });
      }
    }
  }
  return { engine: ENGINE, engineVersion: ENGINE_VERSION, width, height, coordinateSystem: 'screenshot-pixels',
    processingMs: timing.totalMs, timing: { cold: timing.cold, initializationMs: timing.initializationMs,
      inferenceMs: timing.inferenceMs, totalMs: timing.totalMs }, items };
}

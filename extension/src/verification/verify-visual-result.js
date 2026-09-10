// Local outcome policy. Only builder-approved current pixel OCR can be evidence.
import { prepareAgentContextForTransport } from '../privacy/agent-context.js';

export const TRAVEL_SUBMISSION = Object.freeze({
  type: 'VISUAL_TEXT', expectedText: 'Travel Request Submitted',
});

export function normalizeText(text) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ')
    .replace(/\s*([.,!?;:])\s*/gu, '$1 ').trim();
}

// Tesseract currently emits lines. Also handle adjacent fragments without assuming
// the engine's array order. Fixed row anchors keep this ordering deterministic.
function readingOrder(elements) {
  const rows = [];
  for (const item of [...elements].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x || a.id.localeCompare(b.id))) {
    const b = item.bbox;
    let row = rows.find((r) => Math.min(r.y + r.height, b.y + b.height) - Math.max(r.y, b.y) >= Math.min(r.height, b.height) * 0.5);
    if (!row) { row = { y: b.y, height: b.height, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.bbox.x - b.bbox.x || a.id.localeCompare(b.id)));
}

function adjacent(a, b) {
  const h = Math.max(a.height, b.height);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapY >= Math.min(a.height, b.height) * 0.5) {
    return b.x >= a.x + a.width && b.x - (a.x + a.width) <= 2 * h;
  }
  return b.y >= a.y + a.height && b.y - (a.y + a.height) <= 1.5 * h &&
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
}

export function verifyVisualResult(context, { actionObservationId, dispatchedAt }, spec = TRAVEL_SUBMISSION) {
  const failed = (reason) => ({ status: 'NOT_VERIFIED', reason });
  // This checks an existing local approval capability; it does not send anything.
  try { prepareAgentContextForTransport(context); } catch { return failed('PRIVACY_FAILED'); }
  if (spec.type !== TRAVEL_SUBMISSION.type || spec.expectedText !== TRAVEL_SUBMISSION.expectedText) return failed('INVALID_SPEC');
  if (context.observation.id === actionObservationId || !Number.isFinite(dispatchedAt) ||
      !(Date.parse(context.observation.capturedAt) > dispatchedAt)) return failed('STALE_OBSERVATION');
  const items = readingOrder(context.visualElements.filter((v) => v.source === 'visual' &&
    v.bbox.width > 0 && v.bbox.height > 0));
  // Full phrase and word boundaries, no edit-distance/fuzzy spelling or partial words.
  const phrase = /(^|[^\p{L}\p{N}_])travel request submitted($|[^\p{L}\p{N}_])/u;
  for (let start = 0; start < items.length; start++) {
    const contributing = [];
    for (let end = start; end < Math.min(start + 3, items.length); end++) {
      if (end > start && !adjacent(items[end - 1].bbox, items[end].bbox)) break;
      contributing.push(items[end]);
      if (phrase.test(normalizeText(contributing.map((v) => v.text).join(' ')))) {
        return { status: 'VERIFIED', evidence: { type: spec.type, expected: spec.expectedText,
          matched: true, source: 'visual',
          visualIds: contributing.map((v) => v.id),
          confidences: contributing.map((v) => v.confidence) } };
      }
    }
  }
  return failed('NO_VISUAL_MATCH');
}

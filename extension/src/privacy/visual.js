import { checkOutbound } from './guard.js';
import { normalizeResult } from '../perception/normalize.js';
import { overlapsSensitive, validateRegions } from './overlap.js';

export const canonical = (text) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const blocked = () => ({ status: 'UNSAFE', reason: 'Visual privacy check blocked output.' });
export const obviousPII = (text) => /[\p{L}\p{N}._%+-]+\s*@\s*[\p{L}\p{N}.-]+\s*\.\s*[a-z]{2,}/iu.test(text) ||
  /(?:\+?\d[\s().-]*){7,}/u.test(text) || /\bEMP[\s-]*\d{3,}\b/i.test(text);

// Re-check for refined OCR text before it can replace an element's label: non-empty,
// no known sensitive value, no obvious PII pattern. Refinement must never leak.
export function visualTextIsSafe(text, sensitiveValues) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (obviousPII(text)) return false;
  const known = (Array.isArray(sensitiveValues) ? sensitiveValues : []).map(canonical).filter(Boolean);
  return !known.some((v) => canonical(text).includes(v));
}

// Raw engine output is trusted-local ONLY. Copy a narrow schema, then filter lines.
// Geometry is used after recognition; it never supplies text to the OCR engine.
export function sanitizeVisual(result, sensitiveValues, regions) {
  try {
    validateRegions(regions);
    if (!Array.isArray(sensitiveValues) || sensitiveValues.some((v) => typeof v !== 'string')) return blocked();
    const normalized = normalizeResult(result);
    const known = sensitiveValues.map(canonical).filter(Boolean);
    const containsKnown = (text) => known.some((value) => canonical(text).includes(value));
    let withheldItems = 0;
    const items = normalized.items.flatMap((item) => {
      const text = item.text.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text || overlapsSensitive(item.bbox, regions) || containsKnown(text) || obviousPII(text)) {
        withheldItems++; return [];
      }
      return [{ ...item, text }];
    });
    const value = { ...normalized, items, withheldItems };
    // Catch known values fragmented across retained lines, and all outgoing strings.
    if (containsKnown(items.map((item) => item.text).join(' ')) || !checkOutbound(value, sensitiveValues).safe) return blocked();
    return { status: items.length ? 'Ready' : 'Empty', privacy: 'SAFE', value };
  } catch {
    return { status: 'ERROR', reason: 'Visual result unavailable.' };
  }
}

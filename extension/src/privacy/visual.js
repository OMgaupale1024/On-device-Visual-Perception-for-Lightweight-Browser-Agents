import { checkOutbound } from './guard.js';
import { normalizeResult } from '../perception/normalize.js';

// OUTPUT policy only. Never fed into inference as prompts, labels or recognition hints.
// The prototype releases only actual OCR lines composed of this safe UI vocabulary.
const SAFE_WORDS = new Set('employee travel request name email phone id destination bengaluru purpose conference password continue demo form fake data only used to exercise edgesight perception'.split(' '));
const canonical = (text) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function sanitizeVisual(result, sensitiveValues) {
  // Scan ALL OCR strings before dropping anything, then scan normalized strings as defense
  // against whitespace/case splitting. Return no engine text on a privacy failure.
  if (!checkOutbound(result, sensitiveValues).safe) return { status: 'UNSAFE', reason: 'Visual privacy check blocked output.' };
  try {
    const normalized = normalizeResult(result);
    const rawText = [result.data.text, ...normalized.items.map((i) => i.text)].join(' ');
    const comparable = canonical(rawText);
    if (sensitiveValues.some((value) => canonical(value) && comparable.includes(canonical(value)))) {
      return { status: 'UNSAFE', reason: 'Visual privacy check blocked output.' };
    }
    let withheldItems = 0;
    const items = normalized.items.flatMap((item) => {
      const text = item.text.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = text.toLowerCase().replace(/[.,:;!—–-]/g, ' ').split(/\s+/).filter(Boolean);
      if (!words.length || words.some((word) => !SAFE_WORDS.has(word))) { withheldItems++; return []; }
      return [{ ...item, text }];
    });
    const value = { ...normalized, items, withheldItems };
    if (!checkOutbound(value, sensitiveValues).safe) return { status: 'UNSAFE', reason: 'Visual privacy check blocked output.' };
    return { status: items.length ? 'Ready' : 'Empty', privacy: 'SAFE', value };
  } catch {
    return { status: 'ERROR', reason: 'Visual result unavailable.' };
  }
}

// Pure measurement math. No transport, persistence, page access or quality claims.
export const SIH_WEIGHTS = Object.freeze({ visualContext: 25, piiDetection: 20, redaction: 20, resources: 20, latency: 15 });
export const ratio = (n, d) => d === 0 ? null : n / d;
export const utf8Bytes = (text) => new TextEncoder().encode(text).length;
export const bytesToMiB = (bytes) => bytes / (1024 * 1024);

export function classification({ tp, fp, fn, tn = 0 }) {
  if (![tp, fp, fn, tn].every((n) => Number.isSafeInteger(n) && n >= 0)) throw Error('Invalid counts');
  return { tp, fp, fn, tn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
    f1: ratio(2 * tp, 2 * tp + fp + fn) };
}
export function scoreLabels(expected, predicted, roles) {
  if (expected.length !== predicted.length) throw Error('Label count mismatch');
  const count = (positive) => {
    const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
    expected.forEach((label, i) => { const e = positive(label), p = positive(predicted[i]); c[e ? (p ? 'tp' : 'fn') : (p ? 'fp' : 'tn')]++; });
    return classification(c);
  };
  return { samples: expected.length, overall: count((label) => roles.includes(label)),
    perCategory: Object.fromEntries(roles.map((role) => [role, count((label) => label === role)])) };
}

// Exact line-item normalization. Punctuation is retained, with standardized spacing.
export const normalizeItem = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ')
  .replace(/\s*([.,!?;:])\s*/gu, '$1 ').trim();
export function scoreVisual(expected, prediction) {
  if (prediction?.source !== 'local-pixel-ocr' || !Array.isArray(prediction.items)) throw Error('Pixel OCR required');
  if (prediction.items.some((v) => v.source !== 'visual' || typeof v.text !== 'string')) throw Error('Visual source required');
  const remaining = prediction.items.map((v) => normalizeItem(v.text));
  const missedIndexes = [];
  expected.forEach((text, i) => {
    const index = remaining.indexOf(normalizeItem(text));
    if (index < 0) missedIndexes.push(i); else remaining.splice(index, 1);
  });
  const correct = expected.length - missedIndexes.length;
  return { expected: expected.length, correct, missed: missedIndexes.length, unexpected: remaining.length,
    missedIndexes, accuracy: ratio(correct, expected.length), precision: ratio(correct, prediction.items.length) };
}
function area(b) {
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) throw Error('Invalid region');
  return b.width * b.height;
}
export function intersection(a, b) {
  area(a); area(b);
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
export const iou = (a, b) => { const overlap = intersection(a, b); return overlap / (area(a) + area(b) - overlap); };
export function scoreRedaction(sensitive, safe, masks, threshold = 0.5) {
  if (!(threshold > 0 && threshold <= 1)) throw Error('Invalid IoU threshold');
  const edges = sensitive.flatMap((truth, i) => masks.map((mask, j) => ({ i, j, overlap: iou(truth, mask) })))
    .filter((e) => e.overlap >= threshold).sort((a, b) => b.overlap - a.overlap || a.i - b.i || a.j - b.j);
  const expectedMatched = new Set(), masksMatched = new Set();
  for (const e of edges) if (!expectedMatched.has(e.i) && !masksMatched.has(e.j)) { expectedMatched.add(e.i); masksMatched.add(e.j); }
  const damaged = safe.filter((region) => masks.some((mask) => intersection(region, mask) > 0)).length;
  const correct = expectedMatched.size;
  return { expected: sensitive.length, masks: masks.length, correct, missed: sensitive.length - correct,
    unnecessary: masks.length - correct, safeRegions: safe.length, safeDamaged: damaged,
    precision: ratio(correct, masks.length), recall: ratio(correct, sensitive.length),
    safePreservation: ratio(safe.length - damaged, safe.length), iouThreshold: threshold };
}
export function statistics(values) {
  if (!values.every((v) => Number.isFinite(v) && v >= 0)) throw Error('Invalid measurements');
  if (!values.length) return { count: 0, min: null, median: null, mean: null, max: null };
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { count: n, min: sorted[0], median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    mean: sorted.reduce((a, b) => a + b, 0) / n, max: sorted[n - 1],
    ...(n >= 20 ? { p95: sorted[Math.ceil(n * 0.95) - 1] } : {}) };
}

const TIMINGS = ['captureMs', 'detectionMs', 'redactionMs', 'semanticGuardMs', 'perceptionMs',
  'contextGuardMs', 'visualGuardMs', 'localTotalMs', 'plannerRoundTripMs', 'actionPreparationMs',
  'planMs', 'clickDispatchMs', 'postExecutionMs', 'machineTotalMs', 'humanConfirmationMs',
  'verificationMs', 'verificationPerceptionMs', 'postClickDelayMs', 'matchingMs'];
const SIZES = ['safeContextBytes', 'sanitizedPngBytes', 'screenshotWidth', 'screenshotHeight'];
// Narrow numeric projection so unknown/page-derived keys cannot ride in telemetry.
export function safeMeasurements(candidate = {}) {
  return Object.fromEntries([...TIMINGS, ...SIZES].filter((key) =>
    typeof candidate[key] === 'number' && Number.isFinite(candidate[key]) && candidate[key] >= 0)
    .map((key) => [key, candidate[key]]));
}
export function machineDuration(planMs, postExecutionMs) {
  return [planMs, postExecutionMs].every((n) => Number.isFinite(n) && n >= 0) ? planMs + postExecutionMs : null;
}

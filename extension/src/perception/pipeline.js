import { sanitizeVisual } from '../privacy/visual.js';
import { visualTextIsSafe } from '../privacy/visual.js';
import { overlapsSensitive } from '../privacy/overlap.js';
import { checkOutbound } from '../privacy/guard.js';
import { actionableVisualIds } from '../actions/geometry.js';
import { inferLocally, refineLocally } from './bridge.js';
import { REFINE_CONF_THRESHOLD, REFINE_MIN_CONFIDENCE, REFINE_MIN_GAIN, RECOVER_MAX_CONTROLS } from './config.js';
import { sanitizeError, logError } from './diagnostics.js';

// Actionable controls whose full-screen OCR confidence is low are eligible for one
// crop-OCR refinement pass. Both sets come from real pixels/geometry — never DOM text.
export function eligibleForRefine(items, controlRegions) {
  const actionable = new Set(actionableVisualIds(items, controlRegions));
  return (items || []).filter((item) => actionable.has(item.id) &&
    (item.confidence == null || item.confidence < REFINE_CONF_THRESHOLD));
}

// Pure replacement rule (unit-tested): replace an eligible element's text/confidence
// ONLY when the refined PIXEL read is safe, non-empty, clears REFINE_MIN_CONFIDENCE and
// beats the original by REFINE_MIN_GAIN. Otherwise the original (low-confidence) text
// stands, so the planner can fail closed to STOP. The id and bbox never change; DOM text
// is never consulted.
export function applyRefinements(items, eligibleIds, refinements, sensitiveValues,
    { minConfidence = REFINE_MIN_CONFIDENCE, minGain = REFINE_MIN_GAIN } = {}) {
  const byId = new Map((refinements || []).map((r) => [r?.id, r]));
  return (items || []).map((item) => {
    if (!eligibleIds.has(item.id)) return item;
    const refined = byId.get(item.id);
    if (!refined || typeof refined.text !== 'string') return item;
    const text = refined.text.replace(/\s+/g, ' ').trim();
    const base = typeof item.confidence === 'number' ? item.confidence : 0;
    if (!visualTextIsSafe(text, sensitiveValues)) return item;
    if (typeof refined.confidence !== 'number' || refined.confidence < minConfidence ||
        refined.confidence < base + minGain) return item;
    return { ...item, text, confidence: refined.confidence };
  });
}

// Full-screen OCR can miss a control's label entirely (light text on a dark fill), and
// grounding is driven by OCR items, so such a control could never become a candidate.
// DOM decides WHICH regions are clickable controls; this reads each one that has no OCR
// item on it from its own PIXELS (same crop-OCR as refinement). A safe read becomes a
// normal pixel item with the control's bbox. The label is never DOM text; a control whose
// pixels read nothing safe stays unrecovered (fail closed).
export async function recoverUnreadControls(image, value, sensitiveValues, regions, clickRegions,
    { max = RECOVER_MAX_CONTROLS, minConfidence = REFINE_MIN_CONFIDENCE, refine = refineLocally } = {}) {
  const items = value?.items || [];
  const unread = (clickRegions || []).filter((r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.width > 0 && r.height > 0 && !overlapsSensitive(r, regions) &&
    actionableVisualIds(items, [r]).length === 0).slice(0, max);
  if (!unread.length) return value;
  let next = Math.max(0, ...items.map((item) => Number(item.id.slice('visual_'.length)) || 0));
  const requests = unread.map((bbox) => ({ id: `visual_${++next}`, bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height } }));
  const reads = new Map((await refine(image, requests) || []).map((r) => [r?.id, r]));
  const added = requests.flatMap(({ id, bbox }) => {
    const read = reads.get(id);
    const text = typeof read?.text === 'string' ? read.text.replace(/\s+/g, ' ').trim() : '';
    if (!visualTextIsSafe(text, sensitiveValues) || typeof read.confidence !== 'number' ||
        read.confidence < minConfidence) return [];
    return [{ id, text, bbox, confidence: read.confidence }];
  });
  return added.length ? { ...value, items: [...items, ...added] } : value;
}

// Trusted-local entry. Only image bytes/dimensions go to inference. Geometry and
// values stay here for POST-inference filtering; no raw result leaves this module.
export async function perceiveLocalCapture(image, sensitiveValues, regions, controlRegions = [], clickRegions = []) {
  let result;
  try {
    result = await inferLocally(image);
    if (result.width !== image.width || result.height !== image.height) throw new Error('OCR dimensions changed.');
    let sanitized = sanitizeVisual(result, sensitiveValues, regions);
    if (sanitized.privacy === 'SAFE' && clickRegions.length) {
      const value = await recoverUnreadControls(image, sanitized.value, sensitiveValues, regions, clickRegions);
      // Defence in depth: keep the already-SAFE value unless the recovered one also passes.
      if (value !== sanitized.value && checkOutbound(value, sensitiveValues).safe) {
        sanitized = { ...sanitized, status: 'Ready', value, recovered: value.items.length - (sanitized.value?.items?.length ?? 0) };
      }
    }
    // Optional bounded refinement for actionable low-confidence control labels.
    if (sanitized.status === 'Ready' && Array.isArray(controlRegions) && controlRegions.length &&
        Array.isArray(sanitized.value?.items) && sanitized.value.items.length) {
      const eligible = eligibleForRefine(sanitized.value.items, controlRegions);
      if (eligible.length) {
        const refinements = await refineLocally(image, eligible.map((item) => ({ id: item.id, bbox: item.bbox })));
        const eligibleIds = new Set(eligible.map((item) => item.id));
        const items = applyRefinements(sanitized.value.items, eligibleIds, refinements, sensitiveValues);
        const value = { ...sanitized.value, items };
        // Defence in depth: re-run the outbound guard over the refined value. If anything
        // is off, keep the original already-SAFE value rather than the refined one.
        if (checkOutbound(value, sensitiveValues).safe) return { ...sanitized, value };
      }
    }
    return sanitized;
  } catch (err) {
    logError('service-worker', sanitizeError(err?.stage || 'OCR_PIPELINE', err));
    return { status: 'ERROR', reason: 'Local OCR unavailable or timed out. Phase 1–3 results remain available.' };
  } finally {
    result = null;
    image = null;
  }
}

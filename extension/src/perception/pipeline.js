import { sanitizeVisual } from '../privacy/visual.js';
import { inferLocally } from './bridge.js';
import { sanitizeError, logError } from './diagnostics.js';

// Trusted-local entry. Only image bytes/dimensions go to inference. Geometry and
// values stay here for POST-inference filtering; no raw result leaves this module.
export async function perceiveLocalCapture(image, sensitiveValues, regions) {
  let result;
  try {
    result = await inferLocally(image);
    if (result.width !== image.width || result.height !== image.height) throw new Error('OCR dimensions changed.');
    return sanitizeVisual(result, sensitiveValues, regions);
  } catch (err) {
    logError('service-worker', sanitizeError(err?.stage || 'OCR_PIPELINE', err));
    return { status: 'ERROR', reason: 'Local OCR unavailable or timed out. Phase 1–3 results remain available.' };
  } finally {
    result = null;
    image = null;
  }
}

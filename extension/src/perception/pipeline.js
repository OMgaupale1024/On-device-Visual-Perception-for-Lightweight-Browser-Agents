import { sanitizedImageForPerception } from '../privacy/redact.js';
import { sanitizeVisual } from '../privacy/visual.js';
import { inferLocally } from './bridge.js';

// Application entry point accepts ONLY the Phase 3 private image capability.
export async function perceiveSanitized(handle, sensitiveValues) {
  try {
    const image = sanitizedImageForPerception(handle);
    const result = await inferLocally(image);
    return sanitizeVisual(result, sensitiveValues);
  } catch {
    return { status: 'ERROR', reason: 'Local OCR unavailable or timed out. Phase 1–3 results remain available.' };
  }
}

import { HOST_PATH, OCR_MESSAGE, OCR_REFINE_MESSAGE, OCR_TIMEOUT_MS } from './config.js';
import { sanitizeError, logError, logStage } from './diagnostics.js';

// Service workers cannot construct Web Workers. A packaged offscreen document owns it.
let creating;
async function ensureHost() {
  if (!chrome.offscreen?.createDocument || !chrome.runtime.getContexts) throw new Error('Local OCR unavailable.');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(HOST_PATH)] });
  if (contexts.length) return;
  if (!creating) creating = chrome.offscreen.createDocument({
    url: HOST_PATH, reasons: ['WORKERS'], justification: 'Run packaged OCR WebAssembly on local screenshot pixels before privacy filtering.',
  }).finally(() => { creating = undefined; });
  await creating;
}

// Best-effort second pass for a few actionable low-confidence control crops. Bounded
// and fail-soft: any error/timeout returns [] so the original OCR text simply stands.
export async function refineLocally(image, regions) {
  if (!Array.isArray(regions) || !regions.length) return [];
  try {
    return await Promise.race([
      (async () => {
        await ensureHost();
        const response = await chrome.runtime.sendMessage({ type: OCR_REFINE_MESSAGE, target: 'ocr-host', image, regions });
        return response?.ok && Array.isArray(response.result?.refinements) ? response.result.refinements : [];
      })(),
      new Promise((resolve) => setTimeout(() => resolve([]), OCR_TIMEOUT_MS)),
    ]);
  } catch { return []; }
}

export async function inferLocally(image) {
  let timer, activity;
  const startedAt = Date.now();
  try {
    // Chrome 110+ extension API calls reset the 30-second service-worker idle
    // timer. Keep only this bounded transaction active, even if the popup closes.
    activity = setInterval(() => {
      chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => {});
    }, 10_000);
    return await Promise.race([
      (async () => {
        logStage('service-worker', 'OCR_OFFSCREEN_CREATE');
        await ensureHost();
        logStage('service-worker', 'OCR_MESSAGE_CHANNEL');
        const response = await chrome.runtime.sendMessage({ type: OCR_MESSAGE, target: 'ocr-host', image });
        if (!response?.ok) {
          // Surface the offscreen host's real stage/error; still throw a generic error.
          logError('service-worker', response?.diag || sanitizeError('OCR_MESSAGE_CHANNEL', new Error('Host returned no result.')));
          throw new Error('Local OCR unavailable.');
        }
        logStage('service-worker', 'OCR_DONE', `${Date.now() - startedAt} ms`);
        return response.result;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        // A timeout means init/recognition genuinely exceeded the budget, not an
        // immediate fault — distinguish it in the console before rejecting.
        logError('service-worker', sanitizeError('OCR_TIMEOUT', new Error(`No result within ${OCR_TIMEOUT_MS} ms`)));
        reject(new Error('Local OCR timeout.'));
      }, OCR_TIMEOUT_MS); }),
    ]);
  } catch {
    // Closing the host kills even an initialization-hung worker whose handle never resolved.
    try { await chrome.offscreen?.closeDocument(); } catch { /* host may not exist */ }
    throw new Error('Local OCR unavailable or timed out.');
  } finally { clearTimeout(timer); clearInterval(activity); }
}

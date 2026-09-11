import { recognizePixels, refineRegions, disposeEngine } from './ocr.js';
import { OCR_MESSAGE, OCR_REFINE_MESSAGE } from './config.js';
import { sanitizeError, logError } from './diagnostics.js';

let busy = false;
let idleTimer;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ((message?.type !== OCR_MESSAGE && message?.type !== OCR_REFINE_MESSAGE) || message.target !== 'ocr-host' ||
      sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/background/service-worker.js')) return false;
  if (busy) { sendResponse({ ok: false, diag: { stage: 'OCR_BUSY', name: 'Busy', message: 'A recognition is already running.' } }); return false; }
  busy = true;
  clearTimeout(idleTimer);
  const work = message.type === OCR_REFINE_MESSAGE
    ? refineRegions(message.image, message.regions).then((refinements) => ({ refinements }))
    : recognizePixels(message.image);
  work.then((result) => sendResponse({ ok: true, result }))
    // Return the sanitized stage/error to the background so the failure is visible
    // in Chrome, instead of collapsing every fault into an opaque { ok: false }.
    .catch(async (err) => { const diag = sanitizeError(err?.stage || 'OCR_OFFSCREEN', err); logError('offscreen', diag); await disposeEngine(); sendResponse({ ok: false, diag }); })
    .finally(() => {
      busy = false;
      idleTimer = setTimeout(() => { disposeEngine().catch(() => {}); }, 120_000);
    });
  return true;
});

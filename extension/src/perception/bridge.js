import { HOST_PATH, OCR_MESSAGE, OCR_TIMEOUT_MS } from './config.js';

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

export async function inferLocally(image) {
  let timer, activity;
  try {
    // Chrome 110+ extension API calls reset the 30-second service-worker idle
    // timer. Keep only this bounded transaction active, even if the popup closes.
    activity = setInterval(() => {
      chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => {});
    }, 10_000);
    return await Promise.race([
      (async () => {
        await ensureHost();
        const response = await chrome.runtime.sendMessage({ type: OCR_MESSAGE, target: 'ocr-host', image });
        if (!response?.ok) throw new Error('Local OCR unavailable.');
        return response.result;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local OCR timeout.')), OCR_TIMEOUT_MS); }),
    ]);
  } catch {
    // Closing the host kills even an initialization-hung worker whose handle never resolved.
    try { await chrome.offscreen?.closeDocument(); } catch { /* host may not exist */ }
    throw new Error('Local OCR unavailable or timed out.');
  } finally { clearTimeout(timer); clearInterval(activity); }
}

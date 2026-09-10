import { recognizePixels, disposeEngine } from './ocr.js';
import { OCR_MESSAGE } from './config.js';

let busy = false;
let idleTimer;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== OCR_MESSAGE || message.target !== 'ocr-host' ||
      sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/background/service-worker.js')) return false;
  if (busy) { sendResponse({ ok: false }); return false; }
  busy = true;
  clearTimeout(idleTimer);
  recognizePixels(message.image).then((result) => sendResponse({ ok: true, result }))
    .catch(async () => { await disposeEngine(); sendResponse({ ok: false }); })
    .finally(() => {
      busy = false;
      idleTimer = setTimeout(() => { disposeEngine().catch(() => {}); }, 120_000);
    });
  return true;
});

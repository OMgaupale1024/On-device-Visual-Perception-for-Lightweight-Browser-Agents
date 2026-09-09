// EdgeSight background service worker (MV3) — orchestrates one analysis run.
//
// Flow: popup sends ANALYZE_PAGE → inject the DOM observer (activeTab + scripting) → run
// local sensitive-field detection on the returned signals → capture the visible tab pixels
// (activeTab) → combine → reply to popup.
//
// Privacy:
//  - The observer returns structural signals only (no field values).
//  - Detection classifies those signals; the raw signals (name/id/autocomplete) are then
//    DROPPED — the popup receives only { id, role, sensitive, label } per field.
//  - The screenshot is decoded only to read its real dimensions, then dropped. In-memory
//    only, never stored, never sent anywhere. No network requests are made.
import { MSG } from '../shared/messages.js';
import { observePage } from '../content/observe.js';
import { detectSensitiveFields, countSensitive } from '../privacy/detect.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.ANALYZE_PAGE) {
    runAnalysis()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: normalizeError(err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

async function runAnalysis() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    return { ok: false, error: 'No active tab to analyze.' };
  }

  // --- DOM / semantic channel: inject a one-shot observer (activeTab + scripting) ---
  let raw;
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: observePage,
    });
    raw = injected?.result;
  } catch (err) {
    return {
      ok: false,
      error:
        'Cannot observe this page. Restricted pages (chrome://, Web Store) are blocked; ' +
        'for local file:// pages, enable "Allow access to file URLs" for EdgeSight in ' +
        'chrome://extensions. (' + normalizeError(err) + ')',
    };
  }
  if (!raw) return { ok: false, error: 'Observer returned no data.' };

  // --- Local sensitive-field detection (Phase 2) ---
  // Classify structural signals, then drop the signals so name/id/autocomplete never leave
  // the background. Only { id, role, sensitive, label } per field goes to the popup.
  const fields = detectSensitiveFields(raw.fieldSignals);

  // --- Visual / pixel channel: capture the visible tab locally (activeTab) ---
  const capture = await captureVisible(tab.windowId);

  return {
    ok: true,
    observation: {
      title: raw.title,
      counts: raw.counts,
      viewport: raw.viewport,
      devicePixelRatio: raw.devicePixelRatio,
      fields,
      sensitiveCount: countSensitive(fields),
    },
    capture,
  };
}

async function captureVisible(windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    const { width, height } = await measure(dataUrl);
    // dataUrl goes out of scope here: in-memory only, never stored or transmitted.
    return { ok: true, width, height };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

// Decode the capture just enough to read real pixel dimensions, then release it.
async function measure(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

function normalizeError(err) {
  return err && err.message ? err.message : String(err);
}

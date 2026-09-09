// EdgeSight background service worker (MV3) — orchestrates one analysis run.
//
// Flow: popup sends ANALYZE_PAGE → we inject the DOM observer (activeTab + scripting) and
// capture the visible tab pixels (activeTab) → combine → reply to popup.
//
// Privacy: the screenshot is decoded only to read its real dimensions, then dropped. It is
// held in memory only, never stored, never sent anywhere. No network requests are made.
import { MSG } from '../shared/messages.js';
import { observePage } from '../content/observe.js';

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
  let observation;
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: observePage,
    });
    observation = injected?.result;
  } catch (err) {
    return {
      ok: false,
      error:
        'Cannot observe this page. Restricted pages (chrome://, Web Store) are blocked; ' +
        'for local file:// pages, enable "Allow access to file URLs" for EdgeSight in ' +
        'chrome://extensions. (' + normalizeError(err) + ')',
    };
  }

  // --- Visual / pixel channel: capture the visible tab locally (activeTab) ---
  const capture = await captureVisible(tab.windowId);

  return { ok: true, observation, capture };
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

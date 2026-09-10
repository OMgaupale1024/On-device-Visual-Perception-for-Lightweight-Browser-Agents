// All processing is local. Never log caught browser errors or page-derived content.
import { MSG } from '../shared/messages.js';
import { observePage } from '../content/observe.js';
import { detectSensitiveFields, countSensitive } from '../privacy/detect.js';
import { collectLocalValues } from '../privacy/collect.js';
import { sanitizeSemantics } from '../privacy/semantic.js';
import { redactScreenshot, buildOutboundPackage } from '../privacy/redact.js';
import { perceiveSanitized } from '../perception/pipeline.js';

let busy = false;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MSG.ANALYZE_PAGE) return false;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/popup/popup.html')) return false;
  if (busy) { sendResponse({ ok: false, error: 'Analysis already in progress.' }); return false; }
  busy = true;
  runAnalysis().then(sendResponse).catch(() => sendResponse({
    ok: false,
    error: 'Local privacy processing blocked. Keep the page still and retry. Restricted pages cannot be analyzed; local files require Allow access to file URLs.',
  })).finally(() => { busy = false; });
  return true;
});

async function assertActive(tab) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== tab.id || active?.windowId !== tab.windowId) throw new Error('Active page changed.');
}

async function snapshot(tabId, documentId) {
  const target = documentId ? { tabId, documentIds: [documentId] } : { tabId };
  const [observed] = await chrome.scripting.executeScript({ target, func: observePage });
  if (!observed?.result || !observed.documentId) throw new Error('Observation unavailable.');
  const [collected] = await chrome.scripting.executeScript({
    target: { tabId, documentIds: [observed.documentId] }, func: collectLocalValues,
    args: [observed.result.fieldSignals.map((f) => f.id),
      detectSensitiveFields(observed.result.fieldSignals).filter((f) => f.sensitive).map((f) => f.id)],
  });
  if (!collected?.result) throw new Error('Local context unavailable.');
  return { observation: observed.result, values: collected.result, documentId: observed.documentId };
}

function release(snapshot) {
  if (snapshot) {
    for (const entry of snapshot.values) entry.value = '';
    snapshot.values.length = 0;
    snapshot.observation = null;
  }
}

async function runAnalysis() {
  let before, after, rawScreenshot, secrets;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) throw new Error('No active page.');
    before = await snapshot(tab.id);
    const obs = before.observation;
    if (obs.visualViewport.scale !== 1 || obs.visualViewport.x !== 0 || obs.visualViewport.y !== 0) {
      throw new Error('Unsupported viewport.');
    }
    await assertActive(tab);
    rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await assertActive(tab);
    after = await snapshot(tab.id, before.documentId);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Page changed during capture.');
    const fields = detectSensitiveFields(obs.fieldSignals);
    const geometry = fields.map((f) => ({ ...f, rect: obs.fieldSignals.find((s) => s.id === f.id).rect }));
    const visual = await redactScreenshot(rawScreenshot, geometry, obs.viewport);
    rawScreenshot = null;
    secrets = before.values.filter((v) => fields.some((f) => f.id === v.id && f.sensitive)).map((v) => v.value);
    const semantic = sanitizeSemantics(fields, obs.fieldSignals, before.values);
    let safeContext = buildOutboundPackage(visual.handle, semantic, secrets);
    release(before); release(after);
    before = after = null; // Only the known sensitive strings remain until OCR guarding.
    const perception = await perceiveSanitized(visual.handle, secrets);
    if (perception.privacy === 'SAFE') {
      safeContext = buildOutboundPackage(visual.handle, semantic, secrets, perception.value);
    }
    return {
      ok: true,
      observation: {
        counts: obs.counts, viewport: obs.viewport, devicePixelRatio: obs.devicePixelRatio,
        fields: safeContext.semantic.fields, sensitiveCount: countSensitive(fields),
      },
      capture: { ok: true, width: visual.width, height: visual.height },
      privacy: { redactedRegions: visual.redactedRegions, visual: 'Sanitized', semantic: 'Sanitized', outbound: perception.status === 'UNSAFE' ? 'BLOCKED' : 'SAFE' },
      // LOCAL-ONLY sibling. Never passed to buildOutboundPackage.
      localPreview: perception.status === 'UNSAFE' ? {} : { original: visual.originalPreview },
      // A privacy failure also revokes the image package: don't leave an eligible
      // screenshot behind if OCR discovered known sensitive text outside the masks.
      safeContext: perception.status === 'UNSAFE' ? null : safeContext,
      perception,
    };
  } finally {
    rawScreenshot = null;
    secrets?.fill('');
    secrets = null;
    release(before);
    release(after);
  }
}

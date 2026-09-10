// Perception/privacy processing is local. Only guarded context reaches the planner.
// Only the sanitized diagnostics sink logs, and only a
// stage tag plus error class/message — never page-derived content or secrets.
import { MSG } from '../shared/messages.js';
import { observePage } from '../content/observe.js';
import { detectSensitiveFields, countSensitive } from '../privacy/detect.js';
import { collectLocalValues } from '../privacy/collect.js';
import { sanitizeSemantics } from '../privacy/semantic.js';
import { redactScreenshot, buildOutboundPackage, sanitizedImageForPerception } from '../privacy/redact.js';
import { perceiveLocalCapture } from '../perception/pipeline.js';
import { sensitiveRegions } from '../privacy/geometry.js';
import { buildSafeAgentContext } from '../privacy/agent-context.js';
import { requestPlan } from '../transport/planner-client.js';
import { ticketForPlan, executeTicket } from '../actions/execute-click.js';

let busy = false;
let executing = false;
// The one pending, single-use Phase 7 action. LOCAL ONLY; a new analysis or a
// completed/attempted execution invalidates it. Lost if the worker is torn down,
// which is a safe fail-closed (the popup would require a fresh Analyze / Plan).
let pendingAction = null;

function fromPopup(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('src/popup/popup.html');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!fromPopup(sender)) return false;
  if (message?.type === MSG.ANALYZE_PAGE) {
    if (busy) { sendResponse({ ok: false, error: 'Analysis already in progress.' }); return false; }
    busy = true;
    runAnalysis(message.goal).then(sendResponse).catch(() => sendResponse({
      ok: false,
      error: 'Local privacy processing blocked. Keep the page still and retry. Restricted pages cannot be analyzed; local files require Allow access to file URLs.',
    })).finally(() => { busy = false; });
    return true;
  }
  if (message?.type === MSG.EXECUTE_ACTION) {
    if (executing) { sendResponse({ status: 'BLOCKED', reason: 'ACTION_ALREADY_CONSUMED' }); return false; }
    executing = true;
    executeTicket(pendingAction, {
      queryActiveTab: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
      getTab: (id) => chrome.tabs.get(id),
      executeScript: (opts) => chrome.scripting.executeScript(opts),
    }).then(sendResponse).catch(() => sendResponse({ status: 'BLOCKED', reason: 'EXECUTION_FAILED' }))
      .finally(() => { executing = false; });
    return true;
  }
  return false;
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

async function runAnalysis(goal) {
  let before, after, rawScreenshot, secrets;
  // A new analysis always invalidates any prior pending action (Phase 7 replay/stale).
  pendingAction = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) throw new Error('No active page.');
    before = await snapshot(tab.id);
    const obs = before.observation;
    const documentId = before.documentId; // observed document identity, kept LOCAL
    if (obs.visualViewport.scale !== 1 || obs.visualViewport.x !== 0 || obs.visualViewport.y !== 0) {
      throw new Error('Unsupported viewport.');
    }
    await assertActive(tab);
    rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    // Observation-scoped identity: visual_N ids in this context belong to this obs id.
    const observationId = 'obs_' + crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    await assertActive(tab);
    after = await snapshot(tab.id, before.documentId);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Page changed during capture.');
    const fields = detectSensitiveFields(obs.fieldSignals);
    const geometry = fields.map((f) => ({ ...f, rect: obs.fieldSignals.find((s) => s.id === f.id).rect }));
    const visual = await redactScreenshot(rawScreenshot, geometry, obs.viewport);
    const regions = sensitiveRegions(geometry, obs.viewport, { width: visual.width, height: visual.height });
    secrets = before.values.filter((v) => fields.some((f) => f.id === v.id && f.sensitive)).map((v) => v.value);
    const semantic = sanitizeSemantics(fields, obs.fieldSignals, before.values);
    let safeContext = buildOutboundPackage(visual.handle, semantic, secrets);
    release(before); release(after);
    before = after = null; // Only the known sensitive strings remain until OCR guarding.
    const perception = await perceiveLocalCapture({ dataUrl: rawScreenshot, width: visual.width, height: visual.height }, secrets, regions);
    rawScreenshot = null;
    if (perception.privacy === 'SAFE') {
      safeContext = buildOutboundPackage(visual.handle, semantic, secrets, perception.value);
    }
    // Phase 5: fuse safe semantic + safe visual state into the canonical, guarded
    // SafeAgentContext. Built defensively so a builder fault never discards working
    // Phase 1-4 results; a privacy failure fails closed (no context, status marked).
    let agent = { status: 'REVOKED' };
    if (perception.status !== 'UNSAFE') {
      try {
        agent = buildSafeAgentContext({
          goal, semantic,
          visualState: perception.privacy === 'SAFE' ? perception.value : null,
          image: { width: visual.width, height: visual.height, redactedRegions: visual.redactedRegions },
          observation: { id: observationId, capturedAt, viewport: obs.viewport },
          sensitiveValues: secrets,
        });
      } catch { agent = { status: 'ERROR' }; }
    }
    // Drop known-value references before transport. Its only application argument
    // is the exact approved context, never this function's local result envelope.
    secrets.fill(''); secrets = null;
    let planner = { status: 'BLOCKED', privacy: 'BLOCKED', bytes: 0, reason: 'Privacy gate blocked planning.' };
    if (agent.status === 'READY') {
      try { planner = await requestPlan(agent.context); }
      catch { planner = { status: 'UNAVAILABLE', privacy: 'SAFE', bytes: 0, reason: 'Planner unavailable.' }; }
    }
    // Phase 7: mint a LOCAL single-use ticket only for a validated CLICK bound to this
    // exact observation, tab and document. sensitiveRegions/bbox stay browser-local.
    if (planner.status === 'READY') {
      pendingAction = ticketForPlan(planner.plan, agent.context, {
        tabId: tab.id, windowId: tab.windowId, documentId, url: tab.url, sensitiveRegions: regions,
      });
    }
    return {
      ok: true,
      planner,
      execution: { available: pendingAction !== null },
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
      // Phase 5 canonical outbound-shaped context (image metadata only; sanitized
      // bytes stay behind the redact.js handle). Null unless the guard passed READY.
      agentContext: agent.status === 'READY' ? agent.context : null,
      agentContextStatus: agent.status,
      structuredContextBytes: agent.bytes ?? 0,
      sanitizedImageBytes: agent.status === 'READY' ? sanitizedImageForPerception(visual.handle).dataUrl.length : 0,
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

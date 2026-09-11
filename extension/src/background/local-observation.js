// Shared Phase 1-5 local transaction. No planner, tickets or network.
import { safeMeasurements } from '../metrics/metrics.js';
import { observePage } from '../content/observe.js';
import { detectSensitiveFields, countSensitive } from '../privacy/detect.js';
import { collectLocalValues } from '../privacy/collect.js';
import { sanitizeSemantics } from '../privacy/semantic.js';
import { redactScreenshot, buildOutboundPackage, sanitizedImageForPerception } from '../privacy/redact.js';
import { perceiveLocalCapture } from '../perception/pipeline.js';
import { sensitiveRegions, mapRect } from '../privacy/geometry.js';
import { actionableVisualIds } from '../actions/geometry.js';
import { buildSafeAgentContext } from '../privacy/agent-context.js';
import { logStage } from '../perception/diagnostics.js';

// Bound local API work; abort prevents subsequent stages and late acceptance.
export async function bounded(work, signal, timeoutMs = 5_000) {
  let timer, abort;
  try {
    if (signal?.aborted) throw new Error('TIMEOUT');
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        abort = () => reject(new Error('TIMEOUT'));
        timer = setTimeout(abort, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function assertActive(tab, signal) {
  const [active] = await bounded(() => chrome.tabs.query({ active: true, currentWindow: true }), signal);
  if (active?.id !== tab.id || active?.windowId !== tab.windowId) throw new Error('TAB_CHANGED');
}

async function snapshot(tabId, documentId, signal) {
  const target = documentId ? { tabId, documentIds: [documentId] } : { tabId };
  const [observed] = await bounded(() => chrome.scripting.executeScript({ target, func: observePage }), signal);
  if (!observed?.result || !observed.documentId) throw new Error('Observation unavailable.');
  const [collected] = await bounded(() => chrome.scripting.executeScript({
    target: { tabId, documentIds: [observed.documentId] }, func: collectLocalValues,
    args: [observed.result.fieldSignals.map((f) => f.id),
      detectSensitiveFields(observed.result.fieldSignals).filter((f) => f.sensitive).map((f) => f.id)],
  }), signal);
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

export async function observeLocal(tab, goal, { signal } = {}) {
  let before, after, rawScreenshot, secrets;
  let stage = 'CAPTURE_FAILED';
  const timings = {};
  const localStart = performance.now();
  const check = () => { if (signal?.aborted) throw new Error('TIMEOUT'); };
  check();
  try {
    if (tab?.id == null) throw new Error('No active page.');
    before = await snapshot(tab.id, undefined, signal);
    check();
    const obs = before.observation;
    const documentId = before.documentId; // observed document identity, kept LOCAL
    if (obs.visualViewport.scale !== 1 || obs.visualViewport.x !== 0 || obs.visualViewport.y !== 0) {
      throw new Error('Unsupported viewport.');
    }
    await assertActive(tab, signal);
    const captureStart = performance.now();
    rawScreenshot = await bounded(() => chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }), signal);
    check();
    timings.captureMs = performance.now() - captureStart;
    // Observation-scoped identity: visual_N ids in this context belong to this obs id.
    const observationId = 'obs_' + crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    await assertActive(tab, signal);
    after = await snapshot(tab.id, before.documentId, signal);
    check();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Page changed during capture.');
    stage = 'PRIVACY_FAILED';
    const detectionStart = performance.now();
    const fields = detectSensitiveFields(obs.fieldSignals);
    timings.detectionMs = performance.now() - detectionStart;
    const geometry = fields.map((f) => ({ ...f, rect: obs.fieldSignals.find((s) => s.id === f.id).rect }));
    const redactionStart = performance.now();
    const visual = await bounded(() => redactScreenshot(rawScreenshot, geometry, obs.viewport), signal);
    check();
    timings.redactionMs = performance.now() - redactionStart;
    const semanticStart = performance.now();
    const regions = sensitiveRegions(geometry, obs.viewport, { width: visual.width, height: visual.height });
    // Clickable-control regions in screenshot pixels, derived locally from DOM button
    // geometry (never their text). Used to ground actionCandidates and to target the
    // optional crop-OCR refinement. Never leaves the device.
    const controlRegions = (obs.buttonRects || [])
      .map((b) => mapRect(b.rect, obs.viewport, { width: visual.width, height: visual.height }))
      .filter(Boolean);
    secrets = before.values.filter((v) => fields.some((f) => f.id === v.id && f.sensitive)).map((v) => v.value);
    const semantic = sanitizeSemantics(fields, obs.fieldSignals, before.values);
    let safeContext = buildOutboundPackage(visual.handle, semantic, secrets);
    timings.semanticGuardMs = performance.now() - semanticStart;
    release(before); release(after);
    before = after = null; // Only the known sensitive strings remain until OCR guarding.
    stage = 'PERCEPTION_FAILED';
    const perceptionStart = performance.now();
    const perception = await perceiveLocalCapture({ dataUrl: rawScreenshot, width: visual.width, height: visual.height }, secrets, regions, controlRegions);
    check();
    timings.perceptionMs = performance.now() - perceptionStart;
    stage = 'PRIVACY_FAILED';
    rawScreenshot = null;
    const visualGuardStart = performance.now();
    if (perception.privacy === 'SAFE') {
      safeContext = buildOutboundPackage(visual.handle, semantic, secrets, perception.value);
    }
    timings.visualGuardMs = performance.now() - visualGuardStart;
    const contextStart = performance.now();
    // Phase 5: fuse safe semantic + safe visual state into the canonical, guarded
    // SafeAgentContext. Built defensively so a builder fault never discards working
    // Phase 1-4 results; a privacy failure fails closed (no context, status marked).
    // Ground only privacy-safe, post-refinement visual items on mapped controls.
    const actionCandidates = (perception.privacy === 'SAFE' && perception.value?.items)
      ? actionableVisualIds(perception.value.items, controlRegions) : [];
    // Safe fusion telemetry (counts only, no text/PII): distinguishes "no clickable
    // control detected / in the captured viewport" (controls=0) from "control detected
    // but no OCR element grounded on it" (controls>0, candidates=0) on a live run.
    logStage('service-worker', 'ACTION_FUSION',
      `buttons=${obs.buttonRects?.length ?? 0} controls=${controlRegions.length} items=${perception.value?.items?.length ?? 0} candidates=${actionCandidates.length}`);
    let agent = { status: 'REVOKED' };
    if (perception.status !== 'UNSAFE') {
      try {
        agent = buildSafeAgentContext({
          goal, semantic,
          visualState: perception.privacy === 'SAFE' ? perception.value : null,
          actionCandidates,
          image: { width: visual.width, height: visual.height, redactedRegions: visual.redactedRegions },
          observation: { id: observationId, capturedAt, viewport: obs.viewport },
          sensitiveValues: secrets,
        });
      } catch { agent = { status: 'ERROR' }; }
    }
    timings.contextGuardMs = performance.now() - contextStart;
    timings.localTotalMs = performance.now() - localStart;
    secrets.fill(''); secrets = null;
    check();
    return {
      local: { tabId: tab.id, windowId: tab.windowId, documentId, url: tab.url, sensitiveRegions: regions },
      timings,
      result: {
        ok: true,
        measurements: safeMeasurements({ ...timings, safeContextBytes: agent.bytes,
          screenshotWidth: visual.width, screenshotHeight: visual.height,
          sanitizedPngBytes: agent.status === 'READY' ? atob(sanitizedImageForPerception(visual.handle).dataUrl.slice(22)).length : undefined }),
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
      },
    };
  } catch (error) {
    const reason = ['TAB_CHANGED', 'TIMEOUT'].includes(error?.message) ? error.message : stage;
    throw new Error(reason);
  } finally {
    rawScreenshot = null;
    secrets?.fill('');
    secrets = null;
    release(before);
    release(after);
  }
}

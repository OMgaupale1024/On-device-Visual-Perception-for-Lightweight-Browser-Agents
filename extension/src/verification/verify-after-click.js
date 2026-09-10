import { observeLocal, assertActive, bounded } from '../background/local-observation.js';
import { verifyVisualResult } from './verify-visual-result.js';

export const POST_CLICK_DELAY_MS = 750;
export const VERIFICATION_TIMEOUT_MS = 60_000;
const FAILURES = new Set(['TAB_CHANGED', 'CAPTURE_FAILED', 'PERCEPTION_FAILED', 'PRIVACY_FAILED', 'TIMEOUT']);

// One observation only. No planner, ticket creation, action or network interface.
// Dependencies are local test seams; production uses the shared Phase 1–5 pipeline.
export async function verifyAfterClick(ticket, dispatchedAt, {
  observe = observeLocal,
  getTab = (id) => chrome.tabs.get(id),
  active = assertActive,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = VERIFICATION_TIMEOUT_MS,
} = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const { signal } = controller;
  let timer, verificationObservationId, privacy, captureMs, perceptionMs, matchingMs, postClickDelayMs;
  const finish = (result) => ({ ...result, actionObservationId: ticket.observationId,
    ...(verificationObservationId ? { verificationObservationId } : {}),
    ...(privacy ? { privacy } : {}),
    timing: { dispatchedAt, completedAt: Date.now(), totalMs: performance.now() - started,
      ...(postClickDelayMs === undefined ? {} : { postClickDelayMs }),
      ...(captureMs === undefined ? {} : { captureMs }),
      ...(perceptionMs === undefined ? {} : { perceptionMs }),
      ...(matchingMs === undefined ? {} : { matchingMs }) } });
  try {
    const result = await Promise.race([
      (async () => {
        const delayStart = performance.now();
        await delay(POST_CLICK_DELAY_MS);
        postClickDelayMs = performance.now() - delayStart;
        if (signal.aborted) throw new Error('TIMEOUT');
        let tab;
        try { tab = await bounded(() => getTab(ticket.tabId), signal); }
        catch (error) { throw new Error(error.message === 'TIMEOUT' ? 'TIMEOUT' : 'TAB_CHANGED'); }
        if (!tab || tab.id !== ticket.tabId || tab.windowId !== ticket.windowId) throw new Error('TAB_CHANGED');
        await active(tab, signal);
        // Deliberately no old URL or documentId. Pin only the NEW capture transaction.
        const fresh = await observe(tab, '', { signal });
        if (signal.aborted) throw new Error('TIMEOUT');
        await active(tab, signal);
        const local = fresh.result;
        captureMs = fresh.timings.captureMs;
        perceptionMs = fresh.timings.perceptionMs;
        if (local.perception.status === 'UNSAFE') throw new Error('PRIVACY_FAILED');
        if (local.perception.status === 'ERROR') throw new Error('PERCEPTION_FAILED');
        if (local.perception.privacy !== 'SAFE' || local.agentContextStatus !== 'READY') throw new Error('PRIVACY_FAILED');
        verificationObservationId = local.agentContext.observation.id;
        privacy = 'SAFE';
        const matchingStart = performance.now();
        const match = verifyVisualResult(local.agentContext, { actionObservationId: ticket.observationId, dispatchedAt });
        matchingMs = performance.now() - matchingStart;
        return match;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('TIMEOUT'));
      }, timeoutMs); }),
    ]);
    return finish(result);
  } catch (error) {
    return finish({ status: 'NOT_VERIFIED', reason: FAILURES.has(error?.message) ? error.message : 'CAPTURE_FAILED' });
  } finally { clearTimeout(timer); controller.abort(); }
}

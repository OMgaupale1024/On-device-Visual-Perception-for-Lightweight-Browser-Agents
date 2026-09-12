import { prepareAgentContextForTransport } from '../privacy/agent-context.js';
import { PLANNER_CONFIG } from './config.js';
import { validateAction, navigationUrl } from '../shared/action-contract.js';

export function parseServerTiming(header) {
  if (typeof header !== 'string' || header.length > 200) return {};
  const result = {};
  for (const entry of header.split(',')) {
    const match = entry.trim().match(/^(prehandler|planner);dur=(\d+(?:\.\d+)?)$/);
    if (match && Number(match[2]) <= 60_000) result[match[1] + 'Ms'] = Number(match[2]);
  }
  return result;
}

// No page, OCR, image or secret inputs. Only builder-approved SafeAgentContext.
export function validatePlannerResponse(value, context) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      value.schemaVersion !== 1 || value.observationId !== context.observation.id ||
      typeof value.reason !== 'string' ||
      !value.reason.trim() || value.reason.length > 200) throw new Error('Plan rejected.');
  validateAction(value, context);
  return Object.freeze({ ...value, ...(value.action === 'NAVIGATE' ? { url: navigationUrl(value.url) } : {}) });
}

export async function requestPlan(context, { fetchImpl = globalThis.fetch,
  timeoutMs = PLANNER_CONFIG.timeoutMs } = {}) {
  let body;
  try { body = prepareAgentContextForTransport(context); }
  catch { return { status: 'BLOCKED', privacy: 'BLOCKED', bytes: 0, reason: 'Privacy gate blocked planning.' }; }
  const bytes = new TextEncoder().encode(body).length;
  const base = { privacy: 'SAFE', bytes };
  let plannerMode = 'unknown';
  let httpStatus = null, upstreamStatus = null;
  let failureCode = null;
  const controller = new AbortController();
  let timer;
  let timedOut = false;
  try {
    // Race also bounds stalled response-body reads and uncooperative fetch doubles.
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('Timeout')); },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, PLANNER_CONFIG.timeoutMs) : PLANNER_CONFIG.timeoutMs);
    });
    const operation = async () => {
      const response = await fetchImpl(PLANNER_CONFIG.url, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal,
        credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
      const mode = response.headers?.get('X-EdgeSight-Planner');
      plannerMode = ['ai', 'deterministic'].includes(mode) ? mode : 'unknown';
      httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      const upstream = response.headers?.get('X-EdgeSight-Planner-Upstream-Status');
      upstreamStatus = /^[1-5]\d{2}$/.test(upstream || '') ? Number(upstream) : null;
      const failure = response.headers?.get('X-EdgeSight-Planner-Failure');
      failureCode = ['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'UPSTREAM_HTTP_ERROR',
        'INVALID_PROVIDER_RESPONSE', 'INVALID_DECISION', 'INVALID_REASON', 'INVALID_TARGET',
        'INVALID_TASK_TEXT', 'INVALID_FOCUS'].includes(failure) ? failure : null;
      if (!response.ok) {
        // Release the HTTP body without reading/logging a possibly sensitive error.
        try { await response.body?.cancel(); } catch { /* Diagnostic outcome is unchanged. */ }
        return { ...base, plannerMode, httpStatus, upstreamStatus, failureCode, status: response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED',
          reason: response.status >= 500 ? 'Planner unavailable.' : 'Plan rejected.' };
      }
      try {
        const plan = validatePlannerResponse(await response.json(), context);
        return { ...base, plannerMode, httpStatus, upstreamStatus, status: 'READY', plan,
          serverTiming: parseServerTiming(response.headers?.get('Server-Timing')) };
      } catch { return { ...base, plannerMode, httpStatus, upstreamStatus, status: 'REJECTED', reason: 'Plan rejected.' }; }
    };
    return await Promise.race([operation(), deadline]);
  } catch {
    return { ...base, plannerMode, httpStatus, upstreamStatus, status: 'UNAVAILABLE', reason: timedOut ? 'Planner unavailable: timeout.' : 'Planner unavailable.' };
  } finally { clearTimeout(timer); }
}

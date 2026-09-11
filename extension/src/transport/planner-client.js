import { prepareAgentContextForTransport } from '../privacy/agent-context.js';
import { PLANNER_CONFIG } from './config.js';

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
      Object.keys(value).sort().join(',') !== 'action,observationId,reason,schemaVersion,target' ||
      value.schemaVersion !== 1 || value.observationId !== context.observation.id ||
      !['CLICK', 'STOP'].includes(value.action) || typeof value.reason !== 'string' ||
      !value.reason.trim() || value.reason.length > 200) throw new Error('Plan rejected.');
  if (value.action === 'STOP') {
    if (value.target !== null) throw new Error('Plan rejected.');
  } else if (typeof value.target !== 'string' || !/^visual_[1-9]\d*$/.test(value.target) ||
      !Array.isArray(context.actionCandidates) || !context.actionCandidates.includes(value.target) ||
      context.visualElements.filter((v) => v.id === value.target).length !== 1) {
    throw new Error('Plan rejected.');
  }
  return Object.freeze({ schemaVersion: 1, observationId: value.observationId,
    action: value.action, target: value.target, reason: value.reason });
}

export async function requestPlan(context, { fetchImpl = globalThis.fetch,
  timeoutMs = PLANNER_CONFIG.timeoutMs } = {}) {
  let body;
  try { body = prepareAgentContextForTransport(context); }
  catch { return { status: 'BLOCKED', privacy: 'BLOCKED', bytes: 0, reason: 'Privacy gate blocked planning.' }; }
  const bytes = new TextEncoder().encode(body).length;
  const base = { privacy: 'SAFE', bytes };
  let plannerMode = 'unknown';
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
      if (!response.ok) return { ...base, plannerMode, status: response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED',
        reason: response.status >= 500 ? 'Planner unavailable.' : 'Plan rejected.' };
      try {
        const plan = validatePlannerResponse(await response.json(), context);
        return { ...base, plannerMode, status: 'READY', plan,
          serverTiming: parseServerTiming(response.headers?.get('Server-Timing')) };
      } catch { return { ...base, plannerMode, status: 'REJECTED', reason: 'Plan rejected.' }; }
    };
    return await Promise.race([operation(), deadline]);
  } catch {
    return { ...base, plannerMode, status: 'UNAVAILABLE', reason: timedOut ? 'Planner unavailable: timeout.' : 'Planner unavailable.' };
  } finally { clearTimeout(timer); }
}

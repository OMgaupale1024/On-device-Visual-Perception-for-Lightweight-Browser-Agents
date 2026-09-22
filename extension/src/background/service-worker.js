// Perception/privacy processing is local. Only guarded context reaches the planner.
// Only the sanitized diagnostics sink logs, and only a
// stage tag plus error class/message — never page-derived content or secrets.
import { safeMeasurements, machineDuration } from '../metrics/metrics.js';
import { observeLocal } from './local-observation.js';
import { verifyAfterClick } from '../verification/verify-after-click.js';
import { MSG } from '../shared/messages.js';
import { requestPlan } from '../transport/planner-client.js';
import { ticketForPlan, executeTicket } from '../actions/execute-click.js';
import { runAgent, initialAgentSnapshot, reduceAgentSnapshot } from './agent-controller.js';
import { logStage } from '../perception/diagnostics.js';
import { navigateTab } from '../actions/execute-browser.js';

let busy = false;
let executing = false;
// Phase 11B: at most one autonomous run at a time. `agentCancel` is the current
// run's cancellation token; flipping it prevents any pending plan from acting.
// Phase 13B: `agentRun` is the ONE run-state record (null = no run since the worker
// started). It is reduced from the controller's own events and is what a reopened
// popup reads via GET_AGENT_STATE. In-memory only: if Chrome tears the worker down,
// the run dies with it and a reopened popup truthfully sees no run.
let agentRun = null;
let agentCancel = null;
// The one pending, single-use Phase 7 action. LOCAL ONLY; a new analysis or a
// completed/attempted execution invalidates it. Lost if the worker is torn down,
// which is a safe fail-closed (the popup would require a fresh Analyze / Plan).
let pendingAction = null;
let verification = { status: 'WAITING' };
let planMeasurement = null;
function publishVerification(value) {
  verification = value;
  chrome.runtime.sendMessage?.({ type: MSG.VERIFICATION_UPDATE, verification }).catch(() => {});
}

// Shared local execution seams (used by manual Execute and the autonomous loop).
const executeDeps = {
  queryActiveTab: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
  getTab: (id) => chrome.tabs.get(id),
  executeScript: (opts) => chrome.scripting.executeScript(opts),
  canNavigate: () => chrome.permissions.contains({ origins: ['<all_urls>'] }),
  navigate: (id, url, cancelled) => navigateTab(chrome.tabs, id, url, cancelled),
};

function fromPopup(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('src/popup/popup.html');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!fromPopup(sender)) return false;
  if (message?.type === MSG.GET_VERIFICATION) { sendResponse(verification); return false; }
  if (message?.type === MSG.GET_AGENT_STATE) { sendResponse(agentRun ? { ...agentRun } : { active: false, state: 'IDLE' }); return false; }
  if (message?.type === MSG.ANALYZE_PAGE) {
    if (busy || executing || agentRun?.active) { sendResponse({ ok: false, error: 'Analysis already in progress.' }); return false; }
    busy = true;
    runAnalysis(message.goal).then(sendResponse).catch(() => sendResponse({
      ok: false,
      error: 'Local privacy processing blocked. Keep the page still and retry. Restricted pages cannot be analyzed; local files require Allow access to file URLs.',
    })).finally(() => { busy = false; });
    return true;
  }
  if (message?.type === MSG.EXECUTE_ACTION) {
    if (executing || busy || agentRun?.active) { sendResponse({ status: 'BLOCKED', reason: 'ACTION_ALREADY_CONSUMED' }); return false; }
    executing = true;
    const ticket = pendingAction;
    const executeStarted = performance.now();
    executeTicket(ticket, executeDeps).then(async (action) => {
      if (action.status !== 'EXECUTED') return action;
      pendingAction = null;
      if (action.action !== 'CLICK') return action;
      const clickDispatchMs = performance.now() - executeStarted;
      const dispatchedAt = Date.now();
      publishVerification({ status: 'VERIFYING', actionObservationId: action.observationId });
      const result = await verifyAfterClick(ticket, dispatchedAt);
      const postExecutionMs = performance.now() - executeStarted;
      result.measurements = safeMeasurements({ ...planMeasurement?.values, clickDispatchMs, postExecutionMs,
        machineTotalMs: machineDuration(planMeasurement?.values.planMs, postExecutionMs),
        humanConfirmationMs: planMeasurement ? executeStarted - planMeasurement.readyAt : undefined,
        verificationMs: result.timing.totalMs, verificationPerceptionMs: result.timing.perceptionMs,
        postClickDelayMs: result.timing.postClickDelayMs, matchingMs: result.timing.matchingMs });
      publishVerification(result);
      return { ...action, verification: result };
    }).then(sendResponse).catch(() => sendResponse({ status: 'BLOCKED', reason: 'EXECUTION_FAILED' }))
      .finally(() => { executing = false; });
    return true;
  }
  if (message?.type === MSG.RUN_TASK) {
    if (busy || executing || agentRun?.active) { sendResponse({ ok: false, error: 'A task is already running.' }); return false; }
    agentRun = initialAgentSnapshot();
    const token = agentCancel = { cancelled: false, tabId: null, windowId: null };
    pendingAction = null;
    verification = { status: 'WAITING' };
    runAgent(message.goal, {
      observePlan: (goal) => observePlanForAgent(goal, token),
      execute: (ticket) => executeTicket(ticket, { ...executeDeps, cancelled: () => token.cancelled }),
      settle: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      emit: agentEmit,
      cancelled: () => token.cancelled,
    }).then((summary) => sendResponse({ ok: true, summary }))
      .catch(() => sendResponse({ ok: false, error: 'Autonomous run failed.' }))
      // A controller that threw never emitted a terminal event; close the record.
      .finally(() => { if (agentCancel === token && agentRun.active) agentRun = { ...agentRun, active: false, state: 'FAILED' }; });
    return true;
  }
  if (message?.type === MSG.CANCEL_TASK) {
    // A cancel addressed to a run that is no longer current must not stop a newer one.
    if (message.runId != null && message.runId !== agentRun?.runId) { sendResponse({ ok: false, reason: 'STALE_RUN' }); return false; }
    if (agentCancel) agentCancel.cancelled = true;
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

// Safe autonomous audit + live UI updates. logs are count/id/status based only —
// never target text, OCR, PII or screenshots. The popup update may carry the local,
// already-guarded target text (same class of value manual mode renders).
function agentEmit(event) {
  agentRun = reduceAgentSnapshot(agentRun, event);
  logStage('agent-controller', event.event, `step=${event.step ?? '-'} action=${event.action ?? '-'} reason=${event.reason ?? '-'}`);
  chrome.runtime.sendMessage?.({ type: MSG.AGENT_UPDATE, update: event }).catch(() => {});
}

// One local OBSERVE + PLAN + validated-ticket transaction. Pure of module state,
// so both manual Analyze (below) and the autonomous controller reuse it.
async function observeAndPlan(goal, token) {
  const planStarted = performance.now();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (token) {
    if (token.cancelled || (token.tabId !== null && (tab?.id !== token.tabId || tab?.windowId !== token.windowId))) throw new Error('TAB_CHANGED');
    token.tabId = tab?.id; token.windowId = tab?.windowId;
  }
  const { result, local } = await observeLocal(tab, goal);
  let planner = { status: 'BLOCKED', privacy: 'BLOCKED', bytes: 0, reason: 'Privacy gate blocked planning.' };
  let plannerRoundTripMs, actionPreparationMs, ticket = null;
  if (result.agentContextStatus === 'READY') {
    const plannerStarted = performance.now();
    try { planner = await requestPlan(result.agentContext); }
    catch { planner = { status: 'UNAVAILABLE', privacy: 'SAFE', bytes: 0, reason: 'Planner unavailable.' }; }
    plannerRoundTripMs = performance.now() - plannerStarted;
  }
  if (planner.status === 'READY') {
    const preparationStarted = performance.now();
    ticket = ticketForPlan(planner.plan, result.agentContext, local);
    actionPreparationMs = performance.now() - preparationStarted;
  }
  const measurements = safeMeasurements({ ...result.measurements, plannerRoundTripMs,
    actionPreparationMs, planMs: performance.now() - planStarted });
  return { result, planner, ticket, local, measurements, readyAt: planner.status === 'READY' ? performance.now() : null };
}

async function runAnalysis(goal) {
  planMeasurement = null;
  pendingAction = null;
  verification = { status: 'WAITING' };
  const { result, planner, ticket, measurements, readyAt } = await observeAndPlan(goal);
  pendingAction = ticket;
  if (readyAt !== null) planMeasurement = { values: measurements, readyAt };
  return { ...result, measurements, planner, execution: { available: pendingAction !== null } };
}

// Adapt observeAndPlan to the controller contract, mapping local privacy/perception
// failures to explicit stop reasons and exposing an unchanged-page signature.
async function observePlanForAgent(goal, token) {
  let bundle;
  try {
    bundle = await observeAndPlan(goal, token);
  } catch (error) {
    const reason = error?.message === 'PRIVACY_FAILED' ? 'PRIVACY_FAILED'
      : error?.message === 'PERCEPTION_FAILED' ? 'PERCEPTION_FAILED' : 'OBSERVE_FAILED';
    return { observeStatus: 'FAILED', observeReason: reason };
  }
  const { result, planner, ticket, measurements } = bundle;
  let observeStatus = 'READY', observeReason;
  if (result.perception?.status === 'UNSAFE' || result.agentContextStatus === 'REVOKED') {
    observeStatus = 'FAILED'; observeReason = 'PRIVACY_FAILED';
  } else if (result.perception?.status === 'ERROR') {
    observeStatus = 'FAILED'; observeReason = 'PERCEPTION_FAILED';
  } else if (result.agentContextStatus !== 'READY') {
    observeStatus = 'FAILED'; observeReason = 'OBSERVE_FAILED';
  }
  const ctx = result.agentContext;
  const plan = planner?.plan;
  const targetText = (plan?.action === 'CLICK' && ctx)
    ? (ctx.visualElements.find((v) => v.id === plan.target)?.text ?? null) : null;
  // Cheap unchanged-observation proxy from already-safe context (no PII): visible
  // element texts + approved candidates + safe field role/value pairs.
  const signature = ctx ? JSON.stringify({
    v: ctx.visualElements.map((v) => v.text), c: ctx.actionCandidates,
    f: ctx.fields.map((f) => [f.role, f.value]),
  }) : '';
  return { observeStatus, observeReason, observationId: ctx?.observation?.id,
    planner, ticket, targetText, signature, measurements };
}

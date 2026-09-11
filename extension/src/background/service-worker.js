// Perception/privacy processing is local. Only guarded context reaches the planner.
// Only the sanitized diagnostics sink logs, and only a
// stage tag plus error class/message — never page-derived content or secrets.
import { safeMeasurements, machineDuration } from '../metrics/metrics.js';
import { observeLocal } from './local-observation.js';
import { verifyAfterClick } from '../verification/verify-after-click.js';
import { MSG } from '../shared/messages.js';
import { requestPlan } from '../transport/planner-client.js';
import { ticketForPlan, executeTicket } from '../actions/execute-click.js';

let busy = false;
let executing = false;
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

function fromPopup(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('src/popup/popup.html');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!fromPopup(sender)) return false;
  if (message?.type === MSG.GET_VERIFICATION) { sendResponse(verification); return false; }
  if (message?.type === MSG.ANALYZE_PAGE) {
    if (busy || executing) { sendResponse({ ok: false, error: 'Analysis already in progress.' }); return false; }
    busy = true;
    runAnalysis(message.goal).then(sendResponse).catch(() => sendResponse({
      ok: false,
      error: 'Local privacy processing blocked. Keep the page still and retry. Restricted pages cannot be analyzed; local files require Allow access to file URLs.',
    })).finally(() => { busy = false; });
    return true;
  }
  if (message?.type === MSG.EXECUTE_ACTION) {
    if (executing || busy) { sendResponse({ status: 'BLOCKED', reason: 'ACTION_ALREADY_CONSUMED' }); return false; }
    executing = true;
    const ticket = pendingAction;
    const executeStarted = performance.now();
    executeTicket(ticket, {
      queryActiveTab: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
      getTab: (id) => chrome.tabs.get(id),
      executeScript: (opts) => chrome.scripting.executeScript(opts),
    }).then(async (action) => {
      if (action.status !== 'EXECUTED') return action;
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
  return false;
});

async function runAnalysis(goal) {
  const planStarted = performance.now();
  planMeasurement = null;
  pendingAction = null;
  verification = { status: 'WAITING' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { result, local } = await observeLocal(tab, goal);
  let planner = { status: 'BLOCKED', privacy: 'BLOCKED', bytes: 0, reason: 'Privacy gate blocked planning.' };
  let plannerRoundTripMs, actionPreparationMs;
  if (result.agentContextStatus === 'READY') {
    const plannerStarted = performance.now();
    try { planner = await requestPlan(result.agentContext); }
    catch { planner = { status: 'UNAVAILABLE', privacy: 'SAFE', bytes: 0, reason: 'Planner unavailable.' }; }
    plannerRoundTripMs = performance.now() - plannerStarted;
  }
  if (planner.status === 'READY') {
    const preparationStarted = performance.now();
    pendingAction = ticketForPlan(planner.plan, result.agentContext, local);
    actionPreparationMs = performance.now() - preparationStarted;
  }
  const measurements = safeMeasurements({ ...result.measurements, plannerRoundTripMs,
    actionPreparationMs, planMs: performance.now() - planStarted });
  if (planner.status === 'READY') planMeasurement = { values: measurements, readyAt: performance.now() };
  return { ...result, measurements, planner, execution: { available: pendingAction !== null } };
}

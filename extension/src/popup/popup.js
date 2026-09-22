import { MSG } from '../shared/messages.js';

const byId = (id) => document.getElementById(id);
const statusEl = byId('status');
const resultsEl = byId('results');
const errorEl = byId('error');
const analyzeBtn = byId('analyze');
const executeBtn = byId('execute');
const runBtn = byId('run-task');
const stopBtn = byId('stop-task');
byId('enable-browsing').addEventListener('click', async () => {
  try {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    byId('browsing-note').textContent = granted ? 'Browsing across sites enabled. Start your task when ready.' : 'Permission not granted. Navigation tasks are blocked.';
  } catch { byId('browsing-note').textContent = 'Browsing permission unavailable.'; }
});

// Phase 12: voice is speech-to-text ONLY. It fills the existing goal input and never
// triggers an action. No audio is recorded, stored, or sent anywhere; only the final
// transcript becomes ordinary goal text the user reviews before pressing RUN TASK.
// The goal input is plain text and is NEVER disabled by voice state — text input must
// always work regardless of microphone support, permission, or errors. The whole block
// is guarded so a voice-setup failure can never break the rest of the popup.
try {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = byId('mic');
  const voiceStatusEl = byId('voice-status');
  let recognition = null, listening = false;
  const setVoiceStatus = (text) => { voiceStatusEl.textContent = text; };
  const resetMic = () => { listening = false; micBtn.disabled = false; micBtn.classList.remove('listening'); };
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    setVoiceStatus('Voice input is unavailable in this browser. Type your goal instead.');
  } else {
    const startRecognition = () => {
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = (event?.results?.[0]?.[0]?.transcript || '').trim();
        if (!transcript) { setVoiceStatus('No speech detected. Try again or type your goal.'); return; }
        byId('goal').value = transcript; // fills the SAME goal path; does not auto-run
        setVoiceStatus('Voice ready — review the goal, then press RUN TASK.');
      };
      recognition.onerror = (event) => {
        resetMic();
        setVoiceStatus(event?.error === 'not-allowed' || event?.error === 'service-not-allowed'
          ? 'Microphone permission denied. Type your goal instead.'
          : 'Voice input error. Type your goal instead.');
      };
      recognition.onend = () => resetMic();
      recognition.start(); // may throw synchronously; caller handles it
      setVoiceStatus('Listening…');
    };
    micBtn.addEventListener('click', async () => {
      if (listening) return;
      listening = true; micBtn.disabled = true; micBtn.classList.add('listening');
      // Explicitly acquire mic permission first: SpeechRecognition alone often fails in an
      // extension popup without ever prompting. We immediately stop the tracks — we don't
      // capture audio ourselves; SpeechRecognition opens its own stream for transcription.
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('nomd'), { name: 'NotSupportedError' });
        setVoiceStatus('Requesting microphone…');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        resetMic();
        const name = err?.name;
        setVoiceStatus(
          name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone permission denied. Type your goal instead.' :
          name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'No microphone found. Type your goal instead.' :
          'Microphone unavailable. Type your goal instead.');
        return;
      }
      try { startRecognition(); }
      catch { resetMic(); setVoiceStatus('Voice input error. Type your goal instead.'); }
    });
  }
} catch { /* Voice is optional; never let its setup break text input or the rest of the popup. */ }

// Fixed, safe user-facing text for each execution reason code. Never render a
// server- or page-derived string here.
const ACTION_REASON = {
  PAGE_CHANGED: 'Page changed — analyze again.',
  TAB_CHANGED: 'Active tab changed — analyze again.',
  STALE_OBSERVATION: 'Observation expired — analyze again.',
  ACTION_ALREADY_CONSUMED: 'Already executed — analyze again.',
  SENSITIVE_REGION: 'Blocked: target overlaps a sensitive region.',
  NO_ELEMENT_AT_POINT: 'Blocked: no element at the target point.',
  UNSAFE_ELEMENT: 'Blocked: target is not a safe clickable control.',
  DISABLED_ELEMENT: 'Blocked: target control is disabled.',
  INVALID_GEOMETRY: 'Blocked: invalid target geometry.',
  OUT_OF_VIEWPORT: 'Blocked: target is outside the viewport.',
  EXECUTION_FAILED: 'Blocked: action could not be executed.',
  BROWSING_PERMISSION_REQUIRED: 'Enable browsing across sites before a navigation task.',
};
const GUARDED_NOTE = 'Execute one validated action. Analyze again for a fresh plan after acting.';

// Fixed, internal display names — safe to render as-is (not page-derived).
const ROLE_LABEL = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  employee_id: 'Employee ID',
  password: 'Password',
  destination: 'Destination',
  purpose: 'Purpose',
};
let previewTimer;
let popupPlanMs, popupObservationId;
function clearPreviews() {
  clearTimeout(previewTimer);
  byId('original-preview').removeAttribute('src');
  byId('sanitized-preview').removeAttribute('src');
  byId('sanitized-preview').onload = null;
  byId('semantic-preview').textContent = '';
  byId('ac-preview').textContent = '';
  const canvas = byId('ocr-overlay');
  canvas.width = 0; canvas.height = 0;
  hide(byId('overlay-figure'));
}
window.addEventListener('pagehide', clearPreviews);

analyzeBtn.addEventListener('click', async () => {
  const started = globalThis.performance?.now();
  popupPlanMs = popupObservationId = undefined;
  renderMeasurements();
  analyzeBtn.disabled = true;
  clearPreviews();
  renderVerification({ status: 'WAITING' });
  hide(resultsEl);
  hide(errorEl);
  setStatus('Analyzing locally (up to 45s), then planning through localhost (up to 20s)…');
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.ANALYZE_PAGE, goal: byId('goal').value });
    if (!res || !res.ok) throw new Error(res?.error || 'Analysis failed.');
    popupPlanMs = started === undefined ? undefined : globalThis.performance.now() - started;
    popupObservationId = res.agentContext?.observation.id;
    renderMeasurements(res.measurements, { planMs: popupPlanMs });
    render(res);
    setStatus('Done');
  } catch (err) {
    showError(err?.message || String(err));
    setStatus('Error');
  } finally {
    analyzeBtn.disabled = false;
  }
});

function render(res) {
  const obs = res.observation ?? {};
  const counts = obs.counts ?? {};
  byId('c-inputs').textContent = counts.inputs ?? '–';
  byId('c-buttons').textContent = counts.buttons ?? '–';
  byId('c-labels').textContent = counts.labels ?? '–';

  renderSensitive(obs.fields ?? [], obs.sensitiveCount ?? 0);

  const cap = res.capture ?? {};
  byId('redacted-count').textContent = res.privacy.redactedRegions;
  byId('visual-status').textContent = res.privacy.visual;
  byId('semantic-status').textContent = res.privacy.semantic;
  byId('guard-status').textContent = res.privacy.outbound;
  if (res.safeContext) {
    byId('original-preview').src = res.localPreview.original;
    byId('sanitized-preview').src = res.safeContext.image.dataUrl;
    byId('semantic-preview').textContent = JSON.stringify(res.safeContext.semantic, null, 2);
  }
  renderPerception(res.perception, res.safeContext?.image);
  renderAgentContext(res);
  renderPlanner(res);
  renderAction(res);
  previewTimer = setTimeout(clearPreviews, 60_000);
  if (cap.ok) {
    byId('cap-status').textContent = 'Ready';
    byId('cap-res').textContent = `${cap.width} × ${cap.height}`;
  } else {
    byId('cap-status').textContent = 'Unavailable';
    byId('cap-res').textContent = '–';
    if (cap.error) showError('Capture: ' + cap.error);
  }
  show(resultsEl);
}

function renderPerception(perception, image) {
  const value = perception?.value;
  byId('ocr-status').textContent = perception?.status || 'Unavailable';
  byId('ocr-privacy').textContent = perception?.privacy || (perception?.status === 'UNSAFE' ? 'BLOCKED' : 'Unavailable');
  byId('ocr-time').textContent = value ? `${Math.round(value.processingMs)} ms` : '–';
  byId('ocr-count').textContent = value ? value.items.length : '–';
  byId('ocr-note').textContent = value ? `${value.withheldItems} sensitive or empty text lines withheld. English OCR baseline; not a ViT.` : perception?.reason || '';
  byId('ocr-timing').textContent = value ? `${value.timing.cold ? 'Cold' : 'Warm'} run · initialization ${Math.round(value.timing.initializationMs)} ms · inference ${Math.round(value.timing.inferenceMs)} ms · cleanup ${Math.round(value.timing.cleanupMs)} ms · total ${Math.round(value.timing.totalMs)} ms` : '';
  const list = byId('ocr-items'); list.textContent = '';
  if (!value) return;
  for (const item of value.items) {
    const row = document.createElement('p');
    row.className = 'ocr-item';
    const { x, y, width, height } = item.bbox;
    row.textContent = `${item.text} · ${item.confidence === null ? 'confidence unavailable' : (item.confidence * 100).toFixed(1) + '%'} · (${x}, ${y}, ${width}, ${height})`;
    list.append(row);
  }
  const preview = byId('sanitized-preview');
  const draw = () => {
    if (!preview.getAttribute('src')) return;
    const canvas = byId('ocr-overlay'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(preview, 0, 0);
    ctx.strokeStyle = '#ff4d24'; ctx.lineWidth = Math.max(2, image.width / 600);
    for (const item of value.items) { const b = item.bbox; ctx.strokeRect(b.x, b.y, b.width, b.height); }
    show(byId('overlay-figure'));
  };
  preview.onload = draw;
  if (preview.complete && preview.naturalWidth) draw();
}

function renderAgentContext(res) {
  const ctx = res.agentContext;
  byId('ac-status').textContent = res.agentContextStatus || 'Unavailable';
  if (!ctx) {
    for (const id of ['ac-obs', 'ac-fields', 'ac-visual', 'ac-hidden', 'ac-size']) byId(id).textContent = '–';
    // No context => OCR found sensitive text (REVOKED) or the guard blocked it.
    byId('ac-guard').textContent = res.agentContextStatus === 'REVOKED' ? 'REVOKED' : 'BLOCKED';
    byId('ac-ready').textContent = 'No';
    byId('ac-preview').textContent = '';
    return;
  }
  byId('ac-obs').textContent = ctx.observation.id;
  byId('ac-fields').textContent = ctx.fields.length;
  byId('ac-visual').textContent = ctx.visualElements.length;
  byId('ac-hidden').textContent = ctx.privacy.sensitiveFieldCount;
  byId('ac-guard').textContent = 'SAFE';
  byId('ac-size').textContent = `${(res.structuredContextBytes / 1024).toFixed(1)} KB`;
  byId('ac-ready').textContent = 'Yes';
  // The SAME object future transport would serialize — sanitized by construction, never raw PII.
  byId('ac-preview').textContent = JSON.stringify(ctx, null, 2);
}

function renderPlanner(res) {
  const planner = res.planner;
  const plan = planner?.plan;
  byId('planner-mode').textContent = planner?.plannerMode === 'ai' ? 'NVIDIA AI' :
    planner?.plannerMode === 'deterministic' ? 'Deterministic' : 'Unknown';
  byId('planner-status').textContent = planner?.status === 'READY' ? 'READY' :
    planner?.status === 'UNAVAILABLE' ? 'Planner unavailable' : 'Plan rejected';
  byId('planner-privacy').textContent = planner?.privacy || 'BLOCKED';
  byId('planner-size').textContent = `${((planner?.bytes || 0) / 1024).toFixed(1)} KB`;
  byId('planner-server').textContent = planner?.status === 'READY' ? 'Connected' : 'Unavailable / rejected';
  const target = res.agentContext?.visualElements.find((v) => v.id === plan?.target);
  byId('planner-decision').textContent = plan ?
    (target ? `${plan.action} ${target.text}` : plan.action) : '–';
  // Never render arbitrary server reason strings. The local target text was guarded.
  byId('planner-note').textContent = plan ? 'Suggestion only. Press Execute to act on it.' : planner?.reason || '';
}

function renderAction(res) {
  const planner = res.planner;
  const plan = planner?.plan;
  const target = res.agentContext?.visualElements.find((v) => v.id === plan?.target);
  hide(executeBtn);
  executeBtn.disabled = false;
  byId('action-target').textContent = '–';
  byId('action-note').textContent = GUARDED_NOTE;
  if (planner?.status === 'READY' && plan?.action === 'STOP') {
    byId('action-status').textContent = 'No action required';
    byId('action-note').textContent = 'Planner chose STOP; no browser action.';
    return;
  }
  if (planner?.status === 'READY' && plan?.action !== 'STOP' && res.execution?.available) {
    byId('action-status').textContent = 'Ready';
    byId('action-target').textContent = plan.action === 'TYPE' ? `${target?.text || 'Input'}: ${plan.text}` :
      plan.action === 'NAVIGATE' ? plan.url : plan.action === 'SCROLL' ? `${plan.direction} ${plan.amount}` :
      plan.action === 'PRESS_KEY' ? plan.key : target?.text || plan.action;
    show(executeBtn);
    return;
  }
  byId('action-status').textContent = 'Waiting for plan';
}

executeBtn.addEventListener('click', async () => {
  const started = globalThis.performance?.now();
  executeBtn.disabled = true;
  analyzeBtn.disabled = true;
  byId('action-status').textContent = 'Executing…';
  let res;
  try { res = await chrome.runtime.sendMessage({ type: MSG.EXECUTE_ACTION }); }
  catch { res = null; }
  hide(executeBtn);
  analyzeBtn.disabled = false;
  if (res?.status === 'EXECUTED') {
    byId('action-status').textContent = `${res.action || 'CLICK'} DISPATCHED`;
    byId('action-note').textContent = res.action === 'CLICK' ? 'One click dispatched. Result checked locally below.' : 'Action dispatched. Analyze again for a fresh plan.';
    renderVerification(res.verification || { status: 'NOT_VERIFIED' });
    const elapsed = started === undefined ? undefined : globalThis.performance.now() - started;
    renderMeasurements(res.verification?.measurements, {
      ...(res.observationId === popupObservationId && Number.isFinite(popupPlanMs) && Number.isFinite(elapsed)
        ? { planMs: popupPlanMs, machineTotalMs: popupPlanMs + elapsed } : {}), postExecutionMs: elapsed });
  } else if (!res) {
    byId('action-status').textContent = 'Dispatch status unavailable';
    byId('action-note').textContent = 'Analyze again before another action.';
    renderVerification({ status: 'NOT_VERIFIED' });
  } else {
    byId('action-status').textContent = 'BLOCKED';
    byId('action-note').textContent = ACTION_REASON[res?.reason] || 'Blocked: action unavailable.';
  }
});

// --- Autonomous agent (Phase 11B) ---------------------------------------
// Fixed, safe outcome text keyed by controller reason code (see
// shared/outcome-contract.js). Never render server- or page-derived strings, so
// model output and page text can never reach the UI; target text below is the
// local, already-guarded OCR text.
// Only GOAL_ACHIEVED reports success — every other entry must read as non-success.
// Since Phase 13C GOAL_ACHIEVED means planner claim + local result verification.
const AGENT_OUTCOME = {
  GOAL_ACHIEVED: 'Task complete — the planner reported the goal achieved and a fresh local observation showed the result.',
  VERIFICATION_FAILED: 'Stopped: the planner reported success, but local verification found no supporting evidence. Not confirmed.',
  VERIFICATION_INCONCLUSIVE: 'Stopped: the planner reported success before any action was taken; nothing could be verified.',
  VERIFIER_UNAVAILABLE: 'Stopped: result verification was unavailable. The goal was not confirmed.',
  STOP_NO_TARGET: 'Stopped: no suitable target was available. The goal was not confirmed.',
  STOP_UNSAFE: 'Stopped: the planner judged it unsafe to continue.',
  STOP_NO_PROGRESS: 'Stopped: the planner took no action and the goal was not confirmed.',
  STOP_UNSUPPORTED_GOAL: 'Stopped: this goal is not supported by the current planner.',
  STOP_INCOMPLETE_CONTEXT: 'Stopped: required information was missing or incomplete.',
  STOP_UNCLASSIFIED: 'Stopped: the planner stopped for an unrecognised reason.',
  MAX_STEPS: 'Stopped: maximum autonomous steps reached.',
  CANCELLED: 'Stopped by user.',
  PLANNER_UNAVAILABLE: 'Stopped: planner unavailable.',
  PRIVACY_FAILED: 'Stopped: privacy guard blocked the run.',
  PERCEPTION_FAILED: 'Stopped: local perception failed.',
  OBSERVE_FAILED: 'Stopped: page could not be observed.',
  INVALID_TARGET: 'Stopped: no valid action target.',
  ACTION_FAILED: 'Stopped: action could not be executed.',
  BROWSING_PERMISSION_REQUIRED: 'Enable browsing across sites before a navigation task.',
  STALE_OBSERVATION: 'Stopped: observation expired before acting.',
  LOOP_DETECTED: 'Stopped: repeated action with no progress.',
};

// Phase 13B: the background worker owns the run; the popup is only a view. This
// is the run the popup is showing, so updates/cancels for any other run are ignored.
let agentRunId = null;

function appendAgentLog(text) {
  const row = document.createElement('div');
  row.className = 'row';
  row.textContent = text;
  byId('agent-log').append(row);
}

function renderAgentEvent(e) {
  if (e.event === 'AGENT_RUN_STARTED') {
    byId('agent-log').textContent = '';
    byId('agent-status').textContent = 'RUNNING';
    byId('agent-step').textContent = `0 / ${e.maxSteps}`;
    byId('agent-decision').textContent = '–';
    return;
  }
  if (e.event === 'AGENT_STEP_STARTED') { byId('agent-step').textContent = `${e.step} / 8`; return; }
  if (e.event === 'OBSERVATION_READY') { appendAgentLog(`Step ${e.step}: observed`); return; }
  if (e.event === 'REOBSERVATION_READY') { appendAgentLog(`Step ${e.step}: re-observed fresh page`); return; }
  if (e.event === 'PRIVACY_PASS') { appendAgentLog(`Step ${e.step}: privacy SAFE`); return; }
  if (e.event === 'PLAN_READY') {
    const decision = `${e.action} ${e.target ?? ''}`.trim();
    byId('agent-decision').textContent = decision;
    appendAgentLog(`Step ${e.step}: plan → ${decision}`);
    return;
  }
  if (e.event === 'ACTION_EXECUTED') { appendAgentLog(`Step ${e.step}: ${e.action || 'CLICK'} dispatched`); return; }
  if (e.event === 'VERIFICATION_RESULT') {
    appendAgentLog(`Step ${e.step}: result verification ${e.status === 'VERIFIED' ? 'VERIFIED' : 'NOT VERIFIED'}`);
    return;
  }
  if (['AGENT_COMPLETED', 'AGENT_STOPPED', 'AGENT_FAILED', 'AGENT_CANCELLED'].includes(e.event)) {
    // Only AGENT_STATE.COMPLETED may read as success. Every other terminal
    // state is shown as stopped/failed/cancelled, never as TASK COMPLETE.
    const label = e.state === 'COMPLETED' ? 'TASK COMPLETE'
      : e.state === 'FAILED' ? 'TASK FAILED'
      : e.state === 'CANCELLED' ? 'TASK CANCELLED' : 'TASK STOPPED';
    byId('agent-status').textContent = label;
    byId('agent-note').textContent = AGENT_OUTCOME[e.reason] || 'Run ended without a confirmed result.';
    // A reopened popup has no pending RUN_TASK response, so release controls here.
    hide(stopBtn);
    runBtn.disabled = false;
    analyzeBtn.disabled = false;
    setStatus('Done');
  }
}

// Render the worker's safe run snapshot on popup open. Never starts or cancels.
function renderAgentSnapshot(s) {
  if (!s?.runId) return; // no run since the worker started: normal idle UI
  agentRunId = s.runId;
  show(byId('agent-card'));
  byId('agent-step').textContent = `${s.step} / ${s.maxSteps}`;
  byId('agent-decision').textContent = s.lastAction || '–';
  if (!s.active) { renderAgentEvent({ event: 'AGENT_' + s.state, state: s.state, reason: s.outcomeCode }); return; }
  byId('agent-status').textContent = 'RUNNING';
  show(stopBtn);
  runBtn.disabled = true;
  analyzeBtn.disabled = true;
  setStatus('Running autonomous task…');
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  analyzeBtn.disabled = true;
  clearPreviews();
  hide(resultsEl);
  hide(errorEl);
  show(byId('agent-card'));
  show(stopBtn);
  setStatus('Running autonomous task…');
  let res;
  try { res = await chrome.runtime.sendMessage({ type: MSG.RUN_TASK, goal: byId('goal').value }); }
  catch { res = null; }
  hide(stopBtn);
  runBtn.disabled = false;
  analyzeBtn.disabled = false;
  if (res?.ok && res.summary) {
    renderAgentEvent({ event: 'AGENT_' + res.summary.state, ...res.summary });
    setStatus('Done');
  } else {
    byId('agent-status').textContent = 'FAILED';
    byId('agent-note').textContent = res?.error || 'Autonomous run failed.';
    setStatus('Error');
  }
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  byId('agent-note').textContent = 'Stopping after the current step…';
  try { await chrome.runtime.sendMessage({ type: MSG.CANCEL_TASK, runId: agentRunId ?? undefined }); } catch { /* ignore */ }
  stopBtn.disabled = false;
});

function renderSensitive(fields, count) {
  const listEl = byId('sensitive-list');
  listEl.textContent = '';

  const sensitive = fields.filter((f) => f.sensitive);
  for (const f of sensitive) {
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('span');
    left.textContent = '✓ ' + (ROLE_LABEL[f.role] || 'Sensitive field'); // role from fixed map
    const tag = document.createElement('b');
    tag.className = 'tag';
    tag.textContent = 'Sensitive';
    row.append(left, tag);
    listEl.append(row);
  }
  byId('sensitive-count').textContent = count;

  // Display names come from a fixed vocabulary, never DOM labels.
  const nonEl = byId('nonsensitive');
  const nonSensitive = fields.filter((f) => !f.sensitive);
  nonEl.textContent = nonSensitive.length
    ? 'Not sensitive: ' + nonSensitive.map((f) => ROLE_LABEL[f.role] || 'field').join(', ')
    : '';
}

function setStatus(text) { statusEl.textContent = text; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showError(msg) { errorEl.textContent = msg; show(errorEl); }

// Safe metadata only; no retained post-action screenshot or page-text preview.
function renderVerification(result) {
  if (result?.measurements) renderMeasurements(result.measurements);
  const state = result?.status || 'WAITING';
  byId('verification-status').textContent = state === 'VERIFIED' ? 'VISUALLY VERIFIED' :
    state === 'VERIFYING' ? 'VERIFYING' : state === 'WAITING' ? 'Waiting for action' : 'NOT VERIFIED';
  byId('verification-evidence').textContent = state === 'VERIFIED' ? 'Travel Request Submitted' : '–';
  byId('verification-before').textContent = result?.actionObservationId || '–';
  byId('verification-observation').textContent = result?.verificationObservationId || '–';
  byId('verification-privacy').textContent = result?.privacy === 'SAFE' ? 'SAFE' : '–';
  const reasons = ['TAB_CHANGED', 'CAPTURE_FAILED', 'PERCEPTION_FAILED', 'PRIVACY_FAILED',
    'TIMEOUT', 'NO_VISUAL_MATCH', 'STALE_OBSERVATION', 'INVALID_SPEC'];
  byId('verification-note').textContent = state === 'VERIFIED' ? 'Confirmed by fresh local pixel OCR.' :
    state === 'VERIFYING' ? 'Click dispatched. Observing fresh pixels locally…' :
    state === 'WAITING' ? 'Fresh local visual evidence after Execute.' :
    (reasons.includes(result?.reason) ? result.reason + ' — ' : '') + 'Analyze again';
  if (state === 'VERIFYING') {
    byId('action-status').textContent = 'CLICK DISPATCHED';
    byId('action-note').textContent = 'Verifying the result locally.';
  }
  if (state === 'VERIFYING') analyzeBtn.disabled = true;
  else if (state !== 'WAITING') analyzeBtn.disabled = false;
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === MSG.VERIFICATION_UPDATE) { renderVerification(message.verification); return false; }
  if (message?.type === MSG.AGENT_UPDATE && message.update) {
    const update = message.update;
    if (update.event === 'AGENT_RUN_STARTED') agentRunId = update.runId;
    else if (agentRunId && update.runId !== agentRunId) return false; // stale run
    renderAgentEvent(update);
    return false;
  }
  return false;
});
chrome.runtime.sendMessage({ type: MSG.GET_VERIFICATION }).then(renderVerification).catch(() => {});
chrome.runtime.sendMessage({ type: MSG.GET_AGENT_STATE }).then(renderAgentSnapshot).catch(() => {});

function renderMeasurements(values = {}, overrides = {}) {
  const m = { ...values };
  for (const [key, value] of Object.entries(overrides)) if (Number.isFinite(value)) m[key] = value;
  const duration = (n) => Number.isFinite(n) && n >= 0 ? n.toFixed(1) + ' ms' : '--';
  const mapping = { plan: 'planMs', ocr: 'perceptionMs', planner: 'plannerRoundTripMs',
    click: 'clickDispatchMs', execute: 'postExecutionMs', verification: 'verificationMs',
    total: 'machineTotalMs', human: 'humanConfirmationMs' };
  for (const [id, key] of Object.entries(mapping)) byId('metric-' + id).textContent = duration(m[key]);
  const privacy = ['detectionMs', 'redactionMs', 'semanticGuardMs', 'visualGuardMs', 'contextGuardMs'].map((key) => m[key]);
  byId('metric-privacy').textContent = duration(privacy.every(Number.isFinite) ? privacy.reduce((a, b) => a + b, 0) : undefined);
  byId('metric-payload').textContent = Number.isFinite(m.safeContextBytes) && m.safeContextBytes >= 0 ? m.safeContextBytes + ' bytes' : '--';
}

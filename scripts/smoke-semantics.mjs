// Live check of planner SUCCESS semantics (READY is not ACHIEVED) against the running
// local server. Synthetic SAFE contexts only; prints scenario names, the chosen action
// and the fixed outcome code — never model text. Requires AI mode for a meaningful run.
import { pathToFileURL } from 'node:url';
import { requestPlan } from '../extension/src/transport/planner-client.js';
import { buildSafeAgentContext } from '../extension/src/privacy/agent-context.js';
import { classifyStop, STOP_CODE } from '../extension/src/shared/outcome-contract.js';
import { plannerInput } from '../extension/tests/planner-fixture.mjs';

let seq = 0;
function context({ goal, items = [], candidates = [], metadata = {}, pageOrigin }) {
  return buildSafeAgentContext({ goal, semantic: { fields: [] }, pageOrigin,
    visualState: { items: items.map((text, i) => ({ id: `visual_${i + 1}`, text,
      bbox: { x: 20, y: 40 + i * 40, width: 200, height: 24 }, confidence: 0.95 })) },
    actionCandidates: candidates, candidateMetadata: metadata,
    image: { width: 800, height: 600, redactedRegions: 0 },
    observation: { id: `obs_semantics-${++seq}`, capturedAt: new Date().toISOString(), viewport: { width: 800, height: 600 } },
    sensitiveValues: [] }).context;
}
const achieved = (plan) => plan.action === 'STOP' && classifyStop(plan.reason).code === STOP_CODE.GOAL_ACHIEVED;
const button = { role: 'button', editable: false, focused: false };

export const SCENARIOS = [
  // 1/2: prerequisites satisfied + a submit-like control => act, never claim success.
  { name: 'form-ready-submit', want: 'CLICK the submit control, not GOAL_ACHIEVED',
    context: () => buildSafeAgentContext(plannerInput()).context,
    pass: (plan) => plan.action === 'CLICK' && plan.target === 'visual_12' },
  { name: 'generic-ready-send', want: 'CLICK Send, not GOAL_ACHIEVED',
    context: () => context({ goal: 'Send this feedback message.', pageOrigin: 'https://feedback.invalid',
      items: ['Feedback', 'Great workshop, thank you', 'Send'], candidates: ['visual_3'], metadata: { visual_3: button } }),
    pass: (plan) => plan.action === 'CLICK' && plan.target === 'visual_3' },
  // 3: the result is visible => success is allowed (and expected).
  { name: 'result-visible', want: 'STOP with GOAL_ACHIEVED',
    context: () => context({ goal: 'Check whether this travel request is complete and submit it.',
      pageOrigin: 'https://demo.invalid', items: ['Request submitted successfully', 'Reference will be emailed'] }),
    pass: achieved },
  // 4: query typed, results not loaded => not achieved.
  { name: 'search-typed-no-results', want: 'not GOAL_ACHIEVED (e.g. PRESS_KEY)',
    context: () => context({ goal: 'Search for calculus videos.', pageOrigin: 'https://library.invalid',
      items: ['calculus videos', 'Search'], candidates: ['visual_1', 'visual_2'],
      metadata: { visual_1: { role: 'searchbox', editable: true, focused: true }, visual_2: button } }),
    pass: (plan) => !achieved(plan) },
  // 5: destination not open yet => not achieved.
  { name: 'navigate-pending', want: 'not GOAL_ACHIEVED (e.g. NAVIGATE)',
    context: () => context({ goal: 'Open https://www.youtube.com and search for calculus videos.',
      pageOrigin: 'https://start.invalid', items: ['Welcome', 'Start page'] }),
    pass: (plan) => !achieved(plan) },
  // 6: unfinished with no usable target => non-success STOP semantics unchanged.
  { name: 'no-target-unfinished', want: 'not GOAL_ACHIEVED',
    context: () => { const input = plannerInput(); input.visualState.items = []; input.actionCandidates = [];
      return buildSafeAgentContext(input).context; },
    pass: (plan) => !achieved(plan) },
];

export async function runSemantics({ fetchImpl = globalThis.fetch, write = console.log } = {}) {
  let failures = 0;
  for (const scenario of SCENARIOS) {
    const result = await requestPlan(scenario.context(), { fetchImpl });
    const plan = result.plan;
    const outcome = result.status !== 'READY' ? `NOT_READY:${result.failureCode || result.httpStatus || 'NETWORK'}`
      : plan.action === 'STOP' ? `STOP:${classifyStop(plan.reason).code}` : plan.action;
    const ok = result.status === 'READY' && scenario.pass(plan);
    if (!ok) failures++;
    write(`${ok ? 'PASS' : 'FAIL'} ${scenario.name}: got ${outcome}; want ${scenario.want}`);
  }
  write(failures ? `FAIL semantics: ${failures}/${SCENARIOS.length} scenarios` : `PASS semantics: ${SCENARIOS.length}/${SCENARIOS.length}`);
  return failures === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { if (!await runSemantics()) process.exitCode = 1; }
  catch { console.error('FAIL semantics: SMOKE_INTERNAL_ERROR'); process.exitCode = 1; }
}

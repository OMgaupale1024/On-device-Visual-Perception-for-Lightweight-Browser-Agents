// Phase 13A — the ONE place that decides whether a planner STOP means success.
//
// Before this module the controller treated every STOP as completion, so a run
// that took no action because no target existed, or because continuing was
// unsafe, was reported to the user as TASK COMPLETE. That was a false success
// claim, not a display bug: the contract had no way to say "achieved", so STOP
// carried both meanings at once.
//
// The planner reason vocabulary is server-owned and fixed:
//   AI mode            server/app/ai_contract.py  -> SafeReason (pydantic Literal); the
//                      model emits only a reasonCode, which the server maps to one of these
//   deterministic mode server/app/planner.py      -> fixed module constants
// Both are server-authored constants validated before they reach the browser;
// none is free model text. GOAL_ACHIEVED_REASON is the only value that asserts
// the goal was reached.
//
// Keep every reason -> outcome decision here. The controller maps `success` onto
// the existing AGENT_STATE enum and the popup maps `code` onto fixed display
// text; neither compares reason strings itself.

// Mirrors GOAL_ACHIEVED_REASON in server/app/ai_contract.py. Changing one
// without the other silently disables success reporting (fail-closed).
export const GOAL_ACHIEVED_REASON = 'The goal is already achieved.';

// Stable codes for the popup's fixed display map. Not a competing state enum:
// terminal state stays AGENT_STATE in agent-controller.js.
export const STOP_CODE = Object.freeze({
  GOAL_ACHIEVED: 'GOAL_ACHIEVED',
  NO_TARGET: 'STOP_NO_TARGET',
  UNSAFE: 'STOP_UNSAFE',
  NO_PROGRESS: 'STOP_NO_PROGRESS',
  UNSUPPORTED_GOAL: 'STOP_UNSUPPORTED_GOAL',
  INCOMPLETE_CONTEXT: 'STOP_INCOMPLETE_CONTEXT',
  UNCLASSIFIED: 'STOP_UNCLASSIFIED',
});

const CLASSIFICATION = Object.freeze({
  // --- success: the only reason that reports an achieved goal ---
  [GOAL_ACHIEVED_REASON]: STOP_CODE.GOAL_ACHIEVED,

  // --- AI SafeReason, non-success (server REASON_MESSAGES) ---
  'No suitable visual target is available.': STOP_CODE.NO_TARGET,          // NO_VALID_TARGET
  'The request cannot be completed safely.': STOP_CODE.UNSAFE,             // UNSAFE_TO_CONTINUE
  'Required information is missing or unavailable.': STOP_CODE.INCOMPLETE_CONTEXT, // INSUFFICIENT_CONTEXT
  // ADVANCE_GOAL on a STOP contradicts itself: the planner stopped without acting.
  'The next action advances the goal.': STOP_CODE.NO_PROGRESS,
  // Pre-reasonCode server wording, still classified (non-success) for older servers.
  // These two describe a state BEFORE acting ("Continue is visible" means the
  // form is not submitted yet). A STOP carrying one is a stall, not a success.
  'Required fields are filled and Continue is visible.': STOP_CODE.NO_PROGRESS,
  'A suitable visual target is visible.': STOP_CODE.NO_PROGRESS,

  // --- deterministic planner, non-success ---
  'Goal is not supported by the deterministic travel planner.': STOP_CODE.UNSUPPORTED_GOAL,
  'Required travel fields are missing, ambiguous or incomplete.': STOP_CODE.INCOMPLETE_CONTEXT,
  'A unique Continue visual element is unavailable.': STOP_CODE.NO_TARGET,
});

/**
 * Classify a planner STOP reason.
 *
 * Fail-closed: anything unrecognised, absent or non-string is NON-SUCCESS. A new
 * server reason therefore degrades to "stopped", never to a false completion.
 *
 * @param {unknown} reason the plan's server-supplied reason string
 * @returns {{ code: string, success: boolean }}
 */
export function classifyStop(reason) {
  // Object.hasOwn, not a bare lookup: a plain index would walk the prototype
  // chain, so a reason of "constructor" or "toString" would resolve to an
  // inherited value instead of falling through to UNCLASSIFIED.
  if (typeof reason !== 'string' || !Object.hasOwn(CLASSIFICATION, reason)) {
    return { code: STOP_CODE.UNCLASSIFIED, success: false };
  }
  const code = CLASSIFICATION[reason];
  return { code, success: code === STOP_CODE.GOAL_ACHIEVED };
}

// Phase 13C — a GOAL_ACHIEVED STOP is only the planner's CLAIM. A run completes only
// when local result verification of the current fresh observation also passes.
// These codes say why a claimed success was not confirmed (all non-success).
export const VERIFY_CODE = Object.freeze({
  FAILED: 'VERIFICATION_FAILED',             // verifier ran; fresh state gave no supporting evidence
  INCONCLUSIVE: 'VERIFICATION_INCONCLUSIVE', // no action was executed this run: nothing to verify
  UNAVAILABLE: 'VERIFIER_UNAVAILABLE',       // verifier missing, threw, or returned no verdict
});

/**
 * Combine a planner success claim with the local verifier's result.
 * Fail-closed: only an explicit VERIFIED is success.
 *
 * @param {unknown} verification verifier result ({ status, reason? }) or null
 * @returns {{ code: string, success: boolean, detail: string|null }}
 *   detail is the verifier's own fixed reason code, for safe logging only.
 */
export function verifiedOutcome(verification) {
  const detail = typeof verification?.reason === 'string' && /^[A-Z_]{1,64}$/.test(verification.reason)
    ? verification.reason : null;
  if (verification?.status === 'VERIFIED') return { code: STOP_CODE.GOAL_ACHIEVED, success: true, detail: null };
  if (verification?.status !== 'NOT_VERIFIED') return { code: VERIFY_CODE.UNAVAILABLE, success: false, detail };
  return { code: detail === 'NO_ACTION_TAKEN' ? VERIFY_CODE.INCONCLUSIVE : VERIFY_CODE.FAILED, success: false, detail };
}

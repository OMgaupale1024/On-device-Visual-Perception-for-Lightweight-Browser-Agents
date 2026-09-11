# Session Handoff

## Current Task / Baseline

Phase 11A: correct Nemotron choosing STOP for a complete actionable travel form.
Started clean at 7b34f7a on main. User confirmed real AI smoke now returns a valid
STOP instead of UNAVAILABLE. Timeout, key, network, OCR, grounding, candidates and
privacy are not the current blocker; do not change them.

## Diagnosis and Change

- Exact provider projection contains the goal, all seven filled semantic roles,
  five privacy placeholders, safe destination/purpose, and a unique Continue element
  with actionable=true. Coordinates, observation IDs and private values are omitted.
- Old prompt listed necessary prerequisites without an explicit sufficient CLICK
  rule or a filled-versus-submitted distinction. This is a plausible policy gap;
  the model's internal reason for its live STOP is not known.
- Updated SYSTEM_PROMPT: require CLICK on the actual unique actionable Continue ID
  for a completed travel form; filled fields alone are not a submitted goal;
  intentionally redacted filled values count as filled. Explicit STOP conditions
  retain missing/incomplete/unavailable fields, no target, ambiguity, completed goal
  and unsafe action. Removed fixed example IDs.
- Server decision path, provider settings, reason enum and validators are unchanged.
  No retries, fallback, local CLICK decision, perception or privacy changes.

## Tests / Limits

- AI planner/provider/endpoint and prompt tests: 36/36 PASS.
- Full server suite: 65/65 PASS.
- Full extension suite: 248/248 PASS, zero skipped.
- npm run check: PASS.
- New tests inspect exact minimized HTTP message content for the complete fixture,
  another visual ID and the no-target state. A regression confirms a provider STOP
  is preserved even for a complete actionable fixture; local code never replaces it.
- These are automated contract/transport tests, not proof of real model behavior.
- Diff review and whitespace check: PASS. Credential-pattern scan of 101 tracked
  text files (excluding archive/vendor): no findings; no private .env files unignored.

## Live Acceptance / Exact Resume Point

The user previously chose to run live tests in their already configured terminal.
A request is pending for their safe result after restarting FastAPI with the new
working-tree prompt. Do not request or print the key. No new live run is claimed.

1. Restart FastAPI in that AI-configured terminal.
2. From root: node scripts/smoke-planner.mjs --ai.
   Require PASS: first fixture CLICK on its supplied candidate; second no-target
   fixture STOP. Do not change the smoke expectations or substitute mocked evidence.
3. After smoke passes, reload EdgeSight and the demo; ANALYZE / PLAN, DO NOT EXECUTE.
   Require actionCandidates contains current Continue ID, /plan 200, planner header ai,
   CLICK on that same ID, target validation passed, privacy 5/5/rawPiiIncluded=false.
4. Only after both live checks pass: update these docs with acceptance, test as needed,
   commit/push normally, verify HEAD == origin/main and clean tree, then stop.
   Phase 11A is NOT yet marked complete. Do not start an autonomous loop.

## Uncommitted Files / Constraints

- server/app/ai_contract.py
- server/tests/test_ai_planner.py
- docs/AI_CONTEXT.md
- docs/HANDOFF.md

Preserve these changes while waiting for the user's live results. Latest committed
baseline remains 7b34f7a. No hardcoded action/ID outside the prompt, no fallback,
no changes to reason enum or approved-candidate validation, no Execute or new phase.

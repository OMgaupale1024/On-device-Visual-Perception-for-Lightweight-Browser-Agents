# EdgeSight - Phase 8 handoff

**Phases 0-8 code complete. Phase 8 manual Chrome verification PENDING.**
Stop after this checkpoint's commit/push. Exact next implementation: Phase 9 SIH
metrics; not started. Read AI_CONTEXT.md for the current architecture and invariants,
PHASE_8_PLAN.md for the pre-implementation plan, and TESTING.md for actual evidence.

Before future changes: git status, git branch, git log --oneline -10, git fetch,
git pull --ff-only; read README/context/architecture/progress/decisions/testing docs.
Code, tests and Git are source of truth; one writer; never force push.

## What changed

Phase 7's user-triggered guarded click now automatically starts local observation.
After 750 ms, make ONE fresh capture of the intended active tab in its expected window.
A new document/URL is allowed after the click; the new capture pins its own document.
Shared background/local-observation.js reuses the existing capture, fresh OCR,
PII detection, redaction, visual filtering and final context approval transaction.
Only Analyze / Plan calls the server and creates a ticket. Verification has zero remote
calls, no /plan or NVIDIA, no second action and no automatic retry/recovery.

verification/verify-visual-result.js requires an approved context, a different
observation UUID, a post-dispatch timestamp and source=visual evidence. It matches the
full 'Travel Request Submitted' phrase after conservative normalization; bbox reading
order can join at most three spatially adjacent OCR fragments. Confidence values are
recorded as actual 0-1/null, not fabricated or thresholded. Full policy in AI_CONTEXT.
The popup shows CLICK DISPATCHED -> VERIFYING -> VISUALLY VERIFIED / NOT VERIFIED,
known expected evidence and before/after IDs. SAFE appears only after privacy reruns.
The worker retains only safe verification metadata for popup reopen; no persistence.

Timings: dispatch/completion timestamps, actual delay, capture, perception, matching,
total elapsed. Five-second local API bounds, existing 45-second OCR bound, 60-second
verification deadline with late-result rejection. One attempt. No Phase 9 dashboard.

## Validation and manual status

- Extension **207/207 PASS** (55 new, all 152 prior unchanged).
- Server **50/50 PASS**, unchanged server code. Sandbox escalation was required to
  access the venv interpreter; no dependency changes.
- Syntax/manifest/OCR asset integrity and diff whitespace checks PASS.
- Genuine cold/warm Node/WASM OCR synthetic smoke PASS. This is not Chrome evidence.
- Real temporary FastAPI HTTP: deterministic 200/CLICK, ai missing-key 503 PASS, mode
  headers correct, no provider calls, test processes stopped.
- Phase 6A user Chrome confirmation preserved (7 fields, 5 masks/placeholders, safe
  context, false raw-PII flag, Bengaluru/Conference retained, working /plan).
- Phase 6B integrated NVIDIA Chrome **PENDING**. No NVIDIA_API_KEY configured; no key
  read/printed, no .env present, no live provider request.
- Phase 7 positive click and stale/wrong-page negative **PENDING**.
- Phase 8 positive and negative Chrome **PENDING**. Chrome launched, then Computer Use
  stopped: current URL could not be determined reliably for policy enforcement.
  No further browser input. No observed extension reload, click or visual verification.

## Manual acceptance remaining

Start server per server/README.md with exact extension origin. Deterministic mode is
sufficient to isolate Phase 7/8; ai preferred only with user's valid rotated key.
Reload EdgeSight 0.8.0, reset Employee Travel Request, use the default goal, Analyze /
Plan. Confirm OCR READY, privacy SAFE, context READY and CLICK Continue (before evidence).
Press Execute. Confirm actual click, fresh capture/OCR, distinct observation ID,
Travel Request Submitted evidence and VISUALLY VERIFIED. The result panel is the primary
judge display; no raw PII or DevTools required. Record actual mode and results.
Negative: switch tabs immediately after Execute, before 750 ms capture; reopen popup
and expect NOT VERIFIED / TAB_CHANGED / Analyze again, no unrelated screenshot evidence.
See TESTING.md for exact separate Phase 7 and Phase 8 checks. Do not mark pending as PASS
without observing it. The desired full SIH end-to-end loop is not yet manually proven.

## Files / limits / checkpoint

New: background/local-observation.js, verification/{verify-after-click,verify-visual-result}.js,
three verification test files, docs/PHASE_8_PLAN.md. Updated worker, popup, messages,
manifest 0.8.0 and all seven required overview/handoff docs. Server untouched.

Limits: one delayed frame may miss slow transitions; only the full English phrase,
not backend persistence/causality; OCR/unknown-PII limitations; tab/capture checks are
not atomic; cross-origin activeTab revocation may block; worker restart loses transient
state. No general workflow, typing, scrolling, replanning, new provider, Pi or metrics.

Baseline b9d7a92. Latest commit is the one containing this handoff, subject
feat: add local visual outcome verification; git log -1 --format=%H resolves its hash.
Final report records normal push, HEAD == origin/main and clean-tree verification.
No keys, .env, screenshots, PII dumps, dependencies, caches or debug captures committed.

Exact next task: **PHASE 9 - SIH evaluation metrics**: visual-context accuracy 25%,
PII precision/recall 20%, redaction precision 20%, client resources 20%, latency 15%.
No fabricated metrics. Phase 9 is NOT STARTED. Stop after Phase 8.

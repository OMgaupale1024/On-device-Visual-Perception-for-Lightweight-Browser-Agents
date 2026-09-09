# EdgeSight — Progress

CURRENT PHASE:
Phase 2 — Local sensitive-data detection (complete). Phase 3 not started.

STATUS:
Phase 2 complete. Code + docs committed and pushed to `origin/main`. No blockers.
Detection verified by 7 Node unit tests + a live-DOM run on the demo page.
Phase 1 manual checks **M1–M4 verified by user on 2026-09-10** (M5–M8 still pending).

COMPLETED:
- Phase 0 foundation; Phase 1 extension + demo + local visual capture (pushed).
- Phase 2 local sensitive-field detection:
  - observer now returns per-field structural SIGNALS (type, name/id, label, autocomplete) — never values;
  - pure `privacy/detect.js` classifies each field → name / email / phone / password / employee_id / other;
  - background drops the signals; popup receives only `{ id, role, sensitive, label }`;
  - popup shows a sensitive checklist + total + a non-sensitive list;
  - conservative rules avoid false positives (username / nickname / file name / destination / purpose).
- Tests: 7 Node tests pass (roles, total = 5, false positives, name variants, value-ignoring,
  serialization/leak proof, empty input). Live demo DOM: 7 signals, roles correct, sensitiveCount 5,
  **zero of 7 actual page values leaked** into the returned metadata.
- Roadmap correction applied (DECISIONS D11): visual perception is **core Phase 4**.

CURRENT WORK:
- None in flight. Awaiting review before Phase 3.

REMAINING (corrected roadmap):
- Phase 3: local redaction + outbound privacy guard.
- Phase 4: **LOCAL VISUAL PERCEPTION (core)** — on-device OCR/CV over the captured screenshot.
- Phase 5: sanitized structured UI state (DOM + visual merged).
- Phase 6: FastAPI deterministic planner.
- Phase 7: safe validated action execution (CLICK first).
- Phase 8: re-observe + verify loop.
- Phase 9: metrics.
- Phase 10: polish.

BLOCKERS:
- None.

NEXT EXACT TASK:
- Begin Phase 3: local redaction + outbound privacy guard, entirely in the extension, still no server.
  (a) Redaction: map each sensitive field's role to a placeholder token — `[NAME]`, `[EMAIL]`,
  `[PHONE]`, `[EMPLOYEE_ID]`, `[PASSWORD]`; non-sensitive values stay usable.
  (b) PRIVACY GUARD: before any payload could leave the browser, scan it for known raw sensitive
  values (read locally, never logged/sent); if any appears, BLOCK and return an explicit privacy
  error — the network layer must never receive an unsafe payload.
  (c) Optional ORIGINAL → SAFE debug view in the popup (values shown locally only, never logged/sent).
  Tests: guard blocks a payload containing a raw value; passes a sanitized one. Do NOT build the
  planner/server yet (Phase 6). Do NOT implement OCR yet (Phase 4).

LAST UPDATED:
2026-09-10 — end of Phase 2.

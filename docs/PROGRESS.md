# EdgeSight — Progress

CURRENT PHASE:
Phase 1 — Chrome extension + demo page + visual input pipeline (complete). Phase 2 not started.

STATUS:
Phase 1 complete. Application code + docs committed and pushed to `origin/main`. No blockers.
Observer logic + demo page verified by automated in-browser tests; extension load/popup/capture
covered by documented manual steps (M1–M8 in TESTING.md).

COMPLETED:
- Phase 0 foundation (git, docs, README, structure) — pushed.
- Hybrid-perception architecture documented (DOM + visual): ARCHITECTURE.md rewritten;
  DECISIONS.md D8 (hybrid), D9 (programmatic injection / minimal perms), D10 (measure-then-drop capture).
- MV3 extension: `manifest.json` (permissions: `activeTab`, `scripting` only); popup
  (goal + ANALYZE PAGE + status + results card); background service worker (orchestrator);
  injected DOM observer; shared message constants.
- Local visual input pipeline: `chrome.tabs.captureVisibleTab` in the background; real dimensions
  via `createImageBitmap`; image held in memory and dropped — no storage, no transmission.
- Controlled demo page: Employee Travel Request (fake data), semantic HTML
  (labels / input types / names / autocomplete), password field, Continue → "Travel Request
  Submitted" success state (observable "after" for later verification).
- Tests: manifest valid JSON; 4 JS modules parse (`node --check`); observer counts 7/1/7 verified
  in-browser; field semantics + success flow verified; manual extension tests documented.

CURRENT WORK:
- None in flight. Awaiting review before Phase 2.

REMAINING (this prototype, high level):
- Phase 2: local sensitive-data detection (name/email/phone/password/employee-id).
- Phase 3: local redaction + outbound privacy guard.
- Phase 4: sanitized structured UI state.
- Phase 5: FastAPI deterministic planner.
- Phase 6: safe validated action execution (CLICK first).
- Phase 7: re-observe + verify loop.
- Phase 8: real metrics.
- Phase 9 (optional): on-device visual perception (OCR/CV/face) — consumes the Phase 1 pipeline.
- Phase 10: polish.

BLOCKERS:
- None.

NEXT EXACT TASK:
- Begin Phase 2: add on-device sensitive-field detection in the extension. Extend the injected
  observer to return per-field signals (input `type`, label text, `name`/`id`, `autocomplete`),
  then classify each field into a role (name / email / phone / password / employee_id / none)
  using conservative rules — no logging of PII values. Show a per-category checklist + total in
  the popup (expected on the demo form: 5 sensitive — name, email, phone, employee id, password;
  no false positives on destination/purpose). Add tests. Do NOT redact yet (Phase 3). Do NOT send
  anything to a server.

LAST UPDATED:
2026-09-10 — end of Phase 1.

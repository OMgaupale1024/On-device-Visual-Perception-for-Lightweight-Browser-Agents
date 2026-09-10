# Phase 7 plan — safe, visually grounded browser execution

Baseline: 46a8ac8 (feat: switch AI planner to NVIDIA NIM); main clean and synchronized.
Phase 6B is code-complete on NVIDIA NIM; the integrated real-provider smoke and Chrome
AI-mode run remain pending (no `NVIDIA_API_KEY` in the coding shell). Phase 7 does not
depend on a live key: it executes an already-validated planner decision.

Goal: take a validated `CLICK visual_N` and safely perform ONE browser click using the
LOCAL bounding box produced by pixel perception for the SAME observation. The server
chooses WHAT to click; the browser decides WHERE and HOW. No re-observation (Phase 8),
no metrics, no Pi, no new providers, no VLM/image upload.

## Core security principle

The server may return only `CLICK visual_N` / `STOP`. It must NEVER supply a selector,
XPath, JavaScript, DOM query, coordinates, element HTML, event code, URL or command.
The browser already holds `visual_N` geometry locally and resolves everything locally.

## Design (smallest stable)

1. `extension/src/actions/geometry.js` — pure math, unit-testable in Node.
   - `toViewportPoint(bbox, screenshot, viewport)`: screenshot-pixel bbox center →
     CSS viewport point. `scaleX = viewport.width / screenshot.width` (and Y). No
     `devicePixelRatio === 1` assumption. Rejects non-finite / non-positive dimensions
     (`INVALID_GEOMETRY`) and out-of-viewport centers (`OUT_OF_VIEWPORT`); clamps only
     sub-pixel edge noise.
   - `overlapsSensitive(bbox, regions)`: blocks a target that overlaps a redacted
     sensitive region ≥ 25% of its area (both screenshot pixels).
2. `extension/src/actions/execute-click.js` — local execution policy + injected click.
   - `ticketForPlan(plan, context, local)`: mints a ticket ONLY for a validated CLICK
     whose `observationId` matches the local context and whose target exists in
     `visualElements`. STOP / mismatch / unknown target → no ticket. Defence in depth
     beyond the transport validator.
   - `createTicket` / `executeTicket`: LOCAL-only, single-use capability. Gates in
     order: consumed/absent → `ACTION_ALREADY_CONSUMED`; TTL (60s) → `STALE_OBSERVATION`;
     tab exists + is active/current window → `TAB_CHANGED`; URL unchanged → `PAGE_CHANGED`;
     geometry → `INVALID_GEOMETRY`/`OUT_OF_VIEWPORT`; sensitive overlap → `SENSITIVE_REGION`.
     Then it CONSUMES the ticket and dispatches ONE `chrome.scripting.executeScript`
     pinned to the observed `documentId` (a navigated-away document rejects → `PAGE_CHANGED`).
   - `clickInPage(x, y, expectedViewport, targetText)`: SERIALIZED into the page (no
     imports/closures). Re-checks the viewport (resize → `PAGE_CHANGED`), runs
     `document.elementFromPoint`, walks up ≤6 ancestors to a supported control, validates
     (connected, not `disabled`/`aria-disabled`, non-zero rect, visible, point inside
     rect, not covered by an unrelated element, lenient OCR-text consistency) and performs
     exactly one `element.click()`.
3. `service-worker.js` — holds one module-scope `pendingAction`. A new analysis sets it
   to `null` first, then mints it after a validated CLICK. Handles `EXECUTE_ACTION`.
4. popup — one explicit `EXECUTE SUGGESTED ACTION` button and an Action panel. Presentation
   only; the ticket and all geometry stay in the worker.

## Allowed clickable controls (small allowlist)

`button`, `input[type="button"]`, `input[type="submit"]`, `[role="button"]`. No generic
"has a click listener" rule; a random `div` is rejected.

## Ticket lifecycle

LOCAL only — never sent to NVIDIA or FastAPI, never persisted. Single-use: consumed on
the one dispatch. Invalidated by a new analysis, by consumption, or by a worker teardown
(fail-closed → re-analyze). TTL 60s aligns with the popup's local-preview lifetime.

## What Phase 7 does NOT do

No re-capture, no OCR of the result, no success verification, no typing/navigation/scroll/
downloads/multiple actions. After the click the UI reports only "CLICK DISPATCHED" — task
success is a Phase 8 concern.

## Manual verification

Deterministic mode is sufficient to isolate Phase 7 execution; NVIDIA AI mode is preferred
when a key is available. Positive demo: Analyze/Plan on the Employee Travel Request →
`CLICK Continue` → press Execute → real Continue button clicked → page shows "Travel
Request Submitted" (NOT verified by Phase 7). Negative demo: Analyze/Plan, switch tab or
change the page, press Execute → BLOCKED / analyze again, no click.

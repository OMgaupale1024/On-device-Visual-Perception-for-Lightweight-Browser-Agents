# EdgeSight — Decisions

Chronological record of significant technical decisions.

---

## D1 — Chrome Manifest V3 extension for the prototype

**Decision:** Build the client as a Chrome MV3 extension.
**Reason:** The problem statement is on-device perception for *browser* agents.
Browser-side execution is the whole point and lets us sanitize locally before any
server contact.
**Alternatives considered:** Bookmarklet; separate desktop app driving a browser;
Playwright script.
**Why rejected:** Bookmarklet can't hold background/service-worker structure cleanly;
desktop/Playwright moves work off the browser and weakens the "on-device in the browser"
story. Firefox/multi-browser is explicitly out of prototype scope.
**Consequences:** MV3 service-worker constraints (no long-lived background page); popup ↔
content ↔ background messaging needed.

## D2 — FastAPI planner, deterministic first, LLM optional

**Decision:** Python + FastAPI server exposing a `PlannerInterface` with `LocalPlanner`
(deterministic/mock) as the default; `LLMPlanner` optional and later.
**Reason:** The demo must be reliable and offline-capable; it must not hinge on an
external API being reachable/authenticated during judging.
**Alternatives considered:** Node/Express; go straight to an LLM planner.
**Why rejected:** Python is already available (3.10.11) and matches the interface split
cleanly; an LLM-only path adds a network + key dependency and a failure mode on the
critical demo path.
**Consequences:** Deterministic rules must be good enough to drive the demo (form filled →
CLICK Continue). LLM is a bonus, gated behind `PLANNER_MODE=llm`.

## D3 — Sanitize-before-send + outbound privacy guard

**Decision:** Detection and redaction happen in the extension; a privacy guard scans every
outbound payload for known raw sensitive values and blocks the request if any is found.
**Reason:** "Raw PII never leaves the device" is the headline claim. A guard makes it
*provable* (Raw PII transmitted = 0), not just asserted.
**Alternatives considered:** Redact on the server; trust the sanitizer without a guard.
**Why rejected:** Server-side redaction means raw PII already left the device — fails the
core principle. Trusting the sanitizer with no guard has no safety net if a field is missed.
**Consequences:** The guard needs the set of known raw values to scan against, held only
in-browser and never logged.

## D4 — Stable internal element IDs, not raw selectors, to the planner

**Decision:** Sanitized state references elements by internal IDs (`field_1`, `action_1`);
the planner acts on IDs; the extension resolves IDs → elements locally.
**Reason:** Keeps CSS/XPath internals out of outbound data and makes actions robust and
auditable.
**Alternatives considered:** Send CSS selectors/XPath to the planner.
**Why rejected:** Leaks page structure and invites arbitrary-selector actions; harder to
validate safely.
**Consequences:** The extension maintains an ID→element map per observation; must be
regenerated on re-observation.

## D5 — Strict action schema, no eval

**Decision:** Validate every planner response against a fixed allow-list of actions
(`CLICK/TYPE/SCROLL/PRESS/WAIT/STOP`); reject anything else. Never `eval` or execute
server-supplied JavaScript.
**Reason:** The planner (especially an LLM) is untrusted input crossing into page execution.
**Consequences:** Adding a new action type is a deliberate schema change, not an accident.

## D6 — Real files only in Phase 0; no empty scaffold tree

**Decision:** Create only files with real content in Phase 0. Document the full intended
directory tree in ARCHITECTURE.md; create deeper folders when a phase first fills them.
**Reason:** Git can't track empty directories, and `.gitkeep` litter across a dozen
speculative folders is exactly the scaffolding-for-later we want to avoid. Top-level stub
READMEs give a visible map without the clutter.
**Alternatives considered:** Create the whole `src/{popup,content,...}` tree now with
`.gitkeep`.
**Why rejected:** Adds noise, no behavior, and misrepresents progress.
**Consequences:** Reviewers rely on ARCHITECTURE.md for the map until code lands.

## D7 — Local git init now; GitHub push deferred

**Decision:** `git init` and commit locally in Phase 0. Do not create a GitHub repo or
push automatically.
**Reason:** `gh` is unauthenticated and no remote exists. Creating a remote and pushing is
outward-facing and needs the owner's explicit action/login. A local commit still gives the
recoverable checkpoint and a real hash.
**Consequences:** Push is a tracked blocker (see PROGRESS/HANDOFF) resolved by
`gh auth login` or a provided remote URL. *(Resolved 2026-09-09: remote added, pushed.)*

## D8 — Hybrid local perception (DOM + pixels), not DOM-only

**Decision:** EdgeSight perceives through two on-device channels — a DOM/semantic channel
and a visual/pixel channel (screenshot of the visible tab) — merged into one sanitized state.
Phase 1 establishes the **visual input pipeline** (local `captureVisibleTab`); vision ML
(OCR/CV/face) is deferred to Phase 9.
**Reason:** The problem statement is on-device *visual* perception. A DOM-only system would
miss the point and fail to perceive rendered text, canvas/image content, and visual layout.
DOM still earns its place: it makes privacy detection and semantic grounding reliable.
**Alternatives considered:** DOM-only observation; screenshot-only perception.
**Why rejected:** DOM-only isn't "visual perception" and can't read pixels; screenshot-only
throws away the cheap, reliable semantic signal that makes privacy detection accurate.
**Consequences:** We must capture pixels locally now and keep them local (no transmission,
in-memory only). Real visual understanding is future work and must be described honestly as
not-yet-implemented until Phase 9.

## D9 — Observe via programmatic injection (activeTab + scripting), not a persistent content script

**Decision:** Read the DOM by injecting a self-contained function with
`chrome.scripting.executeScript({ func })` on user gesture, authorized by `activeTab`.
No declarative `content_scripts`, no `host_permissions`, no `tabs` permission.
**Reason:** Minimum permissions. A persistent content script needs match patterns / broad
host access; programmatic injection under `activeTab` touches the page only when the user
clicks ANALYZE, and returns its result directly (no extra message plumbing to the page).
**Alternatives considered:** Declarative content script + `tabs.sendMessage`; `<all_urls>` host permission.
**Why rejected:** Both request far more standing access than a click-to-analyze prototype needs.
**Consequences:** The injected function must be fully self-contained (it is serialized and
run in the page, so it can't close over module-scope helpers). `file://` demo pages require
the user to enable "Allow access to file URLs" for the extension (documented in HANDOFF).

## D10 — Measure screenshot dimensions in the service worker; don't ship pixels to the popup

**Decision:** The background worker decodes the capture with `createImageBitmap` to read real
width/height, then drops the image. Only dimensions (not the image) go to the popup.
**Reason:** Keeps the screenshot in memory and local; avoids sending a multi-MB data URL across
the message channel just to prove capture worked. Matches "keep it local, drop when done."
**Alternatives considered:** Send the data URL to the popup and measure with `new Image()`
(also enables a preview).
**Why rejected:** Heavier payload and weaker privacy story for Phase 1. A small preview is an
easy, optional future add if a phase needs it.
**Consequences:** No in-popup screenshot preview in Phase 1 (proof is "Ready" + real resolution).

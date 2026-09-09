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
`gh auth login` or a provided remote URL.

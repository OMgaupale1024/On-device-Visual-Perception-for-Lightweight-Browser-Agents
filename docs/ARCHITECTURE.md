# EdgeSight — Architecture

## Project goal

Give lightweight browser agents the page understanding they need **without** exposing
the user's sensitive data. All perception and privacy work happens on-device (in the
Chrome extension); only a sanitized, structured representation of the page leaves the
browser.

## Problem statement

**SIH26171 — On-device Visual Perception for Light-weight Browser Agents**
(ISRO · Software · Smart Automation). Browser agents typically send raw page content
(DOM text, form values, screenshots) to a remote model. That leaks PII and credentials.
EdgeSight moves perception + privacy to the edge (the browser), so the remote planner
sees only what it needs.

## Core principle

> **Raw sensitive information must never reach the server.**

The agent needs *structure and status* ("an email field exists and is filled"), not the
raw value. An outbound **privacy guard** enforces this: before any payload leaves the
browser, it is scanned for known raw sensitive values; if any is present, the request is
**blocked** with an explicit privacy error — the network layer never sees an unsafe payload.

## Hybrid local perception (DOM + pixels)

EdgeSight perceives each page through **two local channels**, not DOM alone. This is core
to the problem statement ("on-device *visual* perception") — EdgeSight must not collapse
into a DOM-only automation tool.

- **DOM / semantic channel** — element roles, input `type`s, labels, `name`s,
  `autocomplete` hints, visible controls, and bounding rectangles where useful. This
  channel makes privacy detection and semantic grounding reliable.
- **Visual / pixel channel** — a screenshot of the currently visible tab (the actual
  pixels the user sees), captured locally via `chrome.tabs.captureVisibleTab`. Later phases
  process it on-device (OCR / CV / vision inference) to perceive what the DOM cannot express:
  rendered text, canvas/image content, visual layout, overlays.

Both channels are captured and processed **on-device**, then merged into one sanitized
structured UI state. The DOM is an *assist* for privacy and grounding; the visual channel
is the actual screen perception. **The DOM is not the whole perception engine.**

> **Honesty note (current state):** the *visual input pipeline* exists (Phase 1) — the extension
> captures the visible tab locally and reports its real pixel dimensions — and local
> sensitive-field **detection** is implemented (Phase 2). **No OCR / CV / vision model is
> implemented yet; on-device visual perception is the core Phase 4** (see DECISIONS D11). The
> screenshot is handled in memory, never stored, and never transmitted.

## High-level architecture

```
                        ┌──────────────── Browser (on-device) ────────────────┐
 user clicks ANALYZE ──►│  Popup ──► Background (service worker / orchestrator)│
                        │                │                                     │
                        │   ┌────────────┴─────────────┐                       │
                        │   ▼                           ▼                       │
                        │  inject observer            captureVisibleTab        │
                        │  (activeTab + scripting)     (activeTab)              │
                        │   │  DOM / semantic            │  pixels              │
                        │   └───────────┬───────────────┘                       │
                        │               ▼                                       │
                        │      Local perception  (DOM + visual channels)        │
                        │               ▼                                       │
                        │   Privacy engine: detect · redact · PRIVACY GUARD     │
                        │               ▼                                       │
                        │   sanitized structured UI state ─ guard ─► network ───┼──► Planner
                        └───────────────────────────────────────────────────────┘   (FastAPI)
```

## Component responsibilities

| Component | Responsibility | Phase |
|-----------|----------------|-------|
| **Popup** | Goal input, ANALYZE button, status + observation / sensitive / visual results | 1, 2, 10 |
| **Background service worker** | Orchestrate a run: query active tab, inject the observer, run detection, `captureVisibleTab`, combine, reply to popup; later the (sanitized) planner request | 1, 2, 6 |
| **Observer (injected)** | Read the live DOM on demand (title, visible inputs/buttons/labels, viewport, per-field signals); later builds the field/action list with stable IDs | 1, 2, 5 |
| **Visual capture → perception** | Grab the visible-tab pixels locally (Phase 1); on-device OCR/CV over them is **core Phase 4** | 1, 4 |
| **Privacy engine** | Detect sensitive fields (implemented, Phase 2); redact values + outbound privacy guard (Phase 3) | 2, 3 |
| **Actions** | Resolve internal IDs → elements; perform CLICK/TYPE/… safely | 7 |
| **Planner server** | Given goal + sanitized state, return the next structured action | 6 |

## Data flow

1. User enters a goal in the popup and clicks **ANALYZE PAGE**.
2. Popup sends one message to the **background** service worker.
3. Background queries the active tab and **injects the observer** (`chrome.scripting`,
   authorized by `activeTab`) to read the DOM.
4. Background **captures the visible tab** pixels (`captureVisibleTab`) and measures real
   dimensions locally (`createImageBitmap`), then drops the image.
5. Background returns the combined DOM + visual result to the popup, which renders it.
6. *(Phase 2, done)* The privacy engine **detects** sensitive fields from structural signals
   (a role per field); *(Phase 3)* it **redacts** values.
7. *(Phase 4, core)* On-device **visual perception** (OCR/CV) enriches understanding from the
   screenshot; *(Phase 5)* perception assembles the **sanitized structured UI state** with stable
   IDs (`field_1`, `action_1`), merging DOM + visual.
8. *(Phase 3)* The **privacy guard** scans the outbound payload; if clean, it goes to the planner.
9. *(Phase 6)* Planner returns a **structured action** (e.g. `{ "action": "CLICK", "target": "action_1" }`);
   *(Phase 7)* it is **validated against a strict schema**, then executed in the page.
10. *(Phase 8)* EdgeSight **re-observes**, rebuilds state, and **verifies** the result. Continue or stop.

## Privacy flow

```
field value ──► detect (type/label/name/autocomplete/pattern) ──► sensitive?
   ├─ yes ──► redact to [ROLE]  (value never leaves browser)
   └─ no  ──► keep usable value (e.g. "Bengaluru")
                                   │
                       build sanitized payload
                                   │
                       PRIVACY GUARD: scan for any known raw value
                          ├─ found  ──► BLOCK + explicit error (no network call)
                          └─ clean  ──► send to planner
```

The visual channel is subject to the same rule: any on-device visual processing (future)
must redact sensitive regions (e.g. faces, rendered PII) before anything derived from the
pixels could leave the browser. The raw screenshot itself is never transmitted.

## Browser action flow

- Planner returns one action referencing an **internal ID** (`action_1`), not a raw CSS/XPath.
- The extension resolves the ID to the real element from its own perception map.
- Allowed actions: `CLICK`, `TYPE`, `SCROLL`, `PRESS`, `WAIT`, `STOP`. CLICK is implemented first.
- **Security:** planner output is validated against a strict schema. Unknown action → rejected.
  Never `eval`, never execute server-supplied JavaScript.

## Server architecture

- Python + FastAPI. Small and stateless.
- `PlannerInterface` with two implementations:
  - `LocalPlanner` — deterministic/mock, the default for the prototype.
  - `LLMPlanner` — optional, one provider, key from server env only. Added only if time allows.
- Receives **sanitized** state only. Returns a schema-valid action.

## Important interfaces (planned shapes)

**Phase 1 analysis result (background → popup):**
```json
{
  "ok": true,
  "observation": {
    "title": "Employee Travel Request",
    "counts": { "inputs": 7, "buttons": 1, "labels": 7 },
    "viewport": { "width": 1280, "height": 720 },
    "devicePixelRatio": 1
  },
  "capture": { "ok": true, "width": 1280, "height": 720 }
}
```

**Sanitized UI state (browser → server, Phase 4+):**
```json
{
  "page": { "title": "Employee Travel Request" },
  "fields": [
    { "id": "field_1", "role": "name",  "sensitive": true,  "value": "[REDACTED]", "filled": true },
    { "id": "field_3", "role": "destination", "sensitive": false, "value": "Bengaluru", "filled": true }
  ],
  "actions": [ { "id": "action_1", "role": "button", "label": "Continue" } ]
}
```

**Planner response (server → browser, Phase 5+):**
```json
{ "action": "CLICK", "target": "action_1" }
```

## Extension internals (Phase 1)

- **Permissions:** `activeTab` (temporary access to the current tab's DOM + pixels, only on
  user gesture) and `scripting` (to inject the observer). No broad `host_permissions`, no `tabs`.
- **Observation** uses **programmatic injection** (`chrome.scripting.executeScript({ func })`)
  rather than a persistent declarative content script, so no host-match permissions are needed.
- **Message flow:** `popup → background (ANALYZE_PAGE) → [inject observer + captureVisibleTab] → popup`.
  Message-type constants live in `extension/src/shared/messages.js`.

## Intended directory tree

Created phase by phase (git can't track empty dirs, so folders appear when first filled):

```
EdgeSight/
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── popup/          # popup UI (html/css/js)
│   │   ├── background/     # service worker / orchestrator
│   │   ├── content/        # injected DOM observer
│   │   ├── perception/     # visual perception + DOM→field/action model (Phase 4–5)
│   │   ├── privacy/        # detect.js done (Phase 2); redaction + guard (Phase 3)
│   │   ├── actions/        # action executors                   (Phase 7)
│   │   └── shared/         # message types, schemas, constants
│   └── public/             # optional static assets
├── server/                 # FastAPI planner                    (Phase 5)
├── demo-page/              # index.html / style.css / script.js (FAKE data)
└── docs/
```

## Why the major decisions were taken

See [`DECISIONS.md`](DECISIONS.md). In short: MV3 extension because browser-side execution
is the point; **hybrid DOM + visual perception** because the problem statement is on-device
*visual* perception, not DOM scraping; deterministic planner first to avoid an external-API
dependency on the demo path; sanitize-before-send + outbound guard because "raw PII never
leaves the device" is the headline claim we must be able to prove.

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

## High-level architecture

```
┌───────────────────────── Browser (on-device) ─────────────────────────┐
│                                                                        │
│  Popup (UI)        Content script (page access)     Background (SW)    │
│  ─ goal input      ─ observe DOM                     ─ message router   │
│  ─ status/metrics  ─ execute validated actions       ─ planner fetch    │
│        │                    │                              │            │
│        └──────────┬─────────┴──────────────┬───────────────┘            │
│                   ▼                         ▼                            │
│            Perception engine         Privacy engine                     │
│            ─ enumerate fields        ─ detect sensitive fields          │
│            ─ enumerate actions       ─ redact values                    │
│            ─ build UI state          ─ PRIVACY GUARD (outbound scan)    │
│                             │                                           │
│                             ▼                                           │
│                  Sanitized structured UI state ── guard ──►  network    │
└────────────────────────────────────────────────────────────│──────────┘
                                                               ▼
                                              ┌──────────────────────────┐
                                              │  Planner server (FastAPI) │
                                              │  ─ LocalPlanner (mock)    │
                                              │  ─ LLMPlanner (optional)  │
                                              │  returns validated action │
                                              └──────────────────────────┘
```

## Component responsibilities

| Component | Responsibility | Phase |
|-----------|----------------|-------|
| **Popup** | Goal input, run button, privacy/agent/metrics display | 1, 10 |
| **Content script** | Read the live page (fields, buttons, labels); execute validated actions | 1, 6 |
| **Background service worker** | Route messages popup↔content; make the (sanitized) planner request | 1, 5 |
| **Perception engine** | Turn the DOM into a field/action list with stable internal IDs | 1, 4 |
| **Privacy engine** | Detect sensitive fields; redact values; run the outbound privacy guard | 2, 3 |
| **Actions** | Resolve internal IDs → elements; perform CLICK/TYPE/… safely | 6 |
| **Planner server** | Given goal + sanitized state, return the next structured action | 5 |

## Data flow

1. User enters a goal in the popup and clicks run.
2. Content script **observes** the current page.
3. Perception builds a field/action list with **stable internal IDs** (`field_1`, `action_1`).
4. Privacy engine **detects** sensitive fields and **redacts** their values.
5. A **sanitized structured UI state** is produced.
6. The **privacy guard** scans the outbound payload; if clean, it goes to the planner.
7. Planner returns a **structured action** (e.g. `{ "action": "CLICK", "target": "action_1" }`).
8. Action is **validated against a strict schema**, then executed in the page.
9. EdgeSight **re-observes**, builds a new state, and **verifies** the expected result.
10. Continue or stop.

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

**Sanitized UI state (browser → server):**
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

**Planner response (server → browser):**
```json
{ "action": "CLICK", "target": "action_1" }
```

## Intended directory tree

Created phase by phase (git can't track empty dirs, so folders appear when first filled):

```
EdgeSight/
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── popup/          # popup UI
│   │   ├── content/        # page observation + action execution
│   │   ├── background/     # service worker / message routing
│   │   ├── perception/     # DOM → field/action model
│   │   ├── privacy/        # detection, redaction, privacy guard
│   │   ├── actions/        # action executors
│   │   └── shared/         # schemas, constants
│   └── public/
├── server/
│   ├── app/                # FastAPI app + planners
│   ├── tests/
│   └── requirements.txt
├── demo-page/              # index.html / style.css / script.js (FAKE data)
└── docs/
```

## Why the major decisions were taken

See [`DECISIONS.md`](DECISIONS.md). In short: MV3 extension because browser-side execution
is the point; deterministic planner first to avoid an external-API dependency on the demo
path; sanitize-before-send + outbound guard because "raw PII never leaves the device" is
the headline claim we must be able to prove.

# EdgeSight — Testing

Test log. One row per check. Do not claim something works without testing it.
No application code exists yet (Phase 0), so this phase records **foundation
verification only** — real automated tests start in Phase 1+.

## Phase 0 — foundation verification

| # | Test | Purpose | Input | Expected | Actual | Result |
|---|------|---------|-------|----------|--------|--------|
| 0.1 | Git available | Can we version-control | `git --version` | git present | git 2.51.0.windows.2 | PASS |
| 0.2 | Node available | For extension tooling later | `node --version` | Node present | v24.11.0 | PASS |
| 0.3 | Python available | For planner server later | `python --version` | Python 3.10+ | 3.10.11 | PASS |
| 0.4 | gh CLI available | For GitHub push | `gh --version` | gh present | 2.97.0 | PASS |
| 0.5 | gh authenticated | Needed to push | `gh auth status` | logged in | NOT logged in | FAIL (blocker) |
| 0.6 | Repo init | Establish `main` | `git init -b main` | repo on `main` | initialized, on `main` | PASS |
| 0.7 | `.remember/` ignored | Keep harness tooling out of repo | `git status` | `.remember/` not listed | not listed | PASS |

## Known limitations (Phase 0)

- No runtime/application tests yet — nothing executable exists beyond the scaffold.
- Push to GitHub not verified: blocked on `gh` authentication / missing remote (test 0.5).

## Phase 1 — extension, demo page, visual capture (2026-09-10)

Verified in a real browser via Chrome automation against the demo page, served locally on
`127.0.0.1:8137` **for the test only** (a throwaway static server — not part of EdgeSight,
not committed). Test 1.4–1.9 ran the **exact** observer code from
`extension/src/content/observe.js`.

| # | Test | Purpose | Input | Expected | Actual | Result |
|---|------|---------|-------|----------|--------|--------|
| 1.1 | manifest valid JSON | loads without parse error | `manifest.json` | parses | parsed OK | PASS |
| 1.2 | JS modules parse | no syntax errors | 4 ESM files | `node --check` clean | all clean | PASS |
| 1.3 | demo renders | believable form | open demo page | form visible, title set | rendered, title "Employee Travel Request" | PASS |
| 1.4 | observer inputs | count visible inputs | demo DOM | 7 | 7 | PASS |
| 1.5 | observer buttons | count visible buttons | demo DOM | 1 | 1 | PASS |
| 1.6 | observer labels | count visible labels | demo DOM | 7 | 7 | PASS |
| 1.7 | field semantics | correct input types | demo DOM | email=email, phone=tel, 1 password field | confirmed (password introspection is harness-redacted; count===1 proven via passing conjunct) | PASS |
| 1.8 | purpose default | select default value | demo DOM | "Conference" | "Conference" | PASS |
| 1.9 | Continue → success | observable "after" state | click Continue | form hidden, success shown, title="Travel Request Submitted" | all true | PASS |

### Requires MANUAL verification (cannot be automated here)

The extension load + popup + `captureVisibleTab` cannot be driven by the automation harness
(chrome://extensions is restricted, loading unpacked needs a native file dialog, and the
harness blocks `file://` navigation). Verify by hand:

| # | Manual test | Expected | Status |
|---|-------------|----------|--------|
| M1 | Extension loads (chrome://extensions → Developer mode → Load unpacked → `extension/`) | loads, no manifest errors | ✅ Verified 2026-09-10 (by user) |
| M2 | Popup opens (click toolbar icon) | title, goal box, ANALYZE PAGE, "Ready" | ✅ Verified 2026-09-10 (by user) |
| M3 | Analyze demo (ANALYZE PAGE on demo page) | element counts returned and displayed | ✅ Verified 2026-09-10 (by user) |
| M4 | Visual capture (same run) | Screen capture: Ready; real resolution shown | ✅ Verified 2026-09-10 (by user) |
| M5 | No network (DevTools → Network during a run) | zero requests from EdgeSight | ⏳ Not yet verified |
| M6 | Restricted page (ANALYZE on a chrome:// page) | graceful error, no crash | ⏳ Not yet verified |
| M7 | Re-run (click ANALYZE twice) | second run works, state not broken | ⏳ Not yet verified |
| M8 | file:// access toggle (if M3 errors, enable "Allow access to file URLs", retry) | analysis works | ⏳ Not yet verified |

> Recorded honestly: the user confirmed M1–M4 (loads, popup, analyze returns counts, capture
> Ready + real resolution). M5–M8 were not reported, so they remain unverified — not claimed.

> M4 note: `captureVisibleTab` returns **device-pixel** dimensions of the visible viewport, so
> on a HiDPI display they exceed CSS `innerWidth/innerHeight` (the test machine reported a
> 2519×1245 CSS viewport). Both are real measurements, not hardcoded.

## Phase 2 — local sensitive-data detection (2026-09-10)

Detection is pure (`extension/src/privacy/detect.js`), so it is unit-tested in Node with no
browser, plus a live-DOM run of the full observe→detect pipeline on the demo page.

### Node unit tests — `node extension/tests/detect.test.mjs` (7/7 PASS)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | demo roles | name / email / phone / employee_id / other / other / password | PASS |
| 2.2 | sensitive total | exactly 5 (name, email, phone, password, employee_id) | PASS |
| 2.3 | false positives | username, nickname, file name, screen name, destination, purpose, company, search → other | PASS |
| 2.4 | name variants | "Full Name" / "First Name" / "Name" / autocomplete given-name → name | PASS |
| 2.5 | ignores values | a field whose *value* looks like PII stays "other" (classifies signals, not values) | PASS |
| 2.6 | serialization / leak | with raw values injected onto signals, output JSON contains none of them; keys = {id,label,role,sensitive} | PASS |
| 2.7 | empty input | `undefined` / `[]` / `{}` handled | PASS |

### Live demo DOM (Chrome automation; exact observe+detect logic on the local demo)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 2.8 | field signals | 7 | 7 | PASS |
| 2.9 | roles | field_1..7 = name, email, phone, employee_id, other, other, password | same | PASS |
| 2.10 | sensitive count | 5 | 5 | PASS |
| 2.11 | output keys | only {id, role, sensitive, label} | true | PASS |
| 2.12 | no value leak | none of the actual page values appear in output | 0 leaked (7 values checked) | PASS |

> The leak check read the 7 real field values **inside the page** (including the password) and
> confirmed none appear in the classified output; the values themselves were never returned.

## Planned tests (upcoming phases)

- **Phase 3:** privacy-guard unit test — a payload containing a known raw value is BLOCKED;
  a sanitized payload passes.
- **Phase 4:** sanitized state matches the documented schema; sensitive values are `[REDACTED]`.
- **Phase 5:** planner returns `CLICK action_1` for a filled form + "continue" goal.
- **Phase 6:** CLICK resolves `action_1` → the Continue button and clicks it; unknown action rejected.
- **Phase 7:** page change after CLICK is detected and verified as success.
- **Phase 8:** end-to-end latency + privacy counters recorded from real runs.

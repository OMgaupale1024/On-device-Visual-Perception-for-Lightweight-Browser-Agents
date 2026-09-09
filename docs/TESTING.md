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

| # | Manual test | Steps | Expected |
|---|-------------|-------|----------|
| M1 | Extension loads | chrome://extensions → Developer mode → Load unpacked → `extension/` | loads, no manifest errors |
| M2 | Popup opens | click the EdgeSight toolbar icon | title, goal box, ANALYZE PAGE, "Ready" |
| M3 | Analyze demo | open `demo-page/index.html`, click ANALYZE PAGE | Inputs 7, Buttons 1, Visible labels 7 |
| M4 | Visual capture | same run | Screen capture: Ready; Resolution: real W×H |
| M5 | No network | DevTools → Network during a run | zero requests from EdgeSight |
| M6 | Restricted page | run ANALYZE on a chrome:// page | graceful error message, no crash |
| M7 | Re-run | click ANALYZE twice | second run works, state not broken |
| M8 | file:// access | if M3 errors, enable "Allow access to file URLs" for EdgeSight, retry | analysis works |

> M4 note: `captureVisibleTab` returns **device-pixel** dimensions of the visible viewport, so
> on a HiDPI display they exceed CSS `innerWidth/innerHeight` (the test machine reported a
> 2519×1245 CSS viewport). Both are real measurements, not hardcoded.

## Planned tests (upcoming phases)

- **Phase 2:** all five sensitive fields detected on the demo form; no false positives on
  destination/purpose.
- **Phase 3:** privacy-guard unit test — a payload containing a known raw value is BLOCKED;
  a sanitized payload passes.
- **Phase 4:** sanitized state matches the documented schema; sensitive values are `[REDACTED]`.
- **Phase 5:** planner returns `CLICK action_1` for a filled form + "continue" goal.
- **Phase 6:** CLICK resolves `action_1` → the Continue button and clicks it; unknown action rejected.
- **Phase 7:** page change after CLICK is detected and verified as success.
- **Phase 8:** end-to-end latency + privacy counters recorded from real runs.

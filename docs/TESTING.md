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

## Planned tests (upcoming phases)

- **Phase 1:** ANALYZE PAGE returns correct counts of inputs/buttons/labels on the demo page.
- **Phase 2:** all five sensitive fields detected on the demo form; no false positives on
  destination/purpose.
- **Phase 3:** privacy-guard unit test — a payload containing a known raw value is BLOCKED;
  a sanitized payload passes.
- **Phase 4:** sanitized state matches the documented schema; sensitive values are `[REDACTED]`.
- **Phase 5:** planner returns `CLICK action_1` for a filled form + "continue" goal.
- **Phase 6:** CLICK resolves `action_1` → the Continue button and clicks it; unknown action rejected.
- **Phase 7:** page change after CLICK is detected and verified as success.
- **Phase 8:** end-to-end latency + privacy counters recorded from real runs.

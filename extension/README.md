# extension/

Chrome **Manifest V3** extension — the on-device client. Observes the page, detects and
redacts sensitive data locally, runs the outbound privacy guard, talks to the planner, and
executes validated actions.

**Current (Phase 1):** DOM observation + local visible-tab capture; the popup shows real
element counts and capture resolution. Detection, redaction, privacy guard, planner, and
action execution arrive in later phases.

Load via `chrome://extensions` → Developer mode → Load unpacked → this folder, then click the
toolbar icon → **ANALYZE PAGE**. Layout + flow: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

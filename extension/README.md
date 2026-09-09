# extension/

Chrome **Manifest V3** extension — the on-device client. Observes the page, detects and
redacts sensitive data locally, runs the outbound privacy guard, talks to the planner, and
executes validated actions.

**Current (Phase 2):** DOM observation + local visible-tab capture + on-device sensitive-field
detection; the popup shows counts, a sensitive checklist + total, and capture resolution.
Redaction, privacy guard, visual perception, planner, and action execution arrive in later phases.

Load via `chrome://extensions` → Developer mode → Load unpacked → this folder, then click the
toolbar icon → **ANALYZE PAGE**. Layout + flow: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

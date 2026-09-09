# EdgeSight extension

Chrome MV3 Phase 3: local DOM observation, signal-only detection, visible-tab capture,
Canvas redaction, semantic sanitization and outbound privacy guard. No network transport,
planner, OCR/CV model or action execution.

Load unpacked this folder at chrome://extensions. Enable Allow access to file URLs,
open the local demo and ANALYZE PAGE. Expand Compare local previews. Both remain local;
password regions are masked even in the original. Images expire after 60 seconds.
Chrome visual checks remain UNVERIFIED.

Run `node --test extension/tests/*.test.mjs` from the repository root.
See [Architecture](../docs/ARCHITECTURE.md) and [Testing](../docs/TESTING.md).

# EdgeSight

**Privacy-preserving on-device perception layer for lightweight browser agents.**

Smart India Hackathon 2026 · SIH26171 · ISRO · Software · Smart Automation.

**Phase 3 complete. Phase 4 not started.** EdgeSight captures the active viewport locally,
uses DOM geometry to mask sensitive fields with Canvas, sanitizes semantic context, and
guards a future outbound package. Chrome manual visual verification remains UNVERIFIED.

## Run locally

1. Load unpacked `extension/` at `chrome://extensions` in Developer mode.
2. Enable **Allow access to file URLs** for EdgeSight.
3. Open `demo-page/index.html` (Employee Travel Request, fake data only).
4. Keep all seven fields visible, open the popup, and click **ANALYZE PAGE**.
5. Expand **Compare local previews**: ORIGINAL → LOCAL PRIVACY FILTER → SANITIZED.

Expected demo: 7 inputs, 1 button, 7 labels; 5 sensitive fields and masks for Name,
Email, Phone, Employee ID and Password. Destination (Bengaluru) and Purpose (Conference)
remain visible. Actual Chrome results await [manual verification](docs/TESTING.md).

The ORIGINAL — LOCAL ONLY preview always hides the password region. The SANITIZED —
SAFE CONTEXT preview is scoped to detected visible DOM fields. Previews clear after
60 seconds, on re-analysis, or on popup close. Neither preview is transmitted.

## Privacy flow

```text
value-free observation + classifier → IDs + viewport CSS rectangles
local screenshot → actual-dimension scaling → Canvas masks → private sanitized-image handle
local temporary values → semantic placeholders → recursive privacy guard
sanitized-image handle + guarded semantics → frozen future outbound package
```

Raw screenshot strings and forged image handles cannot enter the package builder.
Sensitive semantics contain placeholders and filled status, never raw values.
Arbitrary labels/titles/text are omitted; unknown values are withheld. Only the narrow
Destination/Purpose demo vocabulary may retain values. The guard rejects known raw
sensitive strings anywhere in outgoing JSON keys or values. No package is sent.

There is no server, network transport, LLM, OCR, CV model, Raspberry Pi or autonomous
action. Extension CSP blocks network connections. Actual local visual perception over
captured pixels is **Phase 4**, not implemented yet. Current masking does not certify
arbitrary websites or recognize unknown PII in images, canvas, iframes or shadow DOM.

## Tests and documentation

Run `node --test extension/tests/*.test.mjs` (Node 24; no dependencies/server).
Node verifies logic and browser API doubles. A real Canvas pixel harness is supplied
as a local extension page; its execution and manual demo checks remain UNVERIFIED.

- `extension/`: MV3 client, permissions activeTab + scripting.
- `demo-page/`: fake-data form. `server/`: documentation only; planner is Phase 6.
- [Architecture](docs/ARCHITECTURE.md), [Progress](docs/PROGRESS.md),
  [Decisions](docs/DECISIONS.md), [Handoff](docs/HANDOFF.md), [Testing](docs/TESTING.md).

Roadmap: 0 foundation → 1 observation/capture → 2 detection → 3 redaction/guard (complete)
→ **4 core local visual perception** → 5 merged sanitized state → 6 planner → 7 safe actions
→ 8 re-observe/verify → 9 metrics → 10 polish.

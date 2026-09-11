# EdgeSight — AI Context

Fast-start context for Claude/Codex. Read this + `HANDOFF.md`, then `git status` and
`git log --oneline -10`, before touching code. **Code, tests and Git outrank docs.**
Detailed history is in `docs/archive/`; do not read it by default.

## Project
- **EdgeSight** — SIH26171 (ISRO), Smart India Hackathon 2026.
- On-device visual perception for lightweight, **privacy-preserving** browser agents.

## Product in one paragraph
EdgeSight turns a user goal into safe browser actions while keeping raw perception
on-device. It captures the visible tab, runs **local** OCR + DOM semantics, detects and
redacts PII locally, and freezes a privacy-approved **SafeAgentContext**. Only that
sanitized structured state crosses to a localhost FastAPI service, which plans either
**deterministically** (default) or via one **NVIDIA NIM (Nemotron)** call and returns
exactly ONE structured action. The browser re-validates the action and performs a single
guarded local click, then re-observes fresh pixels to verify the outcome locally. The
product is now evolving from this single-step demo into a full autonomous
**OBSERVE → PLAN → ACT → OBSERVE** loop.

## Current architecture
```
VOICE / TEXT GOAL              [PLANNED: voice; text = the current goal string]
      ↓
AGENT CONTROLLER  service-worker.js        [IMPLEMENTED single-step; loop PLANNED]
      ↓
BROWSER OBSERVATION  local-observation.js + content/observe.js   [IMPLEMENTED]
      ↓
LOCAL PERCEPTION  perception/* (Tesseract WASM OCR + semantics)  [IMPLEMENTED]
      ↓
LOCAL PRIVACY  privacy/* (detect → redact → guard)               [IMPLEMENTED]
      ↓
SAFE STATE  privacy/agent-context.js (frozen SafeAgentContext)   [IMPLEMENTED]
      ↓
PLANNER  localhost FastAPI → deterministic OR NVIDIA NIM         [IMPLEMENTED code;
                                                                  live AI run PENDING]
      ↓
VALIDATED ACTION  CLICK visual_N | STOP                          [IMPLEMENTED]
      ↓  (expanded NAVIGATE/TYPE/SCROLL/… vocabulary = PLANNED)
LOCAL EXECUTION  actions/{geometry,execute-click}.js (1 click)   [IMPLEMENTED]
      ↓
RE-OBSERVATION  verification/verify-*.js (fresh pixels, local)   [IMPLEMENTED]
      ↺  loop back to PLAN                                       [PLANNED]
```

## Current working capabilities (code-complete, Node/unit verified)
- Local screen capture → OCR + DOM semantics → PII detection → Canvas redaction →
  outbound privacy guard → frozen SafeAgentContext.
- FastAPI `/plan`: strict validation, deterministic planner, one NVIDIA NIM adapter
  (no fallback), server-owned observation binding, numeric Server-Timing headers.
- `actionCandidates` (Phase 10 groundwork): local geometry maps pixel-OCR text onto
  clickable DOM control regions so the planner may only `CLICK` a genuine target
  (e.g. "Continue"), never a label like "Password". Only safe visual ids cross the wire.
- Guarded single-use CLICK execution (bbox → viewport → elementFromPoint → allowlist).
- Fresh same-tab re-observation + local exact-phrase visual verification.
- Phase 9 controlled benchmarks (5 synthetic screens) + current-run timing panel.

## Current blocking issues
- **No manual Chrome acceptance has ever been observed** for phases 6B/7/8/9 (see
  Manual verification). Automated unit doubles are not acceptance.
- **crop-OCR refinement is ineffective in live Chrome** (committed, Node-green, but a
  styled "Continue" button still misread, e.g. `visual_17='Looe'@0.39`). Rework candidate.
- No `NVIDIA_API_KEY` in the working shell → the real AI planner path is unexercised here.

## Current task
Repository cleanup + documentation consolidation is **DONE** (this session). The next
development task is to begin the **autonomous OBSERVE → PLAN → ACT → OBSERVE loop**
(roadmap #1–2 below), building on the committed `actionCandidates` groundwork. Do NOT
start new agent features without reading `HANDOFF.md` first.

## Critical architecture decisions (do not break)
- **One privacy boundary out of the browser:** only the frozen builder-approved
  SafeAgentContext leaves; raw screenshots/OCR/DOM/secret lists never do.
- **Server never returns selectors, coordinates, screenshots or code** — only WHAT
  (`visual_N`) or `STOP`, plus fixed non-sensitive reason phrases. The browser resolves
  WHERE/HOW locally.
- **Deterministic is the default;** `ai` (NVIDIA) is explicit, bounded (15s/64KB), no
  tools/history/retries/fallback. This is an **LLM over sanitized structured context,
  not a VLM** — no images are sent.
- **CLICK execution** is one document-pinned, single-use `element.click()` bound to
  (observation, tab, window, document), 60s TTL. DOM text is an execution safety check
  only, never planner success evidence.
- **Semantic (DOM) and pixel (OCR) evidence stay separate.** Verification reruns the
  full local privacy pipeline on fresh pixels and returns only safe metadata.

## Privacy invariants (non-negotiable)
1. Raw screenshots, raw OCR, raw DOM and secret/known-value lists never cross the wire.
2. The final local known-value/context guard runs before anything leaves; the Phase 5
   builder freezes identity → exact safe JSON as the approval boundary.
3. The NVIDIA provider receives only goal + safe privacy flags + semantic roles/safe
   values + visual ids/text/confidence + redaction legend. Never images, geometry,
   observation ids, timestamps, field ids, extension id, env or debug data.
4. `NVIDIA_API_KEY` is server-side only; never in prompts, logs, the browser or chat.
   No `.env` auto-loader. `.env` is git-ignored (`.env.example` is the only template).
5. Verification makes zero network/provider calls and never returns pixels or page text.

## Important files (for the next task)
- `extension/src/background/service-worker.js` → controller; only place that mints a
  ticket and calls `requestPlan`. `background/local-observation.js` → shared observe
  (no planner/network). `content/observe.js` → DOM + control regions.
- `extension/src/privacy/agent-context.js` → builds/freezes SafeAgentContext + actionCandidates.
  Supporting: `privacy/{detect,collect,redact,guard,semantic,visual}.js`.
- `extension/src/actions/{geometry,execute-click}.js` → viewport mapping,
  `actionableVisualIds`, guarded single-use click.
- `extension/src/verification/{verify-after-click,verify-visual-result}.js` → fresh
  re-observation + phrase verification.
- `extension/src/perception/{pipeline,ocr,bridge,config}.js` → local OCR pipeline
  (incl. the crop-OCR refinement to revisit).
- `extension/src/transport/planner-client.js` → `POST /plan`. `shared/messages.js`,
  `manifest.json` (v0.9.0).
- `server/app/{ai_input,ai_contract,ai_planner,nvidia_provider,schemas,planner,main,config}.py`.

## Commands
```bash
npm test            # extension suite  (node --test) — 238 entries
npm run check       # syntax / manifest / packaged-asset integrity
npm run benchmark   # Phase 9 controlled benchmark (needs server venv)
# server tests (from server/):
.venv/Scripts/python.exe -m unittest discover -s tests   # 53 methods
# server run (from server/, deterministic):
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```
Full Windows setup (venv, extension origin, AI mode) is in `README.md` / `server/README.md`.

## Git state
- Branch `main`, synchronized with `origin/main`. Phase 9 baseline was `ead24d3`.
- `c3c494f` committed the Phase 10 WIP (actionCandidates + crop-OCR refinement).
- The current HEAD is the cleanup commit that contains this file — resolve with
  `git log -1 --format=%H` (a commit cannot embed its own hash).

## Manual verification
- **VERIFIED (user, Chrome):** Phase 6A — extension → `POST /plan` → FastAPI 200; 7 fields,
  5 sensitive/redacted, `rawPiiIncluded=false`, `privacy.status=safe`, 5 role placeholders,
  Bengaluru/Conference retained, deterministic planning. NVIDIA endpoint returns valid JSON
  (verified out of band).
- **PENDING (never observed):** Phase 6B integrated AI-mode run; Phase 7 positive click +
  stale/wrong-page negative; Phase 8 positive/negative visual verification; Phase 9 live
  Chrome timings + CPU/GPU/RAM. Prior Computer-Use attempts stopped on a URL-policy block.

## Known limitations
Heuristic, English-only OCR; styled buttons can misread. PII is scoped to detected/known
values; unknown/transformed secrets can escape. Single 750 ms post-click capture can miss
slow transitions (no retry). Cross-origin navigation can lose activeTab and fails closed.
Tab/capture checks are not atomic. Worker restart loses pending tickets/results. No general
automation, no additional provider, no Raspberry Pi.

## Exact next step
Begin roadmap #2 — a minimal autonomous controller loop (OBSERVE → PLAN → ACT →
re-OBSERVE → PLAN…) reusing the existing single-step pieces and `actionCandidates`, keeping
every privacy invariant and the server action contract intact. First confirm the NVIDIA
planner path end-to-end (roadmap #1).

## Remaining roadmap (not sacred — adjust to repo reality)
1. Verify the real NVIDIA Nemotron planner path end-to-end.
2. Autonomous controller loop: OBSERVE → PLAN → ACT → OBSERVE.
3. Expanded safe actions: NAVIGATE, CLICK, TYPE, TYPE_LOCAL_REF, PRESS_KEY, SCROLL, WAIT, STOP.
4. Browser navigation / new-tab control.
5. Autonomous form filling.
6. Voice + text sharing one goal pipeline.
7. Local private-value vault / reference mechanism.
8. Action policy / security layer.
9. Multi-step browser workflows.
10. Accuracy / privacy / resource / latency evaluation.
11. Final UX / polish.

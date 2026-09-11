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
autonomous **OBSERVE → PLAN → ACT → OBSERVE** loop remains planned; the current
acceptance gate is one live AI-generated CLICK against an approved candidate.

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
                                                                  live AI mode VERIFIED]
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
  Phase 11A verified (offline): in AI mode **Nemotron itself** chooses CLICK/STOP + target;
  the server only validates (target ∈ `actionCandidates`) and never substitutes a decision.
  AI failures surface a safe numeric `X-EdgeSight-Planner-Upstream-Status` header.
- `actionCandidates` (Phase 10 groundwork): local geometry maps pixel-OCR text onto
  clickable DOM control regions so the planner may only `CLICK` a genuine target
  (e.g. "Continue"), never a label like "Password". Only safe visual ids cross the wire.
  Fusion accepts OCR centre inside a control OR at least 50% OCR-area containment,
  after existing `mapRect` scaling and privacy filtering. Client response validation
  and ticket creation also require current candidate membership. Wire shape: string IDs.
- Guarded single-use CLICK execution (bbox → viewport → elementFromPoint → allowlist).
- Fresh same-tab re-observation + local exact-phrase visual verification.
- Phase 9 controlled benchmarks (5 synthetic screens) + current-run timing panel.

## Current blocking issues
- **Live candidate acceptance pending:** user confirmed AI mode at `b5bc9c5`, but
  `actionCandidates=[]` despite OCR controls. Generic fusion fix is automated-test
  verified; the user must reload Chrome and confirm a current button candidate + AI CLICK.
- Styled control OCR/refinement can still misread; this fix does not prove live OCR accuracy.
- Manual Phase 7 execution, Phase 8 visual verification and Phase 9 resource/timing
  acceptance remain pending. Automated unit doubles are not acceptance.

## Current task
Generic action-candidate fusion fix completed from Claude's interrupted working tree.
Stop for the user's manual Chrome ANALYZE / PLAN retest, **without Execute**. Do not
debug NVIDIA again or start the autonomous loop. Read `HANDOFF.md` for exact expectations.

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
npm test            # extension suite (node --test) — 247 entries
npm run build       # package pinned local OCR assets
npm run check       # syntax / manifest / packaged-asset integrity
npm run benchmark   # Phase 9 controlled benchmark (needs server venv)
# server tests (from server/):
.venv/Scripts/python.exe -m unittest discover -s tests   # 54 methods
# server run (from server/, deterministic):
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```
Full Windows setup (venv, extension origin, AI mode) is in `README.md` / `server/README.md`.

## Git state
- Branch `main`; recovered from `b5bc9c5` with three uncommitted Claude files preserved.
- The current HEAD is the candidate-grounding fix containing this file — resolve with
  `git log -1 --format=%H` (a commit cannot embed its own hash).

## Manual verification
- **VERIFIED (user, Chrome):** Phase 6A — extension → `POST /plan` → FastAPI 200; 7 fields,
  5 sensitive/redacted, `rawPiiIncluded=false`, `privacy.status=safe`, 5 role placeholders,
  Bengaluru/Conference retained, deterministic planning. NVIDIA endpoint returns valid JSON
  (verified out of band).
- **VERIFIED (offline, Phase 11A):** AI-mode planner path — deterministic live smoke PASS;
  AI mode with no key returns 503 `X-EdgeSight-Planner: ai` (fails closed, not deterministic);
  mock-transport tests prove Nemotron's decision is used and hallucinated / non-actionable
  targets are rejected.
- **VERIFIED (user, Chrome, after `b5bc9c5`):** `/plan` 200,
  `X-EdgeSight-Planner: ai`, sensitive/redacted counts 5/5, `rawPiiIncluded=false`.
  Nemotron returned STOP with null target while `actionCandidates=[]`; controls were
  present in OCR. NVIDIA is confirmed; candidate generation is the acceptance blocker.
- **PENDING (never observed):** AI CLICK against a current approved candidate; Phase 7 positive click +
  stale/wrong-page negative; Phase 8 positive/negative visual verification; Phase 9 live
  Chrome timings + CPU/GPU/RAM. Prior Computer-Use attempts stopped on a URL-policy block.

## Known limitations
Heuristic, English-only OCR; styled buttons can misread. PII is scoped to detected/known
values; unknown/transformed secrets can escape. Single 750 ms post-click capture can miss
slow transitions (no retry). Cross-origin navigation can lose activeTab and fails closed.
Tab/capture checks are not atomic. Worker restart loses pending tickets/results. No general
automation, no additional provider, no Raspberry Pi.

## Exact next step
User: reload EdgeSight at `chrome://extensions`, reload Employee Travel Request, then
ANALYZE / PLAN without Execute. Confirm `actionCandidates` contains the current safe
visual ID for the button, `/plan` 200, planner header `ai`, and CLICK targeting that ID.
Record the live result before deciding the next controlled execution verification.
No automatic Execute, autonomous loop, or expanded actions in this task.

## Remaining roadmap (not sacred — adjust to repo reality)
1. Verify one live AI CLICK against an approved candidate (AI mode itself is confirmed).
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

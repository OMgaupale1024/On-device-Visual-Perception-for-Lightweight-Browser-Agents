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
- **Model decision policy / live AI PLAN acceptance:** after `7b34f7a`, user confirmed
  that the real AI smoke now returns a valid STOP instead of UNAVAILABLE. The complete
  actionable fixture should yield CLICK. Timeout, provider connectivity, grounding and
  privacy are working; the explicit model-prompt policy change awaits live acceptance.
- Manual Phase 7 execution, Phase 8 visual verification and Phase 9 resource/timing
  acceptance remain pending. Automated unit doubles are not acceptance.

## Current task
Clarify the model prompt: a completed travel form with a unique actionable Continue
requires CLICK; filled fields do not mean already submitted, and filled redacted values
are not missing. The model remains the sole decision-maker; validators and reason enum
are unchanged. Await user-run smoke CLICK/STOP pair and Chrome PLAN before commit/push.
Do not debug timeout, key, network, OCR, fusion, candidates, privacy or grounding.

## Critical architecture decisions (do not break)
- **One privacy boundary out of the browser:** only the frozen builder-approved
  SafeAgentContext leaves; raw screenshots/OCR/DOM/secret lists never do.
- **Server never returns selectors, coordinates, screenshots or code** — only WHAT
  (`visual_N`) or `STOP`, plus fixed non-sensitive reason phrases. The browser resolves
  WHERE/HOW locally.
- **Deterministic is the default;** `ai` (NVIDIA) is explicit, bounded (30s default/64KB), no
  tools/history/retries/fallback. This is an **LLM over sanitized structured context,
  not a VLM** — no images are sent.
- **NVIDIA_TIMEOUT_SECONDS:** non-secret startup setting, finite 1–120 seconds;
  invalid values fail startup. Browser/smoke has an independent 35s limit. Timeout
  remains generic HTTP 504; internal timed_out flag carries no provider data.
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
npm test            # extension suite (node --test)
npm run build       # package pinned local OCR assets
npm run check       # syntax / manifest / packaged-asset integrity
npm run benchmark   # Phase 9 controlled benchmark (needs server venv)
# server tests (from server/):
.venv/Scripts/python.exe -m unittest discover -s tests
# server run (from server/, deterministic):
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```
Full Windows setup (venv, extension origin, AI mode) is in `README.md` / `server/README.md`.

## Git state
- Branch `main`; prompt-policy task started clean at `7b34f7a` (timeout fix).
- Prompt/tests and these context documents are pending live acceptance before commit.
  Check `git status` and `git log -1 --format=%H` for the exact current state.

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
  present in OCR. This was before the grounding fix.
- **VERIFIED (user, Chrome, after `076a81f`):** actionCandidates includes the current
  Continue candidate; sensitive/redacted counts remain 5/5, rawPiiIncluded=false.
  `/plan` returns 504 with planner header ai; AI smoke reports UNAVAILABLE. The
  blocker at that point was provider timeout, not perception or grounding.
- **VERIFIED (user, real AI smoke, after `7b34f7a`):** requestPlan returns READY with
  model-selected STOP where the complete actionable fixture expects CLICK. The real
  NVIDIA round-trip and valid response are working. The CLICK/STOP pair has not passed.
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
User restarts FastAPI in their already configured AI terminal and runs
node scripts/smoke-planner.mjs --ai: require real CLICK for the complete actionable
fixture and real STOP when targets are absent. Then reload extension/page, ANALYZE / PLAN:
require 200, header ai, CLICK on the current candidate, successful target validation and
privacy 5 sensitive / 5 redacted / rawPiiIncluded=false. No Execute. Only after these
live checks pass, record Phase 11A acceptance, commit/push and stop; no autonomous loop.

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

# EdgeSight — Phase 6B handoff

**Code complete; stop for review.** Real-provider manual verification remains
pending because no provider key was configured. No Phase 7 work.

Before changes: git status, git branch, git log --oneline -10, git fetch,
git pull --ff-only; read README and all context/architecture/progress/decisions/
testing docs. Only one AI writes. Code/tests/Git are source of truth.

## Verified baseline

Phases 0–6A implemented. User Chrome-verified Phase 6A: POST /plan → FastAPI HTTP
200; seven fields; five sensitive fields/redacted regions; rawPiiIncluded=false;
privacy.status=safe; five role placeholders; Bengaluru/Conference retained;
deterministic flow working. No additional unreported manual check inferred.

## Phase 6B boundary

PLANNER_MODE=deterministic (default) preserves original planner. Explicit ai mode
uses exactly one provider: NVIDIA NIM, nvidia/nemotron-3.5-lightning-30b-a3b, via the
OpenAI-compatible Chat Completions endpoint at https://integrate.api.nvidia.com/v1.
NVIDIA_API_KEY belongs only in the server process. No key was configured/read/printed
in this session; NVIDIA API access was verified out-of-band by the user.

app/ai_input.py snapshots/revalidates the full candidate, projects only safe
goal/privacy/semantic and pixel-OCR evidence/redaction legend, guards the exact
JSON and caps it. No observation ID/timestamps/bboxes/debug/environment goes to model.
app/ai_contract.py supplies fixed instructions and strict three-key model schema.
app/nvidia_provider.py sends the prompt via async httpx (the OpenAI-compatible HTTP
client; no openai SDK), fixed HTTPS endpoint, response_format=json_object,
enable_thinking=false, no tools/redirects/environment proxies/retries, 15s/64KB bounds.
app/ai_planner.py validates action/target/reason and binds observation on our server.

Same five-key CLICK/STOP response. X-EdgeSight-Planner reports mode separately;
extension allowlists and displays it, including AI on server failures. Browser
deadline 20s. No silent fallback, browser execution, re-observation or image upload.
This is an LLM over structured visual context, not a VLM integration.

## Tests / manual work

50/50 server methods and 120/120 extension entries pass; all existing regressions
remain. Twenty contamination cases at direct AI entry and again via /plan each
produce zero provider calls. Exact mocked provider request contains placeholders
and no known fake PII/credential/observation metadata. Twenty-three malicious output
cases reject. Injection text stays separate from policy. Genuine OCR cold/warm,
syntax/assets/Python/dependency checks pass. Real localhost HTTP verifies
deterministic 200 and AI missing-key 503 with correct mode header. No live model call.

Next manual review: follow server/README.md masked key setup with NVIDIA_API_KEY, run
AI mode and the Employee Travel Request demo. Confirm local privacy/context, Planner
NVIDIA AI, actual Continue visual ID, and no browser click. Inspect safe planning
content without logging auth headers. The server-side NVIDIA smoke through the parser
and all Phase 6B Chrome checks remain pending (no key was configured this session).

## Run / files / limitations

Full Windows setup: [server README](../server/README.md).
From server/ after process configuration:
```powershell
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Reload extension/, allow file URLs, Analyze / Plan. Optional synthetic real-provider
smoke from root: node scripts/smoke-planner.mjs --ai (requires key; not run here).

Important: app/{ai_input,ai_contract,ai_planner,nvidia_provider,config,main}.py,
test_ai_planner.py, transport/config + planner-client, popup. Preserve the untouched
Phase 5/6A approval/sanitized handle/schemas/deterministic planner and all regressions.
Unknown PII/OCR errors, model semantic mistakes, prompt-injection limits, no live
page freshness guarantee, fixed reason vocabulary and dev CORS limitations remain.
The existing Starlette TestClient warning is non-failing.

Baseline commit f356308. Phase 6B commit subject: feat: add privacy-safe AI planner.
The commit containing this handoff is the checkpoint; git log -1 --format=%H resolves
its hash. Final report records push and clean-tree verification. No keys, .env,
provider dumps, captures, node_modules, venv or caches in commits; never force push.

Exact next task after review: **PHASE 7 — safe browser action execution using the
current observation's visual bounding boxes. Not started.**

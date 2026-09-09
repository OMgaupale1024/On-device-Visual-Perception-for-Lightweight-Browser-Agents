# server/

FastAPI **planner**. Given a goal + **sanitized** UI state, returns the next structured
action. `LocalPlanner` (deterministic mock) is the default; `LLMPlanner` is optional and
gated behind `PLANNER_MODE=llm`. Receives sanitized data only — never raw PII.

**Built in Phase 5+.** Intended run: `pip install -r requirements.txt && uvicorn
app.main:app --reload`. Config from `.env` (copy of root `../.env.example`).

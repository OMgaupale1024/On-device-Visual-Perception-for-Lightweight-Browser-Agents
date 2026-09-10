"""Non-secret server configuration. One provider/model, explicit mode selection."""
import os

MODEL = "gpt-4.1-mini-2025-04-14"
PROVIDER_TIMEOUT_SECONDS = 15
MODE_HEADER = "X-EdgeSight-Planner"


def planner_mode() -> str:
    mode = os.environ.get("PLANNER_MODE", "deterministic")
    if mode not in {"deterministic", "ai"}:
        raise ValueError("PLANNER_MODE must be deterministic or ai")
    return mode

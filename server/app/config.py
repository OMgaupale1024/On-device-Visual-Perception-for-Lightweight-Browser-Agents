"""Non-secret server configuration. One provider (NVIDIA NIM), explicit mode."""
import os

# NVIDIA NIM, OpenAI-compatible Chat Completions. Non-secret; overridable by env.
MODEL = os.environ.get("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
PROVIDER_TIMEOUT_SECONDS = 15
MODE_HEADER = "X-EdgeSight-Planner"


def planner_mode() -> str:
    mode = os.environ.get("PLANNER_MODE", "deterministic")
    if mode not in {"deterministic", "ai"}:
        raise ValueError("PLANNER_MODE must be deterministic or ai")
    return mode

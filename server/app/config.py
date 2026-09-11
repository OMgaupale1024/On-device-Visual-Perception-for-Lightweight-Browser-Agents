"""Non-secret server configuration. One provider (NVIDIA NIM), explicit mode."""
import math
import os


def provider_timeout_seconds() -> float:
    # Non-secret startup setting. Never echo a malformed environment value.
    message = "NVIDIA_TIMEOUT_SECONDS must be a finite number from 1 to 120"
    try:
        seconds = float(os.environ.get("NVIDIA_TIMEOUT_SECONDS", "30"))
    except ValueError:
        raise ValueError(message) from None
    if not math.isfinite(seconds) or not 1 <= seconds <= 120:
        raise ValueError(message)
    return seconds

# NVIDIA NIM, OpenAI-compatible Chat Completions. Non-secret; overridable by env.
MODEL = os.environ.get("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
PROVIDER_TIMEOUT_SECONDS = provider_timeout_seconds()
MODE_HEADER = "X-EdgeSight-Planner"


def planner_mode() -> str:
    mode = os.environ.get("PLANNER_MODE", "deterministic")
    if mode not in {"deterministic", "ai"}:
        raise ValueError("PLANNER_MODE must be deterministic or ai")
    return mode

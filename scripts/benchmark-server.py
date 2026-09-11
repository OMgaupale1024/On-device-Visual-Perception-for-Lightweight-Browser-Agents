"""Controlled server measurements only. No request/response bodies or credentials output."""
import argparse
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from app.schemas import SafeAgentContext
from app.planner import plan
from app.ai_input import prepare_ai_input


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--ai", action="store_true")
    args = parser.parse_args()
    raw = Path(args.context).read_bytes()
    candidate = json.loads(raw)
    validation, planner, projection = [], [], []
    for _ in range(10):
        start = time.perf_counter()
        context = SafeAgentContext.model_validate(candidate)
        validation.append((time.perf_counter() - start) * 1000)
        start = time.perf_counter()
        plan(context)
        planner.append((time.perf_counter() - start) * 1000)
        start = time.perf_counter()
        prepared = prepare_ai_input(candidate)
        projection.append((time.perf_counter() - start) * 1000)
    result = {"python": platform.python_version(), "requestBytes": len(raw),
              "providerInputBytes": len(prepared.content.encode("utf-8")),
              "validationMs": validation, "deterministicPlannerMs": planner,
              "projectionMs": projection, "http": {}, "nvidia": {"status": "PENDING", "reason":
                  "Not requested; separate opt-in --ai" if os.environ.get("NVIDIA_API_KEY", "").strip() else "No configured key"}}
    modes = ["deterministic"]
    if args.ai:
        if os.environ.get("NVIDIA_API_KEY", "").strip():
            modes.append("ai")
        else:
            result["nvidia"] = {"status": "PENDING", "reason": "No configured key"}
    for mode in modes:
        # Bind a temporary loopback port. Startup failure is reported, never replaced
        # with mocked HTTP timings or a deterministic fallback for AI.
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = dict(os.environ, PLANNER_MODE=mode, EDGESIGHT_EXTENSION_ORIGIN="")
        if mode == "deterministic":
            env.pop("NVIDIA_API_KEY", None)
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                                    "--port", str(port), "--no-access-log"], cwd=ROOT / "server", env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError("Local benchmark server startup failed")
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1):
                        break
                except OSError:
                    time.sleep(0.05)
            else:
                raise RuntimeError("Local benchmark server startup timed out")
            runs, statuses = [], []
            for _ in range(3 if mode == "ai" else 10):
                start = time.perf_counter()
                request = urllib.request.Request(f"http://127.0.0.1:{port}/plan", data=raw, headers={"Content-Type": "application/json"})
                try:
                    with urllib.request.urlopen(request, timeout=25) as response:
                        decision = json.load(response)
                        assert decision["observationId"] == context.observation.id
                        statuses.append(response.status)
                except Exception:
                    statuses.append("FAILED")
                runs.append((time.perf_counter() - start) * 1000)
            result["http"][mode] = {"runsMs": runs, "statuses": statuses}
            if mode == "ai":
                result["nvidia"] = {"status": "MEASURED", "method": "Real NVIDIA via temporary FastAPI; includes failures", "runsMs": runs, "statuses": statuses}
        finally:
            process.terminate()
            process.wait(timeout=5)
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"status": "ERROR", "reason": "Server benchmark failed; check local Python dependencies and port availability"}))
        sys.exit(1)

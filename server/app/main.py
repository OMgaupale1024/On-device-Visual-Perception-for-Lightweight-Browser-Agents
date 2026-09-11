"""Local FastAPI entry point. Explicit AI mode; no payload logs or persistence."""
import os
import re
from time import perf_counter

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .planner import plan
from .schemas import PlanResponse, SafeAgentContext
from .ai_planner import plan_ai
from .config import MODE_HEADER, planner_mode
from .nvidia_provider import NvidiaProvider, PlannerFailure


def create_app(allowed_origin: str | None = None, *, mode=None, provider=None) -> FastAPI:
    selected_mode = planner_mode() if mode is None else mode
    if selected_mode not in {"deterministic", "ai"}:
        raise ValueError("PLANNER_MODE must be deterministic or ai")
    ai_provider = provider if provider is not None else NvidiaProvider()
    origin = os.environ.get("EDGESIGHT_EXTENSION_ORIGIN", "") if allowed_origin is None else allowed_origin
    if origin and not re.fullmatch(r"chrome-extension://[a-p]{32}", origin):
        raise ValueError("Configure one exact Chrome extension origin")
    app = FastAPI(title="EdgeSight Phase 6B", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_context(_request: Request, _error: RequestValidationError):
        # FastAPI's default 422 includes input values. Never echo rejected context.
        return JSONResponse(status_code=422, content={"detail": "Invalid or unsafe agent context."},
                            headers={MODE_HEADER: selected_mode})

    @app.middleware("http")
    async def check_origin(request: Request, call_next):
        request.state.entered_at = perf_counter()
        supplied = request.headers.get("origin")
        if supplied is not None and supplied != origin:
            return JSONResponse(status_code=403, content={"detail": "Origin rejected."})
        return await call_next(request)

    app.add_middleware(CORSMiddleware, allow_origins=[origin] if origin else [],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False,
                       expose_headers=[MODE_HEADER, "Server-Timing"])

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/plan", response_model=PlanResponse)
    async def get_plan(context: SafeAgentContext, response: Response, request: Request):
        started = perf_counter()
        prehandler_ms = (started - request.state.entered_at) * 1000
        def measured(result):
            # Fixed numeric metadata only. Pre-handler includes parsing/routing/validation;
            # it is not an isolated validation timer or one-way network measurement.
            response.headers["Server-Timing"] = f"prehandler;dur={prehandler_ms:.3f}, planner;dur={(perf_counter() - started) * 1000:.3f}"
            return result
        response.headers[MODE_HEADER] = selected_mode
        if selected_mode == "deterministic":
            return measured(plan(context))
        try:
            return measured(await plan_ai(context.model_dump(mode="python"), ai_provider))
        except PlannerFailure as failure:
            return JSONResponse(status_code=failure.status_code, content={"detail": "AI planner unavailable."},
                                headers={MODE_HEADER: selected_mode})
        except ValueError:
            return JSONResponse(status_code=422, content={"detail": "Invalid or unsafe agent context."},
                                headers={MODE_HEADER: selected_mode})

    return app


app = create_app()

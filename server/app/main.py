"""Local-only FastAPI entry point. No model, payload logs or persistence."""
import os
import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .planner import plan
from .schemas import PlanResponse, SafeAgentContext


def create_app(allowed_origin: str | None = None) -> FastAPI:
    origin = os.environ.get("EDGESIGHT_EXTENSION_ORIGIN", "") if allowed_origin is None else allowed_origin
    if origin and not re.fullmatch(r"chrome-extension://[a-p]{32}", origin):
        raise ValueError("Configure one exact Chrome extension origin")
    app = FastAPI(title="EdgeSight Phase 6A", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_context(_request: Request, _error: RequestValidationError):
        # FastAPI's default 422 includes input values. Never echo rejected context.
        return JSONResponse(status_code=422, content={"detail": "Invalid or unsafe agent context."})

    @app.middleware("http")
    async def check_origin(request: Request, call_next):
        supplied = request.headers.get("origin")
        if supplied is not None and supplied != origin:
            return JSONResponse(status_code=403, content={"detail": "Origin rejected."})
        return await call_next(request)

    app.add_middleware(CORSMiddleware, allow_origins=[origin] if origin else [],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/plan", response_model=PlanResponse)
    async def get_plan(context: SafeAgentContext):
        return plan(context)

    return app


app = create_app()

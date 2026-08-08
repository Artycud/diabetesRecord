from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from uuid import UUID

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.mcp_context import _current_user_id, _current_db, _current_device_id

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import auth, logs, profile, gamification, content, push, sensor, ai, pilot, ws, admin
app.include_router(auth.router)
app.include_router(logs.router)
app.include_router(profile.router)
app.include_router(gamification.router)
app.include_router(content.router)
app.include_router(push.router)
app.include_router(sensor.router)
app.include_router(ai.router)
app.include_router(pilot.router)
app.include_router(ws.router)
app.include_router(admin.router)

@app.get("/healthz", include_in_schema=False)
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}


# ─── MCP mount (Streamable HTTP for external Claude clients) ─────────────────

class MCPAuthMiddleware(BaseHTTPMiddleware):
    """
    Validates Bearer token on /mcp/* requests and sets user + fresh DB session
    in contextvars so MCP tools can read them.

    Internal callers (routers/ai.py chat endpoint) don't go through this — they
    use app.mcp_context.mcp_scope() directly.
    """
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/mcp"):
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return JSONResponse(
                {"error": "missing_bearer_token"}, status_code=401
            )
        user_id = decode_access_token(auth.split(None, 1)[1])
        if not user_id:
            return JSONResponse(
                {"error": "invalid_or_expired_token"}, status_code=401
            )

        dev_hdr = request.headers.get("x-metabreath-device-id")
        device_id = None
        if dev_hdr:
            try:
                device_id = UUID(dev_hdr)
            except ValueError:
                pass

        async with AsyncSessionLocal() as db:
            tok_u = _current_user_id.set(UUID(user_id))
            tok_d = _current_db.set(db)
            tok_dev = _current_device_id.set(device_id)
            try:
                return await call_next(request)
            finally:
                _current_device_id.reset(tok_dev)
                _current_db.reset(tok_d)
                _current_user_id.reset(tok_u)


app.add_middleware(MCPAuthMiddleware)

from app.mcp_server import mcp as _mcp_instance  # noqa: E402
app.mount("/mcp", _mcp_instance.streamable_http_app())

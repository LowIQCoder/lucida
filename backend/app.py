import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.logging_utils import LOG_FILE, log_event, normalize_log_level, read_log_lines
from backend.models import LogPayload, SessionPayload


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ML_ROOT = PROJECT_ROOT / "ml"
MODEL_DIR = ML_ROOT / "models"
MAX_LOG_READ_LINES = 1_000


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_event("backend_started", {"modelDir": str(MODEL_DIR), "logFile": str(LOG_FILE)})
    yield
    log_event("backend_stopped", {"modelDir": str(MODEL_DIR), "logFile": str(LOG_FILE)})


app = FastAPI(title="Browser Image Enhancer", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception as error:
        log_event(
            "request_failed",
            {
                "method": request.method,
                "path": request.url.path,
                "client": request.client.host if request.client else None,
                "error": str(error),
            },
            level="error",
        )
        raise

    log_event(
        "request_completed",
        {
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "client": request.client.host if request.client else None,
            "ms": round((perf_counter() - started_at) * 1000),
        },
    )
    return response


@app.get("/api/health")
def health():
    return {"ok": True, "logFile": str(LOG_FILE)}


@app.get("/api/config")
def config():
    latest = get_latest_checkpoint()
    return {
        "inference": "browser",
        "latestCheckpoint": checkpoint_metadata(latest),
    }


@app.post("/api/sessions")
def collect_session(payload: SessionPayload, request: Request):
    log_event(
        "session_started",
        {
            "sessionId": payload.session_id,
            "userAgent": payload.user_agent or request.headers.get("user-agent"),
            "pageUrl": payload.page_url,
            "ip": request.client.host if request.client else None,
        },
    )
    return {"ok": True}


@app.post("/api/logs")
def collect_log(payload: LogPayload, request: Request):
    log_event(
        "frontend_log",
        {
            "sessionId": payload.session_id,
            "level": payload.level,
            "message": payload.message,
            "data": payload.data,
            "clientTimestamp": payload.timestamp,
            "ip": request.client.host if request.client else None,
        },
        level=normalize_log_level(payload.level),
    )
    return {"ok": True}


@app.get("/api/logs")
def list_logs(limit: int = 100):
    limit = max(1, min(limit, MAX_LOG_READ_LINES))
    return {"items": read_log_lines(limit)}

@app.get("/api/sessions")
def list_sessions(limit: int = 100):
    session_lines = [
        line
        for line in read_log_lines(MAX_LOG_READ_LINES)
        if '"event": "session_started"' in line
    ]
    return {"items": session_lines[-limit:]}


@app.get("/api/checkpoints")
def list_checkpoints():
    return {"items": [checkpoint_metadata(path) for path in sorted(MODEL_DIR.glob("*.onnx"))]}


@app.api_route("/api/checkpoints/{checkpoint_id}", methods=["GET", "HEAD"])
def checkpoint(checkpoint_id: str):
    latest = checkpoint_id == "latest"
    path = get_latest_checkpoint() if latest else (MODEL_DIR / checkpoint_id).resolve()
    if not path.is_relative_to(MODEL_DIR) or not path.is_file() or path.suffix != ".onnx":
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    log_event("checkpoint_downloaded", {"id": path.name, "latest": latest})
    return FileResponse(path, media_type="application/octet-stream")


def get_latest_checkpoint() -> Path:
    checkpoints = [path for path in MODEL_DIR.glob("*.onnx") if path.is_file()]
    if not checkpoints:
        raise HTTPException(status_code=404, detail="No model checkpoints found")
    return max(checkpoints, key=lambda path: path.stat().st_mtime)


def checkpoint_metadata(path: Path) -> dict:
    stat = path.stat()
    latest = path == get_latest_checkpoint()
    return {
        "id": path.name,
        "url": "/api/checkpoints/latest" if latest else f"/api/checkpoints/{path.name}",
        "size": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "outputs": ["brightness", "contrast", "saturation"],
    }


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    log_event("backend_serving", {"host": host, "port": port, "inference": "browser"})
    uvicorn.run(app, host=host, port=port, reload=False)

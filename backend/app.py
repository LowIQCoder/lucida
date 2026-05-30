"""FastAPI application for serving image enhancement checkpoints."""

import json
import logging
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.models import Checkpoint
from backend.repository import (
    CheckpointNotFoundError,
    CheckpointRepository,
    InvalidCheckpointConfigError,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "ml" / "models"
MODEL_MEDIA_TYPE = "application/octet-stream"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

checkpoint_repository = CheckpointRepository(MODEL_DIR)
app = FastAPI(title="Browser Image Enhancer")


def configure_app(application: FastAPI) -> None:
    """Configure middleware and exposed response headers."""
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Model-Id", "X-Model-Size", "X-Model-Config"],
    )


@app.get("/api/checkpoint/{model_id}")
def checkpoint(model_id: str):
    """Return model bytes and model config for requested checkpoint id."""
    try:
        checkpoint_data = checkpoint_repository.get(model_id)
    except CheckpointNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidCheckpointConfigError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    logger.info(
        "Checkpoint accessed. id=%s size=%s",
        checkpoint_data.model_id,
        checkpoint_data.size,
    )
    return checkpoint_response(checkpoint_data)


@app.get("/api/checkpoint/{model_id}/config")
def checkpoint_config(model_id: str):
    """Return model config without loading model bytes in the browser."""
    try:
        checkpoint_data = checkpoint_repository.get(model_id)
    except CheckpointNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidCheckpointConfigError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return checkpoint_data.config.model_dump()


@app.get("/api/health")
def health():
    """Return backend health status."""
    logger.info("Health endpoint accessed")
    return {"ok": True}


def checkpoint_response(checkpoint_data: Checkpoint) -> FileResponse:
    """Build checkpoint file response with config metadata headers."""
    return FileResponse(
        checkpoint_data.model_path,
        media_type=MODEL_MEDIA_TYPE,
        headers={
            "Cache-Control": "no-store",
            "X-Model-Id": checkpoint_data.model_id,
            "X-Model-Size": str(checkpoint_data.size),
            "X-Model-Config": json.dumps(checkpoint_data.config.model_dump()),
        },
    )


def main() -> None:
    """Run the backend application."""
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    logger.info("Backend serving. host=%s port=%s", host, port)
    uvicorn.run(app, host=host, port=port, reload=False)


configure_app(app)


if __name__ == "__main__":
    main()

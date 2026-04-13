"""
Polymath SAR Processor — FastAPI application entry point.

Routes:
  GET  /health
  GET  /sentinel/scenes
  POST /sentinel/download
  POST /process/submit
  GET  /process/status/{job_id}
  GET  /displacement/{asset_id}
  GET  /egms/query
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Route modules
from routes import sentinel, processing, egms, displacement

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

load_dotenv()  # Load .env in development; Railway / Docker inject vars directly

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

# Central in-memory job store: { job_id: { status, progress, result, ... } }
# Injected into the processing and displacement route modules at startup.
JOB_STORE: dict = {}


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Wire the shared job store into route modules
    processing.job_store = JOB_STORE
    displacement.job_store = JOB_STORE  # type: ignore[attr-defined]

    # Ensure data directories exist
    for path_str in ("/app/data/scenes", "/app/data/processing", "/app/data/results"):
        Path(path_str).mkdir(parents=True, exist_ok=True)

    logger.info("Polymath SAR Processor started")
    yield
    logger.info("Polymath SAR Processor shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Polymath SAR Processor",
    description=(
        "Sentinel-1 InSAR processing backend for the Polymath platform. "
        "Provides scene search, InSAR displacement time series, and EGMS proxy."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow all origins so the Next.js frontend (any domain) can reach this
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(sentinel.router, prefix="/sentinel", tags=["Sentinel-1"])
app.include_router(processing.router, prefix="/process", tags=["Processing"])
app.include_router(egms.router, prefix="/egms", tags=["EGMS"])
app.include_router(displacement.router, prefix="/displacement", tags=["Displacement"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
async def health() -> dict:
    """
    Lightweight liveness probe.

    Returns service version, current UTC time, and the number of tracked jobs.
    """
    return {
        "status": "ok",
        "service": "polymath-sar-processor",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "jobs_tracked": len(JOB_STORE),
        "copernicus_configured": bool(
            os.getenv("COPERNICUS_USERNAME") and os.getenv("COPERNICUS_PASSWORD")
        ),
    }

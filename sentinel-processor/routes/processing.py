"""
PyGMTSAR InSAR processing pipeline.

Handles:
  - Accepting scene pairs and launching SBAS displacement processing
  - Reporting job status / progress
  - Storing results in the shared in-memory job store

Note: pygmtsar SBAS objects are NOT serialised to disk between stages because
pickle with untrusted data poses security risks.  Instead, each stage
re-instantiates SBAS from the source scene paths stored in the job record,
which keeps all state in-process for the duration of the pipeline task.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# The job store is populated in main.py and referenced here.
job_store: dict[str, dict[str, Any]] = {}

logger = logging.getLogger(__name__)
router = APIRouter()

PROCESSING_DIR = Path("/app/data/processing")
RESULTS_DIR = Path("/app/data/results")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    scene1_path: str
    scene2_path: str
    asset_id: str
    lat: float
    lng: float
    baseline_threshold_days: int = 60
    baseline_threshold_meters: float = 150.0


class JobStatusResponse(BaseModel):
    job_id: str
    status: str           # "queued" | "processing" | "complete" | "error"
    progress: int         # 0-100
    asset_id: Optional[str] = None
    submitted_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    result: Optional[dict] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/submit", response_model=JobStatusResponse)
async def submit_processing_job(request: ProcessRequest) -> JobStatusResponse:
    """
    Accept a scene pair and enqueue an InSAR processing job.

    Returns a job_id that can be polled via GET /status/{job_id}.
    """
    job_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    job_store[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "asset_id": request.asset_id,
        "submitted_at": now_iso,
        "completed_at": None,
        "error": None,
        "result": None,
        "request": request.model_dump(),
    }

    logger.info("Job %s queued for asset %s", job_id, request.asset_id)

    # Launch as a background asyncio task so the HTTP response is immediate.
    asyncio.create_task(
        _run_insar_pipeline(job_id, request),
        name=f"insar-{job_id[:8]}",
    )

    return _job_response(job_id)


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """Return the current status and (if complete) result for a processing job."""
    if job_id not in job_store:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    return _job_response(job_id)


# ---------------------------------------------------------------------------
# Internal pipeline orchestrator
# ---------------------------------------------------------------------------

def _job_response(job_id: str) -> JobStatusResponse:
    entry = job_store[job_id]
    return JobStatusResponse(
        job_id=entry["job_id"],
        status=entry["status"],
        progress=entry["progress"],
        asset_id=entry.get("asset_id"),
        submitted_at=entry.get("submitted_at"),
        completed_at=entry.get("completed_at"),
        error=entry.get("error"),
        result=entry.get("result"),
    )


def _update_job(job_id: str, **kwargs: Any) -> None:
    if job_id in job_store:
        job_store[job_id].update(kwargs)


async def _run_insar_pipeline(job_id: str, req: ProcessRequest) -> None:
    """
    Orchestrate the full InSAR pipeline in a background asyncio task.

    Each stage runs in a thread-pool executor so CPU-bound work does not
    block the event loop.
    """
    loop = asyncio.get_event_loop()

    try:
        _update_job(job_id, status="processing", progress=5)
        logger.info("[%s] Pipeline started", job_id)

        work_dir = PROCESSING_DIR / job_id
        result_dir = RESULTS_DIR / job_id

        # 1 – Setup
        await loop.run_in_executor(
            None, _stage_setup, job_id, req, work_dir, result_dir
        )
        _update_job(job_id, progress=10)
        await asyncio.sleep(0)

        # 2 – Pre-process / initialise SBAS object
        sbas_or_sim = await loop.run_in_executor(
            None, _stage_preprocess, job_id, req, work_dir
        )
        _update_job(job_id, progress=25)
        await asyncio.sleep(0)

        # 3 – Coregistration
        sbas_or_sim = await loop.run_in_executor(
            None, _stage_coregister, job_id, sbas_or_sim
        )
        _update_job(job_id, progress=45)
        await asyncio.sleep(0)

        # 4 – Interferogram
        sbas_or_sim = await loop.run_in_executor(
            None, _stage_interferogram, job_id, sbas_or_sim
        )
        _update_job(job_id, progress=65)
        await asyncio.sleep(0)

        # 5 – Phase unwrapping
        sbas_or_sim = await loop.run_in_executor(
            None, _stage_unwrap, job_id, sbas_or_sim
        )
        _update_job(job_id, progress=80)
        await asyncio.sleep(0)

        # 6 – SBAS inversion → displacement time series
        displacement_result = await loop.run_in_executor(
            None, _stage_sbas_inversion, job_id, req, sbas_or_sim, result_dir
        )
        _update_job(job_id, progress=95)

        # 7 – Finalise
        _update_job(
            job_id,
            status="complete",
            progress=100,
            completed_at=datetime.now(timezone.utc).isoformat(),
            result=displacement_result,
        )
        logger.info("[%s] Pipeline complete", job_id)

    except Exception as exc:  # noqa: BLE001
        logger.exception("[%s] Pipeline error: %s", job_id, exc)
        _update_job(
            job_id,
            status="error",
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Pipeline stage functions
# Each returns either a live SBAS object (real mode) or the sentinel string
# "_simulate_" (simulation mode) which is passed forward through stages.
# ---------------------------------------------------------------------------

_SIMULATE = "_simulate_"


def _stage_setup(
    job_id: str,
    req: ProcessRequest,
    work_dir: Path,
    result_dir: Path,
) -> None:
    scene1, scene2 = Path(req.scene1_path), Path(req.scene2_path)
    if not scene1.exists():
        raise FileNotFoundError(f"Scene 1 not found: {scene1}")
    if not scene2.exists():
        raise FileNotFoundError(f"Scene 2 not found: {scene2}")
    work_dir.mkdir(parents=True, exist_ok=True)
    result_dir.mkdir(parents=True, exist_ok=True)
    logger.info("[%s] Work dir ready: %s", job_id, work_dir)


def _stage_preprocess(
    job_id: str, req: ProcessRequest, work_dir: Path
) -> Any:
    try:
        from pygmtsar import SBAS

        sbas = SBAS(
            str(req.scene1_path),
            str(req.scene2_path),
            basedir=str(work_dir),
        )
        sbas.set_master()
        logger.info("[%s] SBAS initialised, master set", job_id)
        return sbas

    except ImportError:
        logger.warning("[%s] pygmtsar not available – simulation mode", job_id)
        return _SIMULATE


def _stage_coregister(job_id: str, sbas_or_sim: Any) -> Any:
    if sbas_or_sim is _SIMULATE:
        logger.info("[%s] [SIM] Coregistration", job_id)
        return _SIMULATE

    sbas_or_sim.topo_ra()
    sbas_or_sim.align()
    logger.info("[%s] Coregistration complete", job_id)
    return sbas_or_sim


def _stage_interferogram(job_id: str, sbas_or_sim: Any) -> Any:
    if sbas_or_sim is _SIMULATE:
        logger.info("[%s] [SIM] Interferogram generation", job_id)
        return _SIMULATE

    sbas_or_sim.interferogram()
    sbas_or_sim.multilook(alks=4, rlks=8)
    sbas_or_sim.goldstein(alpha=0.5)
    logger.info("[%s] Interferogram generated", job_id)
    return sbas_or_sim


def _stage_unwrap(job_id: str, sbas_or_sim: Any) -> Any:
    if sbas_or_sim is _SIMULATE:
        logger.info("[%s] [SIM] Phase unwrapping", job_id)
        return _SIMULATE

    sbas_or_sim.unwrap(threshold=0.1)
    logger.info("[%s] Phase unwrapping complete", job_id)
    return sbas_or_sim


def _stage_sbas_inversion(
    job_id: str,
    req: ProcessRequest,
    sbas_or_sim: Any,
    result_dir: Path,
) -> dict:
    if sbas_or_sim is _SIMULATE:
        logger.info("[%s] [SIM] SBAS inversion – synthetic result", job_id)
        result = _synthetic_displacement_result(req)
    else:
        sbas_or_sim.sbas(smooth=1.0)
        ds = sbas_or_sim.open_sbas()
        pixel = ds.sel(lat=req.lat, lon=req.lng, method="nearest")
        dates = [str(t)[:10] for t in pixel.time.values]
        displacements = [float(v) for v in pixel.values]
        result = {
            "asset_id": req.asset_id,
            "source": "insar_pygmtsar",
            "processing_date": datetime.now(timezone.utc).isoformat(),
            "displacement_mm": displacements,
            "dates": dates,
            "velocity_mm_yr": _estimate_velocity(dates, displacements),
            "coherence": float(pixel.attrs.get("mean_coherence", 0.7)),
            "lat": req.lat,
            "lng": req.lng,
        }
        logger.info("[%s] SBAS inversion complete", job_id)

    out_file = result_dir / "displacement.json"
    with open(out_file, "w") as fh:
        json.dump(result, fh, indent=2)
    logger.info("[%s] Result persisted to %s", job_id, out_file)
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _synthetic_displacement_result(req: ProcessRequest) -> dict:
    """
    Generate a plausible synthetic InSAR displacement time series for
    simulation / development mode when pygmtsar is not installed.
    """
    rng = np.random.default_rng(seed=abs(int(req.lat * 1000 + req.lng * 1000)))

    n_epochs = 12
    base_dates = [
        datetime(2024, 1 + i, 1, tzinfo=timezone.utc).strftime("%Y-%m-%d")
        for i in range(n_epochs)
    ]

    t = np.linspace(0, 1, n_epochs)
    trend = rng.uniform(-25, -2) * t
    seasonal = rng.uniform(1, 5) * np.sin(2 * np.pi * t)
    noise = rng.normal(0, 0.5, n_epochs)
    displacements = (trend + seasonal + noise).tolist()

    velocity_mm_yr = round(float((trend[-1] - trend[0]) * 12 / n_epochs), 2)

    return {
        "asset_id": req.asset_id,
        "source": "insar_simulated",
        "processing_date": datetime.now(timezone.utc).isoformat(),
        "displacement_mm": [round(v, 2) for v in displacements],
        "dates": base_dates,
        "velocity_mm_yr": velocity_mm_yr,
        "coherence": round(float(rng.uniform(0.55, 0.92)), 3),
        "lat": req.lat,
        "lng": req.lng,
    }


def _estimate_velocity(dates: list[str], displacements: list[float]) -> float:
    """Least-squares linear velocity estimate in mm/year."""
    if len(dates) < 2:
        return 0.0
    t0 = datetime.fromisoformat(dates[0])
    t_years = np.array(
        [(datetime.fromisoformat(d) - t0).days / 365.25 for d in dates]
    )
    d = np.array(displacements)
    A = np.column_stack([t_years, np.ones_like(t_years)])
    coeffs, *_ = np.linalg.lstsq(A, d, rcond=None)
    return round(float(coeffs[0]), 2)

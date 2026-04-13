"""
Unified displacement endpoint.

Priority resolution order for a given asset_id:
  1. Completed InSAR processing result in the in-memory job store / disk cache
  2. EGMS WFS query if the asset is in Europe
  3. Physics-based estimate as final fallback

The response schema is compatible with the DisplacementPoint interface used
by the Polymath Next.js frontend (sample_assets.json).
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# Shared state injected from main.py at startup
from routes.processing import job_store, _estimate_velocity, _synthetic_displacement_result, ProcessRequest
from routes.egms import _is_in_egms_coverage, _fetch_egms_wfs, _physics_estimate

logger = logging.getLogger(__name__)
router = APIRouter()

RESULTS_DIR = Path("/app/data/results")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DisplacementTimeSeries(BaseModel):
    asset_id: str
    source: str         # "insar_pygmtsar" | "insar_simulated" | "egms_wfs" | "physics_estimate"
    velocity_mm_yr: float
    uncertainty_mm_yr: Optional[float] = None
    coherence: Optional[float] = None
    displacement_mm: list[float]
    dates: list[str]
    lat: float
    lng: float
    processing_date: Optional[str] = None
    coverage_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/{asset_id}", response_model=DisplacementTimeSeries)
async def get_displacement(
    asset_id: str,
    lat: float = Query(..., description="Asset latitude"),
    lng: float = Query(..., description="Asset longitude"),
    radius: float = Query(2000.0, ge=100, le=50000),
) -> DisplacementTimeSeries:
    """
    Return displacement time-series data for an asset, using the best
    available data source.
    """
    # 1 – Check processed InSAR result in cache
    insar_result = _find_insar_result(asset_id)
    if insar_result is not None:
        logger.info("Asset %s: serving InSAR result", asset_id)
        return _insar_to_response(insar_result)

    # 2 – EGMS if European
    if _is_in_egms_coverage(lat, lng):
        try:
            egms_result = await _fetch_egms_wfs(lat, lng, radius)
            if egms_result is not None and egms_result.points:
                logger.info("Asset %s: serving EGMS data", asset_id)
                return _egms_to_response(asset_id, lat, lng, egms_result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Asset %s: EGMS query failed (%s) – fallback", asset_id, exc)

    # 3 – Physics estimate
    logger.info("Asset %s: using physics-based estimate", asset_id)
    estimate = _physics_estimate(lat, lng, note="No InSAR or EGMS data available")
    return _estimate_to_response(asset_id, lat, lng, estimate)


# ---------------------------------------------------------------------------
# Result lookup helpers
# ---------------------------------------------------------------------------

def _find_insar_result(asset_id: str) -> Optional[dict]:
    """
    Search the in-memory job store then disk cache for a completed InSAR
    result that matches *asset_id*.

    Returns the result dict or None.
    """
    # In-memory job store (most recent complete job wins)
    for entry in reversed(list(job_store.values())):
        if (
            entry.get("asset_id") == asset_id
            and entry.get("status") == "complete"
            and entry.get("result") is not None
        ):
            return entry["result"]

    # Disk cache – look for <results_dir>/<job_id>/displacement.json
    # We scan all job directories and pick the most recently modified one
    # whose result matches asset_id.
    if RESULTS_DIR.exists():
        candidates: list[tuple[float, dict]] = []
        for result_file in RESULTS_DIR.glob("*/displacement.json"):
            try:
                data = json.loads(result_file.read_text())
                if data.get("asset_id") == asset_id:
                    mtime = result_file.stat().st_mtime
                    candidates.append((mtime, data))
            except (OSError, json.JSONDecodeError):
                continue
        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            return candidates[0][1]

    return None


# ---------------------------------------------------------------------------
# Schema conversion helpers
# ---------------------------------------------------------------------------

def _insar_to_response(result: dict) -> DisplacementTimeSeries:
    return DisplacementTimeSeries(
        asset_id=result["asset_id"],
        source=result.get("source", "insar_pygmtsar"),
        velocity_mm_yr=result.get("velocity_mm_yr", 0.0),
        coherence=result.get("coherence"),
        displacement_mm=result.get("displacement_mm", []),
        dates=result.get("dates", []),
        lat=result.get("lat", 0.0),
        lng=result.get("lng", 0.0),
        processing_date=result.get("processing_date"),
    )


def _egms_to_response(
    asset_id: str,
    lat: float,
    lng: float,
    egms: Any,
) -> DisplacementTimeSeries:
    """
    Convert an EGMSQueryResponse to a DisplacementTimeSeries by synthesising
    a time series from the measured annual velocity.
    """
    velocity = egms.velocity_mm_yr
    coherence = egms.coherence
    n_epochs = 24  # bi-monthly over 2 years

    dates = _generate_dates(n_epochs, months_step=1)
    t = np.linspace(0, (n_epochs - 1) / 12.0, n_epochs)

    rng = np.random.default_rng(seed=abs(int(lat * 1000 + lng * 1000)))
    noise = rng.normal(0, max(0.3, (egms.uncertainty_mm_yr or 1.5) * 0.2), n_epochs)
    seasonal = rng.uniform(0.5, 2.0) * np.sin(2 * np.pi * t)
    displacements = (velocity * t + seasonal + noise).tolist()

    return DisplacementTimeSeries(
        asset_id=asset_id,
        source="egms_wfs",
        velocity_mm_yr=velocity,
        uncertainty_mm_yr=egms.uncertainty_mm_yr,
        coherence=coherence,
        displacement_mm=[round(v, 2) for v in displacements],
        dates=dates,
        lat=lat,
        lng=lng,
        processing_date=datetime.now(timezone.utc).isoformat(),
        coverage_note=egms.coverage_note,
    )


def _estimate_to_response(
    asset_id: str,
    lat: float,
    lng: float,
    estimate: Any,
) -> DisplacementTimeSeries:
    """
    Convert a physics EGMSQueryResponse to a DisplacementTimeSeries,
    synthesising a plausible time series from the estimated velocity.
    """
    velocity = estimate.velocity_mm_yr
    uncertainty = estimate.uncertainty_mm_yr or abs(velocity) * 0.4 + 1.5
    n_epochs = 24

    dates = _generate_dates(n_epochs, months_step=1)
    t = np.linspace(0, (n_epochs - 1) / 12.0, n_epochs)

    rng = np.random.default_rng(seed=abs(int(lat * 1000 + lng * 1000)) + 1)
    noise = rng.normal(0, uncertainty * 0.15, n_epochs)
    seasonal = rng.uniform(0.5, 2.5) * np.sin(2 * np.pi * t)
    displacements = (velocity * t + seasonal + noise).tolist()

    return DisplacementTimeSeries(
        asset_id=asset_id,
        source="physics_estimate",
        velocity_mm_yr=velocity,
        uncertainty_mm_yr=round(uncertainty, 2),
        coherence=None,
        displacement_mm=[round(v, 2) for v in displacements],
        dates=dates,
        lat=lat,
        lng=lng,
        processing_date=datetime.now(timezone.utc).isoformat(),
        coverage_note=estimate.coverage_note,
    )


def _generate_dates(n: int, months_step: int = 1) -> list[str]:
    """Generate ISO date strings starting from 2 years ago, stepping by months_step months."""
    from datetime import timedelta
    base = datetime(
        datetime.now(timezone.utc).year - 2,
        datetime.now(timezone.utc).month,
        1,
        tzinfo=timezone.utc,
    )
    dates = []
    year, month = base.year, base.month
    for _ in range(n):
        dates.append(f"{year}-{month:02d}-01")
        month += months_step
        while month > 12:
            month -= 12
            year += 1
    return dates

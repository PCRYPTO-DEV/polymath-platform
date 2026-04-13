"""
EGMS (European Ground Motion Service) displacement proxy.

Handles:
  - Querying the ESA EGMS WFS API for ground motion velocity at a point
  - Returning structured velocity / uncertainty / coherence data
  - Physics-based fallback estimate for locations outside Europe
"""

import logging
import math
from typing import Optional

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# EGMS Level 3 (Europe-wide) WFS endpoint
EGMS_WFS_BASE = (
    "https://egms.land.copernicus.eu/insar-api/archive/egms/v1/datasets/"
    "EGMS_L3_E30N30_100km_U"
)

# Rough bounding box for the EGMS geographic coverage (Europe + Turkey)
EGMS_BBOX = {
    "lat_min": 27.6,
    "lat_max": 72.0,
    "lng_min": -31.3,
    "lng_max": 44.8,
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class EGMSPoint(BaseModel):
    lat: float
    lng: float
    velocity_mm_yr: float
    uncertainty_mm_yr: Optional[float] = None
    coherence: Optional[float] = None
    mean_height_m: Optional[float] = None


class EGMSQueryResponse(BaseModel):
    source: str          # "egms_wfs" | "physics_estimate"
    velocity_mm_yr: float
    uncertainty_mm_yr: Optional[float] = None
    coherence: Optional[float] = None
    points: list[EGMSPoint]
    coverage_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/query", response_model=EGMSQueryResponse)
async def query_egms(
    lat: float = Query(..., description="Latitude of the point of interest"),
    lng: float = Query(..., description="Longitude of the point of interest"),
    radius: float = Query(2000.0, ge=100, le=50000, description="Search radius in metres"),
) -> EGMSQueryResponse:
    """
    Query the ESA EGMS WFS for ground motion velocity near a given point.

    Falls back to a physics-based estimate when the point is outside Europe
    or when the EGMS service returns no data.
    """
    if not _is_in_egms_coverage(lat, lng):
        logger.info(
            "Coordinates (%.4f, %.4f) outside EGMS coverage – using physics estimate",
            lat, lng,
        )
        return _physics_estimate(lat, lng, note="Outside EGMS coverage area")

    try:
        result = await _fetch_egms_wfs(lat, lng, radius)
        if result is not None:
            return result
        logger.info("EGMS WFS returned no data for (%.4f, %.4f) – fallback", lat, lng)
    except Exception as exc:  # noqa: BLE001
        logger.warning("EGMS WFS request failed: %s – using physics estimate", exc)

    return _physics_estimate(lat, lng, note="EGMS service unavailable or no data")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_in_egms_coverage(lat: float, lng: float) -> bool:
    return (
        EGMS_BBOX["lat_min"] <= lat <= EGMS_BBOX["lat_max"]
        and EGMS_BBOX["lng_min"] <= lng <= EGMS_BBOX["lng_max"]
    )


async def _fetch_egms_wfs(
    lat: float, lng: float, radius_m: float
) -> Optional[EGMSQueryResponse]:
    """
    Query the EGMS WFS OGC API using a BBOX derived from the search radius.

    Returns None if the service responds but contains no features.
    """
    # Convert radius (metres) to approximate degree offsets
    lat_delta = radius_m / 111_320.0
    lng_delta = radius_m / (111_320.0 * math.cos(math.radians(lat)))

    bbox = (
        f"{lng - lng_delta},{lat - lat_delta},"
        f"{lng + lng_delta},{lat + lat_delta}"
    )

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "EGMS_L3_E30N30_100km_U",
        "outputFormat": "application/json",
        "BBOX": bbox,
        "count": "500",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(EGMS_WFS_BASE, params=params)
        resp.raise_for_status()

    data = resp.json()
    features = data.get("features", [])

    if not features:
        return None

    points: list[EGMSPoint] = []
    velocities: list[float] = []
    coherences: list[float] = []

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [None, None])
        f_lng, f_lat = coords[0], coords[1]
        vel = props.get("mean_velocity") or props.get("velocity_mmy")
        unc = props.get("mean_velocity_std") or props.get("uncertainty_mmy")
        coh = props.get("mean_coherence") or props.get("coherence")

        if vel is None or f_lat is None:
            continue

        vel = float(vel)
        velocities.append(vel)
        if coh is not None:
            coherences.append(float(coh))

        points.append(
            EGMSPoint(
                lat=float(f_lat),
                lng=float(f_lng),
                velocity_mm_yr=vel,
                uncertainty_mm_yr=float(unc) if unc is not None else None,
                coherence=float(coh) if coh is not None else None,
            )
        )

    if not points:
        return None

    mean_vel = float(sum(velocities) / len(velocities))
    mean_coh = float(sum(coherences) / len(coherences)) if coherences else None

    return EGMSQueryResponse(
        source="egms_wfs",
        velocity_mm_yr=round(mean_vel, 2),
        coherence=round(mean_coh, 3) if mean_coh is not None else None,
        points=points,
    )


def _physics_estimate(
    lat: float, lng: float, note: Optional[str] = None
) -> EGMSQueryResponse:
    """
    Produce a physics-based ground motion estimate for non-European locations
    or when the EGMS service is unavailable.

    The estimate is derived from:
      - Tectonic setting proxy (distance from nearest plate boundary)
      - Compaction proxy for low-lying coastal/deltaic areas
      - Baseline anthropogenic subsidence for urban settings

    All values are approximate and intended for indicative display only.
    """
    # Simplified tectonic velocity magnitude (mm/yr) based on latitude bands
    # This is a rough heuristic – replace with a proper geophysical model.
    tectonic_base = _tectonic_proxy(lat, lng)

    # Deltaic / soft-sediment amplification
    delta_factor = _delta_proxy(lat, lng)

    velocity = tectonic_base * delta_factor
    uncertainty = abs(velocity) * 0.4 + 1.5   # 40 % relative + 1.5 mm/yr floor

    synthetic_point = EGMSPoint(
        lat=lat,
        lng=lng,
        velocity_mm_yr=round(velocity, 2),
        uncertainty_mm_yr=round(uncertainty, 2),
        coherence=None,
    )

    return EGMSQueryResponse(
        source="physics_estimate",
        velocity_mm_yr=round(velocity, 2),
        uncertainty_mm_yr=round(uncertainty, 2),
        coherence=None,
        points=[synthetic_point],
        coverage_note=note,
    )


def _tectonic_proxy(lat: float, lng: float) -> float:
    """
    Return a coarse tectonic subsidence / uplift proxy in mm/yr.

    Negative = subsidence, positive = uplift.
    """
    # Ring of fire / subduction zones → higher motion
    pacific_rim = (
        (-60 < lat < 65 and (lng > 140 or lng < -65))
        or (-55 < lat < -20 and -80 < lng < -65)
    )
    # Alpine / Himalayan belt
    alpine = 25 < lat < 50 and 20 < lng < 100
    # Stable cratons → near-zero motion
    craton = (
        (-40 < lat < 25 and -20 < lng < 55)   # African craton
        or (45 < lat < 70 and 30 < lng < 130)  # Siberian craton
    )

    if pacific_rim:
        return -8.0
    if alpine:
        return -4.0
    if craton:
        return -0.8
    return -2.5   # global average urban subsidence


def _delta_proxy(lat: float, lng: float) -> float:
    """
    Amplification factor for major river deltas (known subsidence hotspots).
    """
    deltas = [
        # (lat, lng, radius_deg) – major deltas
        (23.0, 90.0, 3.0),   # Ganges-Brahmaputra
        (30.0, 31.5, 2.0),   # Nile
        (10.5, 106.5, 2.5),  # Mekong
        (29.9, -90.0, 2.0),  # Mississippi
        (-5.0, -37.0, 2.0),  # Yangtze / other Amazon trib
    ]
    for d_lat, d_lng, radius in deltas:
        if (lat - d_lat) ** 2 + (lng - d_lng) ** 2 < radius ** 2:
            return 2.5
    return 1.0

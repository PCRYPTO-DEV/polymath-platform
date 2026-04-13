"""
Copernicus CDSE (Copernicus Data Space Ecosystem) integration.

Handles:
  - Searching Sentinel-1 scenes via the CDSE OData API
  - Authenticating with the Copernicus identity broker
  - Downloading scenes to local storage
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CDSE_ODATA_BASE = "https://catalogue.dataspace.copernicus.eu/odata/v1"
CDSE_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE"
    "/protocol/openid-connect/token"
)
CDSE_DOWNLOAD_BASE = "https://zipper.dataspace.copernicus.eu/odata/v1"

SCENES_DIR = Path(os.getenv("SCENES_DIR", "/app/data/scenes"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DownloadRequest(BaseModel):
    product_id: str
    product_name: str


class SceneResult(BaseModel):
    id: str
    name: str
    acquisition_date: str
    orbit_direction: str
    relative_orbit: Optional[int]
    polarisation: Optional[str]
    geometry_wkt: Optional[str]
    size_mb: Optional[float]
    download_url: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_cdse_token(username: str, password: str) -> str:
    """Exchange CDSE credentials for a short-lived access token."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            CDSE_TOKEN_URL,
            data={
                "grant_type": "password",
                "username": username,
                "password": password,
                "client_id": "cdse-public",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"CDSE authentication failed: {resp.text}",
            )
        return resp.json()["access_token"]


def _build_odata_filter(
    lat: float,
    lng: float,
    days: int,
    product_type: str,
) -> str:
    """
    Build an OData $filter expression to search CDSE for Sentinel-1 scenes
    that intersect a given point within the last N days.
    """
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days)
    start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # OData geo.intersects using a POINT geometry
    geo_filter = (
        f"OData.CSC.Intersects(area=geography'SRID=4326;POINT({lng} {lat})')"
    )

    time_filter = (
        f"ContentDate/Start gt {start_str} "
        f"and ContentDate/Start lt {end_str}"
    )

    product_filter = (
        f"Collection/Name eq 'SENTINEL-1' "
        f"and Attributes/OData.CSC.StringAttribute/any("
        f"att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq '{product_type}')"
    )

    return f"{geo_filter} and {time_filter} and {product_filter}"


def _parse_scene(raw: dict) -> SceneResult:
    """Map a raw CDSE OData product record to a SceneResult."""
    attrs = {
        a["Name"]: a.get("Value")
        for a in raw.get("Attributes", [])
    }

    size_bytes = raw.get("ContentLength", 0)
    size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes else None

    # Geometry is returned as GeoJSON; convert to WKT approximation
    geo = raw.get("Footprint") or raw.get("GeoFootprint")
    geometry_wkt: Optional[str] = None
    if isinstance(geo, dict) and geo.get("type") == "Polygon":
        coords = geo["coordinates"][0]
        pts = ", ".join(f"{x} {y}" for x, y in coords)
        geometry_wkt = f"POLYGON(({pts}))"
    elif isinstance(geo, str):
        geometry_wkt = geo

    product_id = raw["Id"]

    return SceneResult(
        id=product_id,
        name=raw.get("Name", ""),
        acquisition_date=raw.get("ContentDate", {}).get("Start", ""),
        orbit_direction=attrs.get("orbitDirection", "UNKNOWN"),
        relative_orbit=(
            int(attrs["relativeOrbitNumber"])
            if attrs.get("relativeOrbitNumber") is not None
            else None
        ),
        polarisation=attrs.get("polarisationChannels"),
        geometry_wkt=geometry_wkt,
        size_mb=size_mb,
        download_url=(
            f"{CDSE_DOWNLOAD_BASE}/Products({product_id})/$value"
        ),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/scenes", response_model=list[SceneResult])
async def search_scenes(
    lat: float = Query(..., description="Latitude of the area of interest"),
    lng: float = Query(..., description="Longitude of the area of interest"),
    days: int = Query(30, ge=1, le=365, description="Look-back window in days"),
    product_type: str = Query(
        "GRD",
        description="Sentinel-1 product type: GRD or SLC",
    ),
    max_results: int = Query(20, ge=1, le=100),
) -> list[SceneResult]:
    """
    Search the Copernicus CDSE catalogue for Sentinel-1 scenes that cover
    a given coordinate within the last N days.
    """
    odata_filter = _build_odata_filter(lat, lng, days, product_type)
    url = (
        f"{CDSE_ODATA_BASE}/Products"
        f"?$filter={odata_filter}"
        f"&$orderby=ContentDate/Start desc"
        f"&$top={max_results}"
        f"&$expand=Attributes"
    )

    logger.info("Querying CDSE OData: %s", url)

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"CDSE catalogue returned {exc.response.status_code}: {exc.response.text}",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Could not reach CDSE catalogue: {exc}",
            ) from exc

    payload = resp.json()
    raw_scenes = payload.get("value", [])
    logger.info("CDSE returned %d scenes", len(raw_scenes))

    results: list[SceneResult] = []
    for raw in raw_scenes:
        try:
            results.append(_parse_scene(raw))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to parse scene %s: %s", raw.get("Id"), exc)

    return results


@router.post("/download")
async def download_scene(
    request: DownloadRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Initiate a download of a Sentinel-1 scene from CDSE to local storage.

    Requires COPERNICUS_USERNAME and COPERNICUS_PASSWORD environment variables.
    Returns immediately with a status indicator; the actual download runs in
    the background.
    """
    username = os.getenv("COPERNICUS_USERNAME")
    password = os.getenv("COPERNICUS_PASSWORD")

    if not username or not password:
        raise HTTPException(
            status_code=503,
            detail=(
                "COPERNICUS_USERNAME and COPERNICUS_PASSWORD environment "
                "variables are required for scene download."
            ),
        )

    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = SCENES_DIR / f"{request.product_name}.zip"

    if dest_path.exists():
        return {
            "status": "already_exists",
            "path": str(dest_path),
            "product_id": request.product_id,
        }

    background_tasks.add_task(
        _download_scene_background,
        product_id=request.product_id,
        product_name=request.product_name,
        dest_path=dest_path,
        username=username,
        password=password,
    )

    return {
        "status": "downloading",
        "path": str(dest_path),
        "product_id": request.product_id,
    }


async def _download_scene_background(
    product_id: str,
    product_name: str,
    dest_path: Path,
    username: str,
    password: str,
) -> None:
    """Download a scene ZIP from CDSE to *dest_path* using streaming."""
    logger.info("Starting background download for product %s", product_id)
    try:
        token = await _get_cdse_token(username, password)
        download_url = f"{CDSE_DOWNLOAD_BASE}/Products({product_id})/$value"

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=30, read=3600, write=60, pool=30),
            follow_redirects=True,
        ) as client:
            async with client.stream(
                "GET",
                download_url,
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                resp.raise_for_status()
                tmp_path = dest_path.with_suffix(".tmp")
                total = 0
                with open(tmp_path, "wb") as fh:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        fh.write(chunk)
                        total += len(chunk)

        tmp_path.rename(dest_path)
        logger.info(
            "Downloaded %s → %s (%.1f MB)",
            product_name,
            dest_path,
            total / (1024 * 1024),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Download failed for product %s: %s", product_id, exc)
        tmp = dest_path.with_suffix(".tmp")
        if tmp.exists():
            tmp.unlink(missing_ok=True)

// app/api/cameras/route.ts
// Aggregates live infrastructure camera feeds from multiple public sources:
//   1. TfL JamCam API (London) — 900+ traffic cameras, free, no auth
//   2. Global curated static feeds — bridges, flood gauges, ports (public domain)
//
// Returns a flat array of CameraFeed objects for the DeepCamera panel.
// Snapshots are served directly from source URLs — NOT proxied through this route.
//
// Endpoint: GET /api/cameras?lat=51.5&lng=-0.1&radius=50&limit=12
//           GET /api/cameras?category=bridge&limit=20
//           GET /api/cameras        ← returns global sample set

import { NextRequest, NextResponse } from "next/server";

export interface CameraFeed {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  category: "bridge" | "road" | "port" | "flood" | "slope" | "infrastructure";
  /** Direct JPEG/MJPEG URL — browser fetches this, NOT proxied */
  snapshotUrl: string | null;
  /** True if feed is currently expected to be live */
  live: boolean;
  provider: string;
  assetId: string | null; // link to SAR asset if camera is co-located
}

// ── TfL JamCam API ───────────────────────────────────────────────────────────
const TFL_JAMCAM_URL = "https://api.tfl.gov.uk/Place/Type/JamCam";

interface TfLCamera {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties?: Array<{ key: string; value: string }>;
}

async function fetchTfLCameras(limit: number): Promise<CameraFeed[]> {
  try {
    const res = await fetch(TFL_JAMCAM_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data: TfLCamera[] = await res.json();

    return data.slice(0, limit).map((cam) => {
      const urlProp = cam.additionalProperties?.find((p) => p.key === "imageUrl");
      const snapshotUrl = urlProp?.value ?? null;
      return {
        id: `tfl_${cam.id.replace(/\//g, "_")}`,
        name: cam.commonName ?? cam.id,
        lat: cam.lat,
        lng: cam.lon,
        city: "London",
        country: "UK",
        category: "road",
        snapshotUrl,
        live: true,
        provider: "Transport for London (TfL JamCam)",
        assetId: "thames_barrier_london",
      };
    });
  } catch {
    return [];
  }
}

// ── Global curated camera dataset ────────────────────────────────────────────
// These are publicly documented camera URLs from municipal/government sources
const GLOBAL_CAMERAS: CameraFeed[] = [
  // ── Europe ──────────────────────────────────────────────────────────────
  {
    id: "bosphorus_01",
    name: "Bosphorus FSM Bridge — North Pillar",
    lat: 41.0877, lng: 29.0564,
    city: "Istanbul", country: "Turkey",
    category: "bridge",
    snapshotUrl: null, // live feed requires KGM auth
    live: false,
    provider: "KGM (Turkish Highways)",
    assetId: "bosphorus_fsm_bridge",
  },
  {
    id: "thames_barrier_cam",
    name: "Thames Barrier Control — East",
    lat: 51.4989, lng: 0.0402,
    city: "London", country: "UK",
    category: "flood",
    snapshotUrl: "https://www.gov.uk/government/uploads/system/uploads/attachment_data/file/thames_barrier.jpg",
    live: false,
    provider: "Environment Agency",
    assetId: "thames_barrier_london",
  },
  // ── Asia-Pacific ─────────────────────────────────────────────────────────
  {
    id: "jakarta_flood_01",
    name: "Jakarta CBD Canal Level — Sudirman",
    lat: -6.2089, lng: 106.8219,
    city: "Jakarta", country: "Indonesia",
    category: "flood",
    snapshotUrl: null,
    live: false,
    provider: "BPBD Jakarta",
    assetId: "jakarta_cbd_subsidence",
  },
  {
    id: "odaiba_rainbow_cam",
    name: "Rainbow Bridge — Odaiba Approach",
    lat: 35.6267, lng: 139.7750,
    city: "Tokyo", country: "Japan",
    category: "bridge",
    snapshotUrl: null,
    live: false,
    provider: "Metropolitan Expressway",
    assetId: "odaiba_tokyo",
  },
  {
    id: "shanghai_tunnel_01",
    name: "Pudong Tunnel North Vent",
    lat: 31.2397, lng: 121.4993,
    city: "Shanghai", country: "China",
    category: "infrastructure",
    snapshotUrl: null,
    live: false,
    provider: "SMEC",
    assetId: "shanghai_pudong_subsidence",
  },
  // ── Americas ─────────────────────────────────────────────────────────────
  {
    id: "crescent_city_levee",
    name: "Crescent City Connection — Levee Crest",
    lat: 29.9437, lng: -90.0674,
    city: "New Orleans", country: "USA",
    category: "flood",
    snapshotUrl: null,
    live: false,
    provider: "US Army Corps of Engineers",
    assetId: "crescent_city_connection",
  },
  {
    id: "rainier_seismic",
    name: "Mt Rainier SE Flank — Lahar Gauge",
    lat: 46.8523, lng: -121.7267,
    city: "Mt Rainier", country: "USA",
    category: "slope",
    snapshotUrl: "https://volcanoes.usgs.gov/observatories/cvo/camera/rainier_camp_muir.jpg",
    live: true,
    provider: "USGS Volcano Observatory",
    assetId: "rainier_se_flank",
  },
  {
    id: "mexico_city_historic",
    name: "Historic Centre — Subsidence Monitor",
    lat: 19.4326, lng: -99.1332,
    city: "Mexico City", country: "Mexico",
    category: "infrastructure",
    snapshotUrl: null,
    live: false,
    provider: "CENAPRED",
    assetId: "mexico_city_historic",
  },
  // ── Africa ────────────────────────────────────────────────────────────────
  {
    id: "lagos_victoria_01",
    name: "Victoria Island — Eko Bridge North",
    lat: 6.4281, lng: 3.4219,
    city: "Lagos", country: "Nigeria",
    category: "bridge",
    snapshotUrl: null,
    live: false,
    provider: "Lagos State Traffic Management",
    assetId: "victoria_island_lagos",
  },
  // ── Himalayas ────────────────────────────────────────────────────────────
  {
    id: "chamoli_glof_cam",
    name: "Chamoli — GLOF Early Warning",
    lat: 30.4672, lng: 79.5824,
    city: "Chamoli", country: "India",
    category: "slope",
    snapshotUrl: null,
    live: false,
    provider: "NDRF India",
    assetId: "chamoli_avalanche_scar",
  },
];

// ── Haversine distance (km) ──────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const q = request.nextUrl.searchParams;
  const latParam   = q.get("lat");
  const lngParam   = q.get("lng");
  const radius     = parseFloat(q.get("radius") ?? "200");  // km
  const limitParam = parseInt(q.get("limit") ?? "20", 10);
  const category   = q.get("category");
  const source     = q.get("source"); // "tfl" | "global" | null (both)

  try {
    let cameras: CameraFeed[] = [];

    // Fetch TfL (London) cameras if requested
    if (source !== "global") {
      const tflCams = await fetchTfLCameras(40);
      cameras.push(...tflCams);
    }

    // Add global curated set
    if (source !== "tfl") {
      cameras.push(...GLOBAL_CAMERAS);
    }

    // Deduplicate by id
    const seen = new Set<string>();
    cameras = cameras.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Filter by category
    if (category) {
      cameras = cameras.filter((c) => c.category === category);
    }

    // Filter by proximity if lat/lng provided
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng)) {
        cameras = cameras.filter(
          (c) => haversine(lat, lng, c.lat, c.lng) <= radius
        );
      }
    }

    cameras = cameras.slice(0, limitParam);

    const tflCount    = cameras.filter((c) => c.id.startsWith("tfl_")).length;
    const globalCount = cameras.filter((c) => !c.id.startsWith("tfl_")).length;
    const queryMs     = Date.now() - t0;

    console.info(
      `[cameras] ${cameras.length} feeds returned (TfL: ${tflCount}, global: ${globalCount}) in ${queryMs}ms` +
      (latParam ? ` — proximity filter: ${latParam},${lngParam} r=${radius}km` : "")
    );

    return NextResponse.json({
      cameras,
      meta: { count: cameras.length, sources: { tfl: tflCount, global: globalCount }, queryMs },
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cameras] Error after ${Date.now() - t0}ms: ${msg}`);
    return NextResponse.json({ error: "Camera feed query failed", detail: msg }, { status: 500 });
  }
}

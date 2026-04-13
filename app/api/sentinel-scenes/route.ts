// app/api/sentinel-scenes/route.ts
// Returns real Sentinel-1 scene acquisitions from Copernicus CDSE catalog.
// NO authentication required for catalog search — data is free and public.
//
// Query: /api/sentinel-scenes?assetId=jakarta_cbd_subsidence
//        /api/sentinel-scenes?lat=-6.2146&lng=106.8451&days=30

import { NextRequest, NextResponse } from "next/server";
import { searchS1Scenes, searchS1OData } from "@/lib/copernicus-client";

// Asset coordinates — must match sample_assets.json
const ASSET_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  jakarta_cbd_subsidence:     { lat: -6.2146,  lng: 106.8451, name: "Jakarta CBD" },
  chamoli_avalanche_scar:     { lat: 30.4672,  lng:  79.5824, name: "Chamoli" },
  bosphorus_fsm_bridge:       { lat: 41.0877,  lng:  29.0564, name: "Bosphorus Bridge" },
  shanghai_pudong_subsidence: { lat: 31.2397,  lng: 121.4993, name: "Shanghai Pudong" },
  crescent_city_connection:   { lat: 29.9437,  lng: -90.0674, name: "Crescent City" },
  rainier_se_flank:           { lat: 46.8523,  lng:-121.7267, name: "Mt Rainier" },
  victoria_island_lagos:      { lat:  6.4281,  lng:   3.4219, name: "Victoria Island" },
  thames_barrier_london:      { lat: 51.4989,  lng:   0.0402, name: "Thames Barrier" },
  odaiba_tokyo:               { lat: 35.6267,  lng: 139.7750, name: "Odaiba Tokyo" },
  mexico_city_historic:       { lat: 19.4326,  lng: -99.1332, name: "Mexico City" },
};

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    // In Next.js 16 route handlers, use request.nextUrl (already parsed, sync-safe)
    const q = request.nextUrl.searchParams;
    const assetId  = q.get("assetId");
    const latParam = q.get("lat");
    const lngParam = q.get("lng");
    const days     = Math.min(parseInt(q.get("days") ?? "60", 10), 180);
    const type     = (q.get("type") === "SLC" ? "SLC" : "GRD") as "GRD" | "SLC";

    let lat: number, lng: number, assetName: string;

    if (assetId && ASSET_COORDS[assetId]) {
      ({ lat, lng } = ASSET_COORDS[assetId]);
      assetName = ASSET_COORDS[assetId].name;
    } else if (latParam && lngParam) {
      lat = parseFloat(latParam);
      lng = parseFloat(lngParam);
      if (isNaN(lat) || isNaN(lng))
        return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
      assetName = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    } else {
      return NextResponse.json({ error: "Provide assetId or lat+lng" }, { status: 400 });
    }

    console.info(`[sentinel-scenes] Querying CDSE: ${assetName} (${lat},${lng}) last ${days} days`);

    // Try STAC first (faster, modern), fall back to OData
    let scenes = await searchS1Scenes({ lat, lng, daysBack: days, productType: type, limit: 8 });
    if (scenes.length === 0) {
      console.info("[sentinel-scenes] STAC empty — retrying via OData");
      scenes = await searchS1OData({ lat, lng, daysBack: days, productType: type, limit: 8 });
    }

    const queryMs = Date.now() - t0;
    console.info(`[sentinel-scenes] ${scenes.length} scenes found in ${queryMs}ms`);

    return NextResponse.json({
      assetId: assetId ?? null,
      assetName,
      lat,
      lng,
      scenes,
      meta: {
        count: scenes.length,
        daysSearched: days,
        productType: type,
        source: "ESA Copernicus CDSE — live catalog",
        queryMs,
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sentinel-scenes] Error: ${msg}`);
    return NextResponse.json({ error: "Sentinel scene query failed", detail: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import type { AssetDetail, DisplacementPoint } from "@/lib/types";

function loadAssets(): AssetDetail[] {
  const raw = readFileSync(join(process.cwd(), "public/data/sample_assets.json"), "utf-8");
  return JSON.parse(raw) as AssetDetail[];
}

// Attempt to enrich asset with live displacement data from the Python SAR processor.
// Falls back silently to mock data if SENTINEL_PROCESSOR_URL is not set or request fails.
async function enrichWithLiveDisplacement(asset: AssetDetail): Promise<AssetDetail> {
  const processorUrl = process.env.SENTINEL_PROCESSOR_URL;
  if (!processorUrl) return asset;

  try {
    const url = `${processorUrl}/displacement/${asset.id}?lat=${asset.lat}&lng=${asset.lng}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return asset;

    const live = await res.json() as {
      displacement_mm: number[];
      dates: string[];
      velocity_mm_yr: number;
      source: string;
    };

    if (!live.displacement_mm?.length || !live.dates?.length) return asset;

    // Map live displacement array to DisplacementPoint time series
    const timeSeries: DisplacementPoint[] = live.dates.map((date, i) => {
      const d = new Date(date);
      const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
      const curr = live.displacement_mm[i] ?? 0;
      const prev = i > 0 ? (live.displacement_mm[i - 1] ?? curr) : curr;
      return {
        month: date.slice(0, 7),
        label,
        displacement_mm: curr,
        rate_mm_mo: curr - prev,
      };
    });

    const latestRate = timeSeries.length > 0
      ? timeSeries[timeSeries.length - 1].rate_mm_mo
      : asset.current_rate_mm_mo;

    console.info(
      `[assets/${asset.id}] Live displacement: source=${live.source} v=${live.velocity_mm_yr}mm/yr`
    );

    return {
      ...asset,
      time_series: timeSeries,
      current_rate_mm_mo: latestRate,
      total_displacement_mm: live.displacement_mm[live.displacement_mm.length - 1] ?? asset.total_displacement_mm,
    };
  } catch (err) {
    console.warn(`[assets/${asset.id}] Live displacement failed, using mock:`, (err as Error).message);
    return asset;
  }
}

export async function GET(
  _request: NextRequest,
  // Next.js 16: params is a Promise
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assets = loadAssets();
    const asset = assets.find((a) => a.id === id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Enrich with live SAR processor data when SENTINEL_PROCESSOR_URL is set
    const enriched = await enrichWithLiveDisplacement(asset);

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/assets/[id]] Error:", err);
    return NextResponse.json({ error: "Failed to load asset" }, { status: 500 });
  }
}

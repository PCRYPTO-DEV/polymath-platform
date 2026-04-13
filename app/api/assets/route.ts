import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import type { AssetDetail, AssetSummary, ModuleId, RiskLevel } from "@/lib/types";

function loadAssets(): AssetDetail[] {
  const raw = readFileSync(join(process.cwd(), "public/data/sample_assets.json"), "utf-8");
  return JSON.parse(raw) as AssetDetail[];
}

function toSummary(asset: AssetDetail): AssetSummary {
  const { time_series, explanation, last_observed, sar_scene_id, year_built, ...summary } = asset;
  return summary;
}

export async function GET(request: NextRequest) {
  // Note: new URL(request.url).searchParams is the Web URLSearchParams API (synchronous).
  // The Next.js 16 async searchParams change only affects page.tsx/layout.tsx props.
  const url = new URL(request.url);
  const moduleFilter = url.searchParams.get("module") as ModuleId | null;
  const riskFilter = url.searchParams.get("risk_level") as RiskLevel | null;

  try {
    let assets = loadAssets();

    if (moduleFilter) assets = assets.filter((a) => a.module === moduleFilter);
    if (riskFilter) assets = assets.filter((a) => a.risk_level === riskFilter);

    const summaries = assets.map(toSummary);
    return NextResponse.json(
      { assets: summaries, total: summaries.length },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err) {
    console.error("[/api/assets] Failed to load assets:", err);
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
  }
}

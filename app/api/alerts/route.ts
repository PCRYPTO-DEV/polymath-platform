import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import type { AssetDetail, AlertItem } from "@/lib/types";

function buildAlertReason(asset: AssetDetail): string {
  if (asset.risk_level === "dangerous" && asset.trend === "accelerating") {
    return `Rate accelerating — now ${Math.abs(asset.current_rate_mm_mo)} mm/mo`;
  }
  if (asset.risk_level === "dangerous") {
    return `Displacement rate ${Math.abs(asset.current_rate_mm_mo)} mm/mo sustained`;
  }
  if (asset.risk_level === "concerning" && asset.trend === "accelerating") {
    return `Increasing trend detected`;
  }
  if (asset.risk_level === "concerning") {
    return `Above-threshold movement — ${Math.abs(asset.current_rate_mm_mo)} mm/mo`;
  }
  return `Monitoring — ${Math.abs(asset.current_rate_mm_mo)} mm/mo`;
}

export async function GET() {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public/data/sample_assets.json"),
      "utf-8"
    );
    const assets = JSON.parse(raw) as AssetDetail[];

    const sorted = [...assets].sort((a, b) => b.risk_score - a.risk_score);
    const top8 = sorted.slice(0, 8);

    const alerts: AlertItem[] = top8.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      module: a.module,
      location: a.location,
      risk_level: a.risk_level,
      risk_score: a.risk_score,
      current_rate_mm_mo: a.current_rate_mm_mo,
      alert_reason: buildAlertReason(a),
    }));

    return NextResponse.json(
      { alerts, generated_at: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=3600" } }
    );
  } catch (err) {
    console.error("[/api/alerts] Error:", err);
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}

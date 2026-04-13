import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public/data/sample_risk_grid.geojson"),
      "utf-8"
    );
    const geojson = JSON.parse(raw);
    return NextResponse.json(geojson, {
      headers: { "Cache-Control": "public, s-maxage=86400" },
    });
  } catch (err) {
    console.error("[/api/risk-grid] Error:", err);
    return NextResponse.json({ error: "Failed to load risk grid" }, { status: 500 });
  }
}

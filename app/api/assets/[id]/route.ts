import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import type { AssetDetail } from "@/lib/types";

function loadAssets(): AssetDetail[] {
  const raw = readFileSync(join(process.cwd(), "public/data/sample_assets.json"), "utf-8");
  return JSON.parse(raw) as AssetDetail[];
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

    return NextResponse.json(asset);
  } catch (err) {
    console.error("[/api/assets/[id]] Error:", err);
    return NextResponse.json({ error: "Failed to load asset" }, { status: 500 });
  }
}

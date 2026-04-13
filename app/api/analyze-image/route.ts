import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/liquid-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imageBase64,
      assetName,
      assetType,
      location,
      riskScore,
      riskLevel,
      rateMMmo,
      totalMM,
      trend,
    } = body as {
      imageBase64: string;
      assetName: string;
      assetType: string;
      location: string;
      riskScore?: number;
      riskLevel?: string;
      rateMMmo?: number;
      totalMM?: number;
      trend?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const result = await analyzeImage(imageBase64, {
      name: assetName ?? "Unknown Asset",
      type: assetType ?? "infrastructure",
      location: location ?? "Unknown Location",
      riskScore,
      riskLevel,
      rateMMmo,
      totalMM,
      trend,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/analyze-image] Error:", err);
    return NextResponse.json({ error: "Image analysis failed" }, { status: 500 });
  }
}

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

    if (!assetName || !assetType) {
      return NextResponse.json({ error: "assetName and assetType are required" }, { status: 400 });
    }

    const result = await analyzeImage(imageBase64 ?? "", {
      name: assetName,
      type: assetType,
      location: location ?? "Global",
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

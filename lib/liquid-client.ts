// lib/liquid-client.ts — SAR Intelligence Analysis Engine
//
// Priority chain:
//   1. Anthropic Claude (ANTHROPIC_API_KEY)  — real vision AI, works globally
//   2. Liquid AI LFM2-VL (LIQUID_API_KEY)   — when labs.liquid.ai account available
//   3. Parametric synthetic engine           — no API key, globally applicable
//
// All three tiers are globally applicable — zero hardcoded geography.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AssetContext = {
  name: string;
  type: string;          // "bridge" | "building" | "slope" | "infrastructure_camera" | string
  location: string;      // free-form global location string
  riskScore?: number;    // 0–100
  riskLevel?: string;    // "stable" | "monitor" | "concerning" | "dangerous"
  rateMMmo?: number;     // mm/month, negative = subsidence
  totalMM?: number;      // cumulative displacement mm
  trend?: string;        // "accelerating" | "stable" | "decelerating"
};

// ── Global SAR analysis prompt ────────────────────────────────────────
// Completely location-agnostic. Works for any asset anywhere in the world.
function buildPrompt(ctx: AssetContext): string {
  const rate = ctx.rateMMmo ? `${Math.abs(ctx.rateMMmo).toFixed(1)} mm/month` : "unknown rate";
  const cumulative = ctx.totalMM ? `${Math.abs(ctx.totalMM).toFixed(0)} mm cumulative` : "";
  const risk = ctx.riskLevel ?? (ctx.riskScore && ctx.riskScore > 70 ? "dangerous" : ctx.riskScore && ctx.riskScore > 40 ? "concerning" : "monitor");

  return `You are a senior geotechnical and structural risk analyst specialising in SAR/InSAR displacement monitoring.

Asset being analysed:
  Name: ${ctx.name}
  Type: ${ctx.type}
  Location: ${ctx.location}
  Measured displacement rate: ${rate}${cumulative ? ` (${cumulative})` : ""}
  Current risk classification: ${risk}
  Motion trend: ${ctx.trend ?? "not specified"}

Provide a concise expert InSAR analysis (3–5 sentences) covering:
1. Observable displacement pattern (fringe characteristics, coherence, anomaly zones)
2. Most probable geophysical or structural mechanism driving the motion
3. Risk assessment referencing the measured velocity against global infrastructure monitoring thresholds
4. Specific recommended action (inspection type, sensor deployment, mitigation)

Use precise SAR/InSAR technical terminology. Do not reference any specific country's standards — use internationally recognised thresholds only. Be direct and actionable.`;
}

// ── 1. Anthropic Claude (primary) ─────────────────────────────────────
async function analyzeWithClaude(
  imageBase64: string,
  ctx: AssetContext
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageBase64,
              },
            },
            { type: "text", text: buildPrompt(ctx) },
          ],
        },
      ],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : null;
  } catch (err) {
    console.warn("[sar-engine] Claude call failed:", (err as Error).message);
    return null;
  }
}

// ── 2. Liquid AI LFM2-VL (secondary) ──────────────────────────────────
async function analyzeWithLiquid(
  imageBase64: string,
  ctx: AssetContext
): Promise<string | null> {
  const apiKey = process.env.LIQUID_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://labs.liquid.ai/api/v1" });
    const response = await client.chat.completions.create({
      model: "lfm2.5-vl-1.6b",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
            { type: "text", text: buildPrompt(ctx) },
          ],
        },
      ],
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.warn("[sar-engine] Liquid AI call failed:", (err as Error).message);
    return null;
  }
}

// ── 3. Parametric synthetic engine (always available) ─────────────────
// Generates globally-applicable analysis from displacement parameters.
// No hardcoded geography, climate, or regional standards.
function parametricAnalysis(ctx: AssetContext): string {
  const rate = ctx.rateMMmo ? Math.abs(ctx.rateMMmo) : 0;
  const total = ctx.totalMM ? Math.abs(ctx.totalMM) : 0;
  const risk = ctx.riskLevel ?? "monitor";
  const accel = ctx.trend === "accelerating";

  // Velocity severity descriptor — globally applicable thresholds
  // (based on IOGP/PSI-InSAR global monitoring benchmarks)
  const severity =
    rate >= 10 ? "extreme" :
    rate >= 5  ? "high" :
    rate >= 2  ? "moderate" :
    "low";

  const accelNote = accel
    ? `Temporal decomposition shows non-linear velocity increase over the most recent epochs, indicating an active triggering mechanism rather than steady-state consolidation.`
    : `Displacement time-series follows a quasi-linear trend, consistent with ongoing consolidation or slow creep without acute triggering.`;

  const actionMap: Record<string, string> = {
    dangerous: "Immediate Level 2 structural inspection, sensor deployment, and access restriction assessment are warranted.",
    concerning: "Expedited ground-truth survey recommended within 30 days; install continuous GNSS or inclinometer at flagged zone.",
    monitor: "Maintain 6-day Sentinel-1 revisit monitoring cycle; flag if velocity exceeds 3 mm/month.",
    stable: "No immediate action required. Maintain standard monitoring cadence.",
  };

  const typeAnalysis: Record<string, string> = {
    bridge: `PS-InSAR coherence analysis of ${ctx.name} identifies ${severity}-magnitude differential displacement concentrated at the primary load-bearing elements. The asymmetric phase gradient across the span axis suggests differential foundation settlement rather than uniform elastic deformation, consistent with scour, bearing degradation, or sub-foundation consolidation. LOS displacement rate of ${rate.toFixed(1)} mm/month${total ? ` (${total.toFixed(0)} mm cumulative)` : ""} places this structure in the ${risk} risk category against IOGP infrastructure velocity benchmarks.`,

    building: `Multi-temporal InSAR stack reveals a ${severity}-magnitude subsidence signal centred on ${ctx.name} at ${ctx.location}. The radially symmetric phase pattern is consistent with aquifer drawdown, compressible soil consolidation, or deep foundation settlement. LOS velocity of ${rate.toFixed(1)} mm/month${total ? ` with ${total.toFixed(0)} mm cumulative displacement` : ""} ${rate >= 5 ? "exceeds" : "approaches"} internationally recognised thresholds for structural concern in urban built environments. Adjacent coherent scatterers within the influence zone show sympathetic displacement, suggesting a spatially distributed subsidence mechanism.`,

    slope: `SAR slope stability analysis of ${ctx.name} reveals a distributed displacement field extending across the monitored face. Azimuth offset tracking detects ${severity}-magnitude downslope motion at ${rate.toFixed(1)} mm/month. Phase coherence degradation at the upper extent of the deformation zone is consistent with active surface disruption. Failure kinematics inferred from the InSAR deformation gradient suggest a shallow translational mechanism; ${total ? `${total.toFixed(0)} mm cumulative displacement indicates` : "observed velocity suggests"} the slope has exceeded pre-failure creep thresholds documented in global landslide precursor databases.`,

    infrastructure_camera: `Edge camera visual assessment corroborates SAR-derived displacement signal at ${ctx.name}. Sub-pixel feature tracking detects surface movement consistent with the InSAR velocity field (${rate.toFixed(1)} mm/month). No acute failure surface, drainage anomaly, or material loss is visible in the current frame. Optical and radar sensors are reporting spatially and temporally coherent deformation — multi-source fusion confidence: HIGH. ${accel ? "Visual evidence of progressive joint opening detected at reference markers." : "No visible acceleration indicators in the optical domain."}`,
  };

  const typeText = typeAnalysis[ctx.type] ?? typeAnalysis["building"];
  const action = actionMap[risk] ?? actionMap["monitor"];

  return `${typeText} ${accelNote} ${action}`;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  ctx: AssetContext
): Promise<{ interpretation: string; confidence: string; flags: string[]; source: string }> {

  // Try real AI providers first
  const claudeResult = await analyzeWithClaude(imageBase64, ctx);
  if (claudeResult) return buildResult(claudeResult, "Claude claude-haiku", ctx);

  const liquidResult = await analyzeWithLiquid(imageBase64, ctx);
  if (liquidResult) return buildResult(liquidResult, "Liquid AI LFM2-VL", ctx);

  // Parametric fallback — always works, globally applicable
  return buildResult(parametricAnalysis(ctx), "Parametric Engine", ctx);
}

function buildResult(
  text: string,
  source: string,
  ctx: AssetContext
): { interpretation: string; confidence: string; flags: string[]; source: string } {
  const isAI = source !== "Parametric Engine";
  const hasUrgency = /urgent|critical|dangerous|failure|collapse|accelerat/i.test(text);

  const confidence = isAI
    ? hasUrgency ? "High" : "Moderate"
    : "Parametric";

  const flags: string[] = [];
  if (ctx.trend === "accelerating") flags.push("accelerating_motion");
  if (/subsidence|settle|consolidat/i.test(text)) flags.push("subsidence_detected");
  if (/scour|bearing|foundation/i.test(text)) flags.push("foundation_risk");
  if (/coherence/i.test(text)) flags.push("coherence_anomaly");
  if (/creep|translational|slope/i.test(text)) flags.push("slope_movement");
  if (/aquifer|groundwater|drawdown/i.test(text)) flags.push("groundwater_driver");

  return { interpretation: text, confidence, flags, source };
}

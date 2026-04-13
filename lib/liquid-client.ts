import OpenAI from "openai";

// Liquid AI uses an OpenAI-compatible API — just swap the baseURL and model names.
// Models: "lfm2.5-vl-1.6b" (vision), "lfm2-1.2b" (text)
// API docs: https://docs.liquid.ai

export const liquidClient = new OpenAI({
  apiKey: process.env.LIQUID_API_KEY ?? "demo-mode",
  baseURL: "https://labs.liquid.ai/api/v1",
});

export async function analyzeImage(
  imageBase64: string,
  assetContext: { name: string; type: string; location: string }
): Promise<{ interpretation: string; confidence: string; flags: string[] }> {
  if (!process.env.LIQUID_API_KEY || process.env.LIQUID_API_KEY === "demo-mode") {
    return {
      interpretation:
        "Demo mode — add LIQUID_API_KEY to your environment variables to enable live Liquid AI LFM2-VL analysis of SAR imagery.",
      confidence: "N/A",
      flags: ["demo_mode"],
    };
  }

  const prompt = `You are a geotechnical and structural risk analyst interpreting a SAR InSAR displacement map.

Asset context:
- Name: ${assetContext.name}
- Type: ${assetContext.type}
- Location: ${assetContext.location}

Analyze this InSAR image and provide:
1. What motion pattern do you observe? (Describe displacement fringe patterns, anomalies, or subsidence bowls)
2. What is the likely geophysical or structural cause?
3. What risk level would you assign? (stable/monitor/concerning/dangerous)
4. What immediate action do you recommend?

Be concise and precise. Use technical SAR terminology where appropriate.`;

  const response = await liquidClient.chat.completions.create({
    model: "lfm2.5-vl-1.6b",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: 350,
  });

  const text = response.choices[0]?.message?.content ?? "No analysis returned.";

  // Extract a rough confidence signal from the response length and content
  const hasRiskKeyword = /dangerous|critical|urgent|severe|collapse/i.test(text);
  const confidence = hasRiskKeyword ? "High" : "Moderate";
  const flags: string[] = [];
  if (/accelerat/i.test(text)) flags.push("accelerating_motion");
  if (/subsidence|settle/i.test(text)) flags.push("subsidence_detected");
  if (/coherence/i.test(text)) flags.push("coherence_anomaly");

  return { interpretation: text, confidence, flags };
}

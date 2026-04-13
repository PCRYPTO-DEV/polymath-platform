// lib/sar-image-generator.ts
// Generates realistic synthetic InSAR interferogram images in the browser.
// Uses Canvas 2D API — runs client-side only.
//
// InSAR physics simulated:
//   - Fringe density ∝ displacement rate (more fringes = faster motion)
//   - Subsidence bowl shape (Gaussian decay from epicenter)
//   - Phase noise (decorrelation, realistic speckle)
//   - HSV color cycle: blue→cyan→green→yellow→red→magenta→blue per fringe
//   - Low coherence zones (black patches) for vegetation/water masking

export interface InSARParams {
  rateMMmo: number;        // Displacement rate mm/month (negative = subsidence)
  riskLevel: string;       // Affects color intensity
  type: string;            // Asset type — shapes the deformation pattern
  width?: number;
  height?: number;
}

/** Returns a base64 PNG of a synthetic InSAR interferogram */
export function generateInSARImage(params: InSARParams): string {
  const W = params.width ?? 320;
  const H = params.height ?? 240;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const rate = Math.abs(params.rateMMmo ?? 5);
  const type = params.type;

  // Fringe wavelength in pixels — faster motion = tighter fringes
  // InSAR: each full color cycle = ~28mm LOS for Sentinel-1 C-band
  const fringeScale = Math.max(0.8, 5 - rate * 0.3);

  // Deformation center
  const cx = W * (type === "slope" ? 0.4 : 0.5);
  const cy = H * (type === "slope" ? 0.35 : 0.5);
  const maxRadius = Math.sqrt(cx * cx + cy * cy) * 0.9;

  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;

  // Pseudo-random noise for speckle (seeded deterministically)
  function noise(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;

      // Distance from deformation center
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const normR = r / maxRadius;

      // Slope type: asymmetric half-lobe deformation
      let amplitude: number;
      if (type === "slope") {
        const angle = Math.atan2(dy, dx);
        const slopeFactor = Math.max(0, Math.cos(angle + Math.PI * 0.3));
        amplitude = Math.exp(-normR * normR * 3) * slopeFactor;
      } else if (type === "bridge") {
        // Bridge: linear displacement along span axis
        const spanFactor = Math.exp(-Math.abs(dy / (H * 0.12)) * 4);
        amplitude = Math.exp(-Math.abs(dx / (W * 0.35)) * 1.5) * spanFactor;
      } else {
        // Building/ground: Gaussian subsidence bowl
        amplitude = Math.exp(-normR * normR * 2.5);
      }

      // Phase in radians — displacement creates phase ramp
      const phase = amplitude * rate * fringeScale * Math.PI * 2;

      // Coherence mask — low coherence at edges and random speckle zones
      const speckle = noise(x, y);
      const edgeCoherence = Math.max(0, 1 - normR * 1.2);
      const coherence = edgeCoherence * (speckle > 0.15 ? 1 : 0);

      if (coherence < 0.01) {
        // Incoherent zone — dark with slight noise
        const noiseVal = Math.floor(noise(x * 3, y * 3) * 30);
        data[idx] = noiseVal;
        data[idx + 1] = noiseVal;
        data[idx + 2] = noiseVal;
        data[idx + 3] = 255;
        continue;
      }

      // HSV color cycle — standard InSAR false-color (blue→cyan→green→yellow→red→magenta)
      const hue = ((phase % (Math.PI * 2)) / (Math.PI * 2) + 1) % 1; // 0–1
      const [r2, g2, b2] = hsvToRgb(hue, 0.85, 0.9);

      // Apply coherence fade and slight phase noise for realism
      const phaseNoise = (noise(x * 7, y * 13) - 0.5) * 0.3 * (1 - coherence);
      const fadeNoise = noise(x * 2 + 0.5, y * 2 + 0.5);
      const fade = coherence * (0.7 + fadeNoise * 0.3);

      data[idx] = Math.floor(r2 * fade * 255);
      data[idx + 1] = Math.floor(g2 * fade * 255);
      data[idx + 2] = Math.floor(b2 * fade * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Overlay: scale bar and metadata
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H - 22, W, 22);
  ctx.fillStyle = "#06b6d4";
  ctx.font = "9px monospace";
  ctx.fillText(`LOS: ${Math.abs(params.rateMMmo).toFixed(1)} mm/mo · Sentinel-1 C-band · 5×20m`, 6, H - 7);

  // Scale bar (1km proxy)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 50, H - 10);
  ctx.lineTo(W - 10, H - 10);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "8px monospace";
  ctx.fillText("1 km", W - 42, H - 13);

  return canvas.toDataURL("image/png").split(",")[1];
}

// HSV → RGB conversion
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    case 5: return [v, p, q];
    default: return [0, 0, 0];
  }
}

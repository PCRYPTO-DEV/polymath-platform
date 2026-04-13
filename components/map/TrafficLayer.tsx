"use client";

// components/map/TrafficLayer.tsx
// Global traffic density canvas overlay — shows worldwide movement patterns
// across 6 continents using a grid heatmap + scattered entity dots.
//
// Renders directly to a <canvas> element inside the Leaflet map container
// using the Canvas 2D API — no per-marker DOM nodes, handles tens of
// thousands of data points at 60fps without performance issues.
//
// Visual layers:
//   1. Grid heatmap  — 2° cells coloured by simulated traffic intensity
//      (cyan = normal, gold = active, red = hot/danger-adjacent zones)
//   2. Entity dots   — 4 000 small seeded-random points in high-density areas
//      refreshed every 10 s to simulate live movement

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

// ── Seeded deterministic random ──────────────────────────────────────────────
function sr(s: number, t: number = 0): number {
  const x = Math.sin(s * 127.1 + t * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Continental density weight by lat/lng ────────────────────────────────────
function baseDensity(lat: number, lng: number): number {
  // East Asia (China, Japan, Korea, Taiwan)
  if (lat >= 20 && lat <= 45 && lng >= 100 && lng <= 145) return 0.80;
  // South & SE Asia (India, Bangladesh, Vietnam, Thailand, Indonesia)
  if (lat >= -10 && lat <= 35 && lng >= 65 && lng <= 105) return 0.82;
  // European core
  if (lat >= 45 && lat <= 58 && lng >= -5 && lng <= 25)   return 0.75;
  // Europe extended
  if (lat >= 35 && lat <= 70 && lng >= -10 && lng <= 40)  return 0.60;
  // North America (eastern seaboard + California)
  if (lat >= 25 && lat <= 50 && lng >= -130 && lng <= -65) return 0.65;
  // Mexico + Central America
  if (lat >= 10 && lat <= 25 && lng >= -110 && lng <= -75) return 0.50;
  // South America (Atlantic coast)
  if (lat >= -35 && lat <= 5 && lng >= -55 && lng <= -35)  return 0.52;
  // East Africa
  if (lat >= -10 && lat <= 15 && lng >= 30 && lng <= 45)   return 0.45;
  // West Africa (Nigeria corridor)
  if (lat >= 0 && lat <= 15 && lng >= -15 && lng <= 15)    return 0.48;
  // Middle East
  if (lat >= 15 && lat <= 38 && lng >= 35 && lng <= 65)    return 0.55;
  // Russia / Central Asia
  if (lat >= 50 && lat <= 65 && lng >= 30 && lng <= 90)    return 0.38;
  // Oceania
  if (lat >= -45 && lat <= -10 && lng >= 110 && lng <= 180) return 0.38;
  // Polar / Ocean
  return 0.04;
}

// ── SAR risk zone hotspot boost ──────────────────────────────────────────────
// These lat/lng centroids match the 10 primary SAR assets — their presence
// raises the local density, making the heatmap correlate with risk intelligence.
const HOT_ZONES = [
  { lat: -6.2, lng: 106.8, r: 4  }, // Jakarta
  { lat: 19.4, lng: -99.1, r: 4  }, // Mexico City
  { lat: 31.2, lng: 121.5, r: 3  }, // Shanghai
  { lat: 30.5, lng:  79.6, r: 3  }, // Chamoli
  { lat: 41.1, lng:  29.1, r: 3  }, // Istanbul
  { lat: 29.9, lng: -90.1, r: 3  }, // New Orleans
  { lat: 46.9, lng:-121.7, r: 3  }, // Mt Rainier
  { lat:  6.4, lng:   3.4, r: 3  }, // Lagos
  { lat: 51.5, lng:   0.0, r: 2  }, // London
  { lat: 35.6, lng: 139.8, r: 2  }, // Tokyo
  // Extra global hotspots (Venice, Dhaka, Lima, Bangkok, New York)
  { lat: 45.4, lng:  12.3, r: 3  }, // Venice
  { lat: 23.8, lng:  90.4, r: 4  }, // Dhaka
  { lat:-12.0, lng: -77.0, r: 3  }, // Lima
  { lat: 13.8, lng: 100.5, r: 3  }, // Bangkok
  { lat: 40.7, lng: -74.0, r: 3  }, // New York
  { lat: 34.1, lng:-118.2, r: 3  }, // Los Angeles
  { lat: 55.8, lng:  37.6, r: 3  }, // Moscow
];

function hotZoneBoost(lat: number, lng: number): number {
  let boost = 0;
  for (const hz of HOT_ZONES) {
    const d = Math.sqrt((lat - hz.lat) ** 2 + (lng - hz.lng) ** 2);
    if (d < hz.r) boost = Math.max(boost, (1 - d / hz.r) * 0.45);
  }
  return boost;
}

// ── Cell traffic intensity (0–1) ─────────────────────────────────────────────
function cellIntensity(lat: number, lng: number, seed: number): number {
  const base = baseDensity(lat, lng);
  const boost = hotZoneBoost(lat, lng);
  const n1 = sr(lat * 31 + lng * 17, seed);
  const n2 = sr(lat * 7  + lng * 53, seed + 1);
  const tv = 0.75 + 0.25 * sr(Math.floor(lat / 5) + Math.floor(lng / 5), seed + 2);
  return Math.min(1, (base + boost) * tv * (0.55 + 0.45 * (n1 + n2) / 2));
}

// ── Draw the canvas ──────────────────────────────────────────────────────────
function drawTraffic(canvas: HTMLCanvasElement, map: ReturnType<typeof useMap>, seed: number) {
  const size = map.getSize();
  if (canvas.width !== size.x || canvas.height !== size.y) {
    canvas.width  = size.x;
    canvas.height = size.y;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size.x, size.y);

  const STEP = 2.5; // degrees per grid cell

  // ── LAYER 1: Grid heatmap ─────────────────────────────────────────────────
  for (let lat = -75; lat < 80; lat += STEP) {
    for (let lng = -180; lng < 180; lng += STEP) {
      const intensity = cellIntensity(lat, lng, seed);
      if (intensity < 0.07) continue; // skip blank ocean

      const sw = map.latLngToContainerPoint([lat,        lng       ]);
      const ne = map.latLngToContainerPoint([lat + STEP, lng + STEP]);
      const x = Math.min(sw.x, ne.x), y = Math.min(sw.y, ne.y);
      const w = Math.abs(ne.x - sw.x), h = Math.abs(ne.y - sw.y);
      if (w < 0.5 || h < 0.5) continue;
      if (x + w < 0 || x > size.x || y + h < 0 || y > size.y) continue;

      let r: number, g: number, b: number, a: number;
      if (intensity > 0.72) {
        // Hot → red / orange-red
        r = 255; g = Math.floor(20 + (1 - intensity) * 160); b = 0;
        a = 0.12 + intensity * 0.22;
      } else if (intensity > 0.42) {
        // Active → amber / gold
        r = 255; g = Math.floor(150 + (1 - intensity) * 60); b = 0;
        a = 0.06 + intensity * 0.12;
      } else {
        // Normal → cyan (platform brand)
        r = 6; g = 182; b = 212;
        a = 0.02 + intensity * 0.07;
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(x, y, w, h);
    }
  }

  // ── LAYER 2: Scattered entity dots (4 000 globally weighted points) ───────
  for (let i = 0; i < 4000; i++) {
    // Pick continent weighted
    const cRoll = sr(i * 7 + seed, 0);
    const REGIONS = [
      { latMin: 0,   latMax: 55,  lngMin: 60,   lngMax: 145, wEnd: 0.36 }, // E/SE Asia
      { latMin: 8,   latMax: 35,  lngMin: 65,   lngMax: 92,  wEnd: 0.50 }, // S Asia
      { latMin: 35,  latMax: 70,  lngMin: -10,  lngMax: 40,  wEnd: 0.63 }, // Europe
      { latMin: 15,  latMax: 55,  lngMin: -130, lngMax: -65, wEnd: 0.75 }, // N America
      { latMin: -35, latMax: 10,  lngMin: -80,  lngMax: -35, wEnd: 0.82 }, // S America
      { latMin: -35, latMax: 35,  lngMin: -20,  lngMax: 50,  wEnd: 0.91 }, // Africa
      { latMin: 15,  latMax: 40,  lngMin: 35,   lngMax: 65,  wEnd: 0.96 }, // Middle East
      { latMin: -45, latMax: 0,   lngMin: 110,  lngMax: 180, wEnd: 1.00 }, // Oceania
    ];
    const R = REGIONS.find(r => cRoll < r.wEnd) ?? REGIONS[0];
    const jLat = (sr(i, seed + 10) - 0.5) * 0.03;
    const jLng = (sr(i, seed + 11) - 0.5) * 0.03;
    const lat = R.latMin + sr(i, seed + 1) * (R.latMax - R.latMin) + jLat;
    const lng = R.lngMin + sr(i, seed + 2) * (R.lngMax - R.lngMin) + jLng;

    const pt = map.latLngToContainerPoint([lat, lng]);
    if (pt.x < 0 || pt.x > size.x || pt.y < 0 || pt.y > size.y) continue;

    const intensity = sr(i * 3, seed + 5);
    let dotColor: string;
    if (intensity > 0.88) {
      dotColor = `rgba(255,34,68,${0.70 + intensity * 0.28})`; // danger red
    } else if (intensity > 0.65) {
      dotColor = `rgba(255,187,0,${0.55 + intensity * 0.25})`; // gold
    } else {
      dotColor = `rgba(0,229,255,${0.30 + intensity * 0.30})`; // cyan
    }
    const dotR = intensity > 0.88 ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
  }
}

// ── React component ───────────────────────────────────────────────────────────
interface Props { visible: boolean }

export default function TrafficLayer({ visible }: Props) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Create canvas once, appended to map container (not a pane — avoids transform issues)
    const canvas = document.createElement("canvas");
    canvas.style.cssText = [
      "position:absolute", "inset:0", "pointer-events:none",
      "z-index:450", "mix-blend-mode:screen", "opacity:0.85",
    ].join(";");
    map.getContainer().appendChild(canvas);
    canvasRef.current = canvas;

    const redraw = () => {
      if (!canvasRef.current) return;
      const seed = Math.floor(Date.now() / 10000);
      drawTraffic(canvasRef.current, map, seed);
    };

    map.on("moveend zoomend resize viewreset", redraw);
    redraw();
    timerRef.current = setInterval(redraw, 10000);

    return () => {
      map.off("moveend zoomend resize viewreset", redraw);
      if (timerRef.current) clearInterval(timerRef.current);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  // Show/hide by setting canvas opacity
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.opacity = visible ? "0.85" : "0";
    }
  }, [visible]);

  return null;
}

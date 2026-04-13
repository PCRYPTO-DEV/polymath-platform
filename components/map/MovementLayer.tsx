"use client";

// components/map/MovementLayer.tsx
// 400+ global movement entities rendered as high-contrast CircleMarkers.
// Uses react-leaflet CircleMarker + Polyline (directional heading arrows).
// Much more visible than DivIcon on dark basemaps at all zoom levels.

import { useEffect, useState, useCallback, useRef } from "react";
import { CircleMarker, Polyline, Tooltip, Circle } from "react-leaflet";
import type { MovementEvent, MovementCluster, MovementPattern, MovementResponse } from "@/lib/types";

const POLL_MS = 2000;

// Military zone IDs — used for special styling
const MILITARY_ZONE_KEYWORDS = [
  "taiwan", "hormuz", "south_china_sea_scs", "black_sea", "bab_el_mandeb",
  "malacca", "suez", "ukraine", "kashmir", "korean", "gaza",
  "south_sudan", "myanmar", "crimea", "guam",
];

function isMilitaryZone(nearAssetId: string): boolean {
  return MILITARY_ZONE_KEYWORDS.some(kw => nearAssetId.includes(kw));
}

// ── Bright, saturated colours — maximum contrast on dark map ─────────────────
// (cyan-family safe keeps platform brand identity)
const PROX = {
  danger:   { fill: "#ff2244", stroke: "#ffffff", glow: "#ff224488" },
  caution:  { fill: "#ffbb00", stroke: "#ffffff", glow: "#ffbb0066" },
  safe:     { fill: "#00e5ff", stroke: "#ffffff", glow: "#00e5ff44" },
  military: { fill: "#ff6b35", stroke: "#ffffff", glow: "#ff6b3566" },
};

function col(prox: string, nearAssetId?: string) {
  if (nearAssetId && isMilitaryZone(nearAssetId)) return PROX.military;
  return PROX[prox as keyof typeof PROX] ?? PROX.safe;
}

// ── Radius by proximity (larger than before) ──────────────────────────────────
function radius(prox: string, nearAssetId?: string): number {
  if (nearAssetId && isMilitaryZone(nearAssetId)) return 8;
  if (prox === "danger")  return 9;
  if (prox === "caution") return 7;
  return 5;
}

// ── Heading line length in degrees (~150m) ────────────────────────────────────
const HDNG_LEN = 0.0014;

function headingEndpoint(lat: number, lng: number, heading: number): [number, number] {
  const rad = (heading * Math.PI) / 180;
  return [lat + Math.cos(rad) * HDNG_LEN, lng + Math.sin(rad) * HDNG_LEN];
}

// ── Tooltip component ─────────────────────────────────────────────────────────
function MovTooltip({ evt }: { evt: MovementEvent }) {
  const isMil = isMilitaryZone(evt.nearAssetId);
  const c = col(evt.riskProximity, evt.nearAssetId);
  const label = isMil
    ? `MILITARY · ${evt.nearAssetName}`
    : evt.type === "group"
      ? `Group ×${evt.count ?? "?"}`
      : evt.type.charAt(0).toUpperCase() + evt.type.slice(1);
  return (
    <div style={{ background: "#161b22", border: `1px solid ${c.fill}44`, borderRadius: 5, padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: "#c9d1d9", minWidth: 170 }}>
      <div style={{ fontWeight: 700, color: c.fill, marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#8b949e", fontSize: 10 }}>{evt.nearAssetName}</div>
      <div style={{ color: "#8b949e", fontSize: 10, marginTop: 2 }}>
        HDG {evt.heading}° · {evt.speed} km/h · <span style={{ color: c.fill }}>{isMil ? "MILITARY" : evt.riskProximity.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onPatterns?: (p: MovementPattern[]) => void;
}

export default function MovementLayer({ visible, onPatterns }: Props) {
  const [events, setEvents] = useState<MovementEvent[]>([]);
  const [clusters, setClusters] = useState<MovementCluster[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef = useRef(onPatterns);
  cbRef.current = onPatterns;

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/movement");
      if (!res.ok) return;
      const d: MovementResponse = await res.json();
      setEvents(d.events ?? []);
      setClusters(d.clusters ?? []);
      if (cbRef.current && d.patterns) cbRef.current(d.patterns);
    } catch { /* retry next tick */ }
  }, []);

  useEffect(() => {
    if (!visible) { setEvents([]); setClusters([]); return; }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [visible, poll]);

  if (!visible || events.length === 0) return null;

  return (
    <>
      {/* ── DBSCAN cluster rings ────────────────────────────────────────── */}
      {clusters.map((c) => {
        const cc = col(c.risk);
        return (
          <Circle
            key={c.id}
            center={[c.centerLat, c.centerLng]}
            radius={600}
            pathOptions={{ color: cc.fill, fillColor: cc.fill, fillOpacity: 0.07, weight: 1.5, opacity: 0.5, dashArray: "5 7" }}
          />
        );
      })}

      {/* ── Heading direction lines (rendered separately from markers) ──── */}
      {events.map((evt) => {
        const isMil = isMilitaryZone(evt.nearAssetId);
        const c = col(evt.riskProximity, evt.nearAssetId);
        const isDanger = evt.riskProximity === "danger";
        const end = headingEndpoint(evt.lat, evt.lng, evt.heading);
        return (
          <Polyline
            key={`hdg_${evt.id}`}
            positions={[[evt.lat, evt.lng], end]}
            pathOptions={{ color: c.fill, weight: isMil ? 2.8 : isDanger ? 2.5 : 1.8, opacity: isMil ? 1.0 : isDanger ? 0.95 : 0.65 }}
          />
        );
      })}

      {/* ── Entity dot markers ───────────────────────────────────────────── */}
      {events.map((evt) => {
        const isMil = isMilitaryZone(evt.nearAssetId);
        const c = col(evt.riskProximity, evt.nearAssetId);
        const r = radius(evt.riskProximity, evt.nearAssetId);
        const isDanger = evt.riskProximity === "danger";

        return (
          <CircleMarker
            key={evt.id}
            center={[evt.lat, evt.lng]}
            radius={r}
            pathOptions={{
              fillColor: c.fill,
              fillOpacity: isDanger || isMil ? 1.0 : 0.90,
              color: isDanger || isMil ? "#ffffff" : c.fill,
              weight: isMil ? 3 : isDanger ? 2.5 : 1,
              opacity: 1,
            }}
          >
            <Tooltip direction="top" opacity={1} className="polymath-tooltip" permanent={false}>
              <MovTooltip evt={evt} />
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* ── Extra pulse rings for danger-proximity entities (DivIcon-free) ─ */}
      {events.filter(e => e.riskProximity === "danger").map((evt) => (
        <Circle
          key={`pulse_${evt.id}`}
          center={[evt.lat, evt.lng]}
          radius={120}
          pathOptions={{ color: "#ff2244", fillColor: "#ff2244", fillOpacity: 0.12, weight: 1.5, opacity: 0.6, className: "mv-danger-pulse" }}
        />
      ))}

      {/* ── Military zone pulse rings ────────────────────────────────────── */}
      {events.filter(e => isMilitaryZone(e.nearAssetId)).map((evt) => (
        <Circle
          key={`mil_pulse_${evt.id}`}
          center={[evt.lat, evt.lng]}
          radius={150}
          pathOptions={{ color: "#ff6b35", fillColor: "#ff6b35", fillOpacity: 0.08, weight: 1.5, opacity: 0.5, dashArray: "3 5" }}
        />
      ))}
    </>
  );
}

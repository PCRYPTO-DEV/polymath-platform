"use client";

// components/map/MovementLayer.tsx
// Renders live vehicle/person movement entities on the Leaflet map.
//
// Architecture:
//   - Polls /api/movement every 5 s (matches server-side time-window refresh)
//   - Renders L.DivIcon SVG markers per entity, rotated by heading
//   - Renders semi-transparent cluster circles from DBSCAN output
//   - Pulses danger-zone markers with CSS ring animation
//   - Reports detected patterns upward via onPatterns callback

import { useEffect, useState, useCallback, useRef } from "react";
import { Marker, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import type { MovementEvent, MovementCluster, MovementPattern, MovementResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;

// ── Proximity → colour mapping ───────────────────────────────────────────────
const PROX_COLOR: Record<string, string> = {
  danger:  "#ef4444",
  caution: "#f97316",
  safe:    "#22c55e",
};

// ── Icon builders (HTML strings for L.divIcon — all values are internal consts)
function vehicleIconHtml(color: string, heading: number, pulse: boolean): string {
  const ring = pulse
    ? `<div style="position:absolute;inset:-7px;border-radius:50%;border:2px solid ${color};animation:mv-pulse 1.6s ease-out infinite;pointer-events:none;"></div>`
    : "";
  return `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">${ring}<div style="transform:rotate(${heading}deg);display:flex;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="9" width="18" height="8" rx="2" fill="${color}"/><rect x="6" y="5" width="12" height="5" rx="1" fill="${color}" opacity="0.85"/><circle cx="7.5" cy="17" r="2.2" fill="#07090f"/><circle cx="16.5" cy="17" r="2.2" fill="#07090f"/><polygon points="12,2 14,6 10,6" fill="${color}" opacity="0.9"/></svg></div></div>`;
}

function personIconHtml(color: string, pulse: boolean): string {
  const ring = pulse
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};animation:mv-pulse 1.6s ease-out infinite;pointer-events:none;"></div>`
    : "";
  return `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">${ring}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="5.5" r="3.5" fill="${color}"/><path d="M5 20.5c0-3.87 3.13-7 7-7s7 3.13 7 7" fill="${color}" opacity="0.9"/></svg></div>`;
}

function groupIconHtml(color: string, count: number, pulse: boolean): string {
  const ring = pulse
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid ${color};animation:mv-pulse 1.6s ease-out infinite;pointer-events:none;"></div>`
    : "";
  return `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">${ring}<div style="width:26px;height:26px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${color};font-family:monospace;">${count}</div></div>`;
}

function makeIcon(evt: MovementEvent): L.DivIcon {
  const color = PROX_COLOR[evt.riskProximity] ?? "#8b949e";
  const pulse = evt.riskProximity === "danger";
  let html: string;
  if (evt.type === "vehicle") {
    html = vehicleIconHtml(color, evt.heading, pulse);
  } else if (evt.type === "group") {
    html = groupIconHtml(color, evt.count ?? 2, pulse);
  } else {
    html = personIconHtml(color, pulse);
  }
  return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [14, 0] });
}

// ── Tooltip rendered as JSX (avoids dangerouslySetInnerHTML) ─────────────────
function EventTooltip({ evt }: { evt: MovementEvent }) {
  const color = PROX_COLOR[evt.riskProximity] ?? "#8b949e";
  const typeLabel = evt.type === "group"
    ? `Group ×${evt.count ?? "?"}`
    : evt.type.charAt(0).toUpperCase() + evt.type.slice(1);

  return (
    <div style={{
      background: "#161b22", border: "1px solid #30363d", borderRadius: 5,
      padding: "6px 10px", fontFamily: "monospace", fontSize: 11,
      color: "#c9d1d9", minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, color, marginBottom: 3 }}>{typeLabel}</div>
      <div style={{ color: "#8b949e", fontSize: 10 }}>{evt.nearAssetName}</div>
      <div style={{ color: "#8b949e", fontSize: 10, marginTop: 2 }}>
        HDG {evt.heading}° · {evt.speed} km/h ·{" "}
        <span style={{ color }}>{evt.riskProximity.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface MovementLayerProps {
  visible: boolean;
  onPatterns?: (patterns: MovementPattern[]) => void;
}

export default function MovementLayer({ visible, onPatterns }: MovementLayerProps) {
  const [events, setEvents] = useState<MovementEvent[]>([]);
  const [clusters, setClusters] = useState<MovementCluster[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPatternsRef = useRef(onPatterns);
  onPatternsRef.current = onPatterns;

  const fetchMovement = useCallback(async () => {
    try {
      const res = await fetch("/api/movement");
      if (!res.ok) return;
      const data: MovementResponse = await res.json();
      setEvents(data.events ?? []);
      setClusters(data.clusters ?? []);
      if (onPatternsRef.current && data.patterns) {
        onPatternsRef.current(data.patterns);
      }
    } catch {
      // silently retry next interval
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setEvents([]);
      setClusters([]);
      return;
    }
    fetchMovement();
    timerRef.current = setInterval(fetchMovement, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, fetchMovement]);

  if (!visible) return null;

  return (
    <>
      {/* Cluster rings — DBSCAN output as dashed translucent circles */}
      {clusters.map((cluster) => {
        const color = PROX_COLOR[cluster.risk] ?? "#8b949e";
        return (
          <Circle
            key={cluster.id}
            center={[cluster.centerLat, cluster.centerLng]}
            radius={500}
            pathOptions={{
              color, fillColor: color, fillOpacity: 0.06,
              weight: 1, opacity: 0.35, dashArray: "4 6",
            }}
          />
        );
      })}

      {/* Movement entity markers */}
      {events.map((evt) => (
        <Marker key={evt.id} position={[evt.lat, evt.lng]} icon={makeIcon(evt)}>
          <Tooltip direction="top" opacity={1} className="polymath-tooltip" permanent={false}>
            <EventTooltip evt={evt} />
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

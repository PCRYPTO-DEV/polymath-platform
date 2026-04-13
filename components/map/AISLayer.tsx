"use client";

// components/map/AISLayer.tsx
// Live AIS vessel tracking overlay — renders real-time ship positions
// sourced from aisstream.io WebSocket via the useAISStream hook.
//
// Visual encoding:
//   cargo    → steel blue  #4a9eff
//   tanker   → amber       #ffaa00
//   passenger→ violet      #c084fc
//   tug/work → orange      #fb923c
//   fishing  → lime        #a3e635
//   naval    → red         #f87171
//   other    → grey        #6b7280
//
// Heading line: 12px polyline in vessel colour showing course-over-ground.
// Moving vessels (sog > 0.5) have a pulsing outer ring.
// Click opens a Popup with MMSI, name, speed, status, type.

import { useMemo, useCallback } from "react";
import { CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import { useAISStream, vesselCategory, type AISVessel } from "@/hooks/useAISStream";

// ── Colour palette by vessel category ───────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  cargo:     "#4a9eff",
  tanker:    "#ffaa00",
  passenger: "#c084fc",
  tug:       "#fb923c",
  fishing:   "#a3e635",
  naval:     "#f87171",
  other:     "#6b7280",
};

function vesselColor(v: AISVessel): string {
  return CAT_COLORS[vesselCategory(v.vesselType)] ?? CAT_COLORS.other;
}

// AIS navigational status → readable string
const NAV_STATUS: Record<number, string> = {
  0: "Underway (engine)",
  1: "Anchored",
  2: "Not under command",
  3: "Restricted manoeuvring",
  5: "Moored",
  6: "Aground",
  7: "Fishing",
  8: "Sailing",
  15: "Unknown",
};

function statusLabel(n: number): string {
  return NAV_STATUS[n] ?? `Status ${n}`;
}

// Heading line endpoint — project 0.035° in direction of COG (~4km at equator)
function cogEndpoint(lat: number, lng: number, cog: number): [number, number] {
  const RAD = Math.PI / 180;
  const dist = 0.035;
  return [
    lat + dist * Math.cos(cog * RAD),
    lng + dist * Math.sin(cog * RAD),
  ];
}

// ── Single vessel marker ─────────────────────────────────────────────────────
function VesselMarker({ vessel }: { vessel: AISVessel }) {
  const color = vesselColor(vessel);
  const isMoving = vessel.sog > 0.5 && vessel.navStatus !== 1 && vessel.navStatus !== 5;
  const hasCog = vessel.cog >= 0 && vessel.cog <= 360 && isMoving;

  const cogEnd = hasCog
    ? cogEndpoint(vessel.lat, vessel.lng, vessel.cog)
    : null;

  const category = vesselCategory(vessel.vesselType);

  return (
    <>
      {/* Heading direction line */}
      {cogEnd && (
        <Polyline
          positions={[[vessel.lat, vessel.lng], cogEnd]}
          pathOptions={{ color, weight: 1.5, opacity: 0.75 }}
        />
      )}

      {/* Outer pulse ring for moving vessels */}
      {isMoving && (
        <CircleMarker
          center={[vessel.lat, vessel.lng]}
          radius={7}
          pathOptions={{
            color,
            weight: 1,
            opacity: 0.4,
            fillOpacity: 0,
          }}
        />
      )}

      {/* Main vessel dot */}
      <CircleMarker
        center={[vessel.lat, vessel.lng]}
        radius={isMoving ? 3.5 : 2.5}
        pathOptions={{
          fillColor: color,
          color: "#ffffff",
          weight: 0.8,
          opacity: 0.9,
          fillOpacity: 0.88,
        }}
      >
        <Popup>
          <div style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            padding: "10px 14px",
            fontFamily: "monospace",
            fontSize: 12,
            color: "#c9d1d9",
            minWidth: 200,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "#e6edf3" }}>
              {vessel.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
              <span style={{ color: "#484f58" }}>MMSI</span>
              <span>{vessel.mmsi}</span>
              <span style={{ color: "#484f58" }}>Type</span>
              <span style={{ color, textTransform: "capitalize" }}>{category}</span>
              <span style={{ color: "#484f58" }}>Speed</span>
              <span>{vessel.sog.toFixed(1)} kn</span>
              <span style={{ color: "#484f58" }}>Course</span>
              <span>{vessel.cog.toFixed(0)}°</span>
              <span style={{ color: "#484f58" }}>Status</span>
              <span>{statusLabel(vessel.navStatus)}</span>
              {vessel.length > 0 && (
                <>
                  <span style={{ color: "#484f58" }}>Length</span>
                  <span>{vessel.length} m</span>
                </>
              )}
              <span style={{ color: "#484f58" }}>Updated</span>
              <span>{new Date(vessel.updatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
interface AISLayerProps {
  visible: boolean;
  /** Restrict to current map bounds (default: global) */
  followMapBounds?: boolean;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AISLayer({ visible, followMapBounds = false }: AISLayerProps) {
  const map = useMap();

  // Derive bounding box from current map view if requested
  // (aisstream supports bbox subscription — reduces server-side fan-out)
  const bbox = useMemo<[[number, number], [number, number]]>(() => {
    if (!followMapBounds) return [[-90, -180], [90, 180]];
    const b = map.getBounds();
    return [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ];
  }, [map, followMapBounds]);

  const { vessels, connected, error, stats } = useAISStream({
    enabled: visible,
    bbox,
    maxVessels: 1500,
    staleTtlMs: 5 * 60 * 1000,
  });

  // Memoize rendered markers to avoid re-diffing 1500 elements on every flush
  const markers = useMemo(() => {
    if (!visible) return null;
    return vessels.map((v) => (
      <VesselMarker key={v.mmsi} vessel={v} />
    ));
  }, [vessels, visible]);

  if (!visible) return null;

  return <>{markers}</>;
}

// ── Status badge (can be rendered outside the map) ──────────────────────────
export function AISStatusBadge({
  visible,
  followMapBounds = false,
}: AISLayerProps) {
  const map = useMap();
  const bbox = useMemo<[[number, number], [number, number]]>(() => {
    if (!followMapBounds) return [[-90, -180], [90, 180]];
    const b = map.getBounds();
    return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
  }, [map, followMapBounds]);

  const { connected, stats, error } = useAISStream({
    enabled: visible,
    bbox,
    maxVessels: 1500,
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      fontFamily: "monospace",
      color: "#8b949e",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: error ? "#ef4444" : connected ? "#22c55e" : "#eab308",
        flexShrink: 0,
      }} />
      <span>
        {error
          ? "AIS: error"
          : connected
          ? `AIS LIVE · ${stats.total} vessels · ${stats.moving} moving`
          : "AIS: connecting…"}
      </span>
    </div>
  );
}

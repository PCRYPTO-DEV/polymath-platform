"use client";

// components/panels/SentinelPanel.tsx
// Shows real Sentinel-1 scene acquisitions from the Copernicus CDSE catalog.
// Data is fetched from /api/sentinel-scenes — live, no synthetic simulation.
//
// Layout: collapsible side panel (right side, below AssetDetailPanel).
// Shows acquisition timeline: date, orbit direction, mode, relative orbit, footprint area.
//
// Orbit direction colour coding:
//   ASCENDING  → cyan  (left-looking, east-facing passes)
//   DESCENDING → amber (right-looking, west-facing passes)
// — analysts need both to decompose LOS displacement into vertical + horizontal

import { useState, useEffect, useCallback } from "react";
import type { S1Scene } from "@/lib/copernicus-client";

interface SentinelPanelProps {
  assetId: string | null;
  assetName?: string;
  lat?: number;
  lng?: number;
  visible: boolean;
  onToggle: () => void;
}

interface SceneResponse {
  assetId: string | null;
  assetName: string;
  lat: number;
  lng: number;
  scenes: S1Scene[];
  meta: {
    count: number;
    daysSearched: number;
    productType: string;
    source: string;
    queryMs: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function orbitColor(dir: string): string {
  return dir === "ASCENDING" ? "#06b6d4" : "#f59e0b";
}

function daysAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

// ── Scene card ────────────────────────────────────────────────────────────────
function SceneCard({ scene, index }: { scene: S1Scene; index: number }) {
  const isAsc = scene.orbitDirection === "ASCENDING";
  const color = orbitColor(scene.orbitDirection);

  return (
    <div style={{
      borderLeft: `2px solid ${color}`,
      paddingLeft: 10,
      paddingBottom: 12,
      marginBottom: 2,
      position: "relative",
    }}>
      {/* Timeline dot */}
      <div style={{
        position: "absolute",
        left: -5,
        top: 4,
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}80`,
      }} />

      {/* Date + age */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>
          {formatDate(scene.datetime)}
        </span>
        <span style={{ fontSize: 10, color: "#484f58" }}>
          {daysAgo(scene.datetime)}
        </span>
      </div>

      {/* Time */}
      <div style={{ fontSize: 10, color: "#8b949e", marginBottom: 4 }}>
        {formatTime(scene.datetime)}
      </div>

      {/* Metadata chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {/* Orbit direction */}
        <span style={{
          background: `${color}18`,
          border: `1px solid ${color}40`,
          color,
          padding: "1px 6px",
          borderRadius: 3,
          fontSize: 10,
          fontFamily: "monospace",
        }}>
          {isAsc ? "↗ ASC" : "↘ DESC"}
        </span>

        {/* Acquisition mode */}
        <span style={{
          background: "#30363d",
          color: "#8b949e",
          padding: "1px 6px",
          borderRadius: 3,
          fontSize: 10,
          fontFamily: "monospace",
        }}>
          {scene.acquisitionMode}
        </span>

        {/* Product type */}
        <span style={{
          background: "#30363d",
          color: "#8b949e",
          padding: "1px 6px",
          borderRadius: 3,
          fontSize: 10,
          fontFamily: "monospace",
        }}>
          {scene.productType}
        </span>

        {/* Platform */}
        <span style={{
          background: scene.platformSerialIdentifier.includes("1A") ? "#06b6d418" : "#a855f718",
          border: `1px solid ${scene.platformSerialIdentifier.includes("1A") ? "#06b6d440" : "#a855f740"}`,
          color: scene.platformSerialIdentifier.includes("1A") ? "#06b6d4" : "#a855f7",
          padding: "1px 6px",
          borderRadius: 3,
          fontSize: 10,
          fontFamily: "monospace",
        }}>
          {scene.platformSerialIdentifier.replace("SENTINEL-", "S")}
        </span>

        {/* Footprint area */}
        {scene.footprintArea_km2 > 0 && (
          <span style={{
            background: "#30363d",
            color: "#6b7280",
            padding: "1px 6px",
            borderRadius: 3,
            fontSize: 10,
          }}>
            {(scene.footprintArea_km2 / 1000).toFixed(0)}k km²
          </span>
        )}
      </div>

      {/* Relative orbit + polarisation */}
      <div style={{ fontSize: 10, color: "#484f58", marginTop: 4 }}>
        Orbit {scene.relativeOrbit} · {scene.polarisation}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function SentinelPanel({
  assetId,
  assetName,
  lat,
  lng,
  visible,
  onToggle,
}: SentinelPanelProps) {
  const [data, setData] = useState<SceneResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState<"GRD" | "SLC">("GRD");
  const [days, setDays] = useState(60);

  const fetchScenes = useCallback(async () => {
    if (!visible) return;
    if (!assetId && (lat === undefined || lng === undefined)) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: productType, days: String(days) });
      if (assetId) params.set("assetId", assetId);
      else { params.set("lat", String(lat)); params.set("lng", String(lng)); }

      const res = await fetch(`/api/sentinel-scenes?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenes");
    } finally {
      setLoading(false);
    }
  }, [visible, assetId, lat, lng, productType, days]);

  useEffect(() => {
    fetchScenes();
  }, [fetchScenes]);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      right: 0,
      bottom: 0,
      width: 320,
      maxHeight: "55vh",
      background: "#0d1117",
      border: "1px solid #21262d",
      borderRight: "none",
      borderBottom: "none",
      borderRadius: "8px 0 0 0",
      display: "flex",
      flexDirection: "column",
      zIndex: 1200,
      boxShadow: "-4px -4px 24px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* ESA Sentinel icon */}
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: "linear-gradient(135deg, #06b6d4, #0ea5e9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#000",
          }}>
            S1
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3", fontFamily: "monospace" }}>
            SENTINEL-1
          </span>
          {data && (
            <span style={{ fontSize: 10, color: "#484f58", fontFamily: "monospace" }}>
              {data.meta.count} scenes
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Refresh button */}
          <button
            onClick={fetchScenes}
            disabled={loading}
            style={{
              background: "none", border: "1px solid #30363d", borderRadius: 3,
              color: "#8b949e", padding: "2px 6px", fontSize: 10, cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {loading ? "…" : "↻"}
          </button>
          <button
            onClick={onToggle}
            style={{
              background: "none", border: "none", color: "#484f58",
              fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: "flex",
        gap: 6,
        padding: "6px 12px",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}>
        {/* Product type toggle */}
        {(["GRD", "SLC"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setProductType(t)}
            style={{
              background: productType === t ? "#06b6d420" : "none",
              border: `1px solid ${productType === t ? "#06b6d4" : "#30363d"}`,
              color: productType === t ? "#06b6d4" : "#484f58",
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {t}
          </button>
        ))}

        {/* Days selector */}
        {([30, 60, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              background: days === d ? "#30363d" : "none",
              border: `1px solid ${days === d ? "#484f58" : "#21262d"}`,
              color: days === d ? "#e6edf3" : "#484f58",
              padding: "2px 6px",
              borderRadius: 3,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {d}d
          </button>
        ))}

        {data && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#484f58", alignSelf: "center" }}>
            {data.meta.queryMs}ms
          </span>
        )}
      </div>

      {/* Asset label */}
      {(assetName || data?.assetName) && (
        <div style={{
          padding: "4px 12px",
          fontSize: 10,
          color: "#8b949e",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
          fontFamily: "monospace",
        }}>
          📍 {assetName ?? data?.assetName}
          {data && ` · ${data.lat.toFixed(3)}, ${data.lng.toFixed(3)}`}
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: "flex",
        gap: 12,
        padding: "4px 12px",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4" }} />
          <span style={{ fontSize: 9, color: "#484f58" }}>Ascending pass</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ fontSize: 9, color: "#484f58" }}>Descending pass</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ overflowY: "auto", padding: "12px 14px", flex: 1 }}>
        {loading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 8, minHeight: 80, color: "#484f58",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "2px solid #30363d", borderTopColor: "#06b6d4",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 11, fontFamily: "monospace" }}>
              Querying CDSE catalog…
            </span>
          </div>
        )}

        {error && (
          <div style={{
            background: "#ef444418", border: "1px solid #ef444440",
            borderRadius: 6, padding: "8px 12px",
            fontSize: 11, color: "#f87171", fontFamily: "monospace",
          }}>
            {error}
          </div>
        )}

        {!loading && !error && data && data.scenes.length === 0 && (
          <div style={{ fontSize: 11, color: "#484f58", textAlign: "center", padding: "20px 0" }}>
            No scenes found in last {days} days.
            <br />
            <span style={{ fontSize: 10 }}>Try increasing the time range.</span>
          </div>
        )}

        {!loading && !error && data && data.scenes.length > 0 && (
          <>
            <div style={{ marginBottom: 8, fontSize: 10, color: "#484f58", fontFamily: "monospace" }}>
              {data.meta.source}
            </div>
            {data.scenes.map((scene, i) => (
              <SceneCard key={scene.id} scene={scene} index={i} />
            ))}
          </>
        )}

        {!loading && !assetId && lat === undefined && (
          <div style={{ fontSize: 11, color: "#484f58", textAlign: "center", padding: "20px 0" }}>
            Select an asset on the map<br />to view Sentinel-1 acquisitions.
          </div>
        )}
      </div>

      {/* Footer source badge */}
      <div style={{
        padding: "6px 12px",
        borderTop: "1px solid #21262d",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22c55e",
        }} />
        <span style={{ fontSize: 9, color: "#484f58", fontFamily: "monospace" }}>
          ESA Copernicus Data Space — Live Catalog
        </span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

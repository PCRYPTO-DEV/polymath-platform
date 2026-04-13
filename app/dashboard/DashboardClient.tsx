"use client";

import { useState, useEffect, useCallback } from "react";
import AlertsPanel from "@/components/panels/AlertsPanel";
import RiskMap from "@/components/map/RiskMap";
import AssetDetailPanel from "@/components/panels/AssetDetailPanel";
import ModuleLegend from "@/components/panels/ModuleLegend";
import LiquidAnalysisPanel from "@/components/panels/LiquidAnalysisPanel";
import type { AlertItem, AssetDetail, ModuleId, MovementPattern, PatternSeverity } from "@/lib/types";
import type { FeatureCollection } from "geojson";

interface Props {
  initialAlerts: AlertItem[];
  initialGeojson: FeatureCollection;
}

// ── Pattern severity → visual style ─────────────────────────────────────────
const SEVERITY_STYLE: Record<PatternSeverity, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: "rgba(239,68,68,0.12)",  border: "#ef4444", text: "#fca5a5", dot: "#ef4444" },
  warning:  { bg: "rgba(249,115,22,0.10)", border: "#f97316", text: "#fdba74", dot: "#f97316" },
  info:     { bg: "rgba(234,179,8,0.10)",  border: "#eab308", text: "#fde68a", dot: "#eab308" },
};

const PATTERN_LABEL: Record<string, string> = {
  convergence:     "CONVERGENCE",
  evacuation:      "DISPERSAL",
  cluster:         "CLUSTER",
  density_anomaly: "DENSITY ⚠",
  normal:          "NORMAL",
};

// ── Pattern alert bar (max 4 patterns shown) ─────────────────────────────────
function PatternBar({ patterns }: { patterns: MovementPattern[] }) {
  if (patterns.length === 0) return null;
  const visible = patterns.slice(0, 4);

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 800,
      display: "flex", gap: 6, padding: "6px 10px",
      background: "linear-gradient(to bottom, rgba(7,9,15,0.92) 0%, rgba(7,9,15,0) 100%)",
      pointerEvents: "none",
      animation: "pattern-slide-in 0.3s ease",
    }}>
      {visible.map((p) => {
        const s = SEVERITY_STYLE[p.severity];
        const isCrit = p.severity === "critical";
        return (
          <div key={`${p.type}-${p.assetId}`} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 4, padding: "3px 8px",
            animation: isCrit ? "critical-blink 2s ease-in-out infinite" : undefined,
            pointerEvents: "auto",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
            <span style={{ fontFamily: "monospace", fontSize: 9, color: s.text, letterSpacing: "0.05em", fontWeight: 700 }}>
              {PATTERN_LABEL[p.type] ?? p.type.toUpperCase()}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#8b949e", maxWidth: 180,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.assetName}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: s.text, opacity: 0.7 }}>
              {Math.round(p.confidence * 100)}%
            </span>
          </div>
        );
      })}
      {patterns.length > 4 && (
        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#484f58", alignSelf: "center" }}>
          +{patterns.length - 4} more
        </div>
      )}
    </div>
  );
}

// ── Movement toggle button ────────────────────────────────────────────────────
function MovementToggle({ on, count, onToggle }: { on: boolean; count: number; onToggle: () => void }) {
  return (
    <button
      className="mv-toggle-btn"
      onClick={onToggle}
      style={{
        position: "absolute", top: 8, right: 8, zIndex: 900,
        display: "flex", alignItems: "center", gap: 5,
        background: on ? "rgba(6,182,212,0.10)" : "rgba(13,17,23,0.85)",
        border: `1px solid ${on ? "#06b6d4" : "#30363d"}`,
        borderRadius: 5, padding: "5px 10px", cursor: "pointer",
        fontFamily: "monospace", fontSize: 10, color: on ? "#06b6d4" : "#8b949e",
        transition: "all 0.2s ease",
      }}
    >
      {/* Live dot */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: on ? "#06b6d4" : "#484f58",
        animation: on ? "live-pulse 2s ease-in-out infinite" : undefined,
      }} />
      MOVEMENT {on ? `· ${count}` : "OFF"}
    </button>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardClient({ initialAlerts, initialGeojson }: Props) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId | "all">("all");
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [showMovement, setShowMovement] = useState(true);
  const [patterns, setPatterns] = useState<MovementPattern[]>([]);
  const [movementEventCount, setMovementEventCount] = useState(0);

  // Fetch full asset detail whenever selection changes
  useEffect(() => {
    if (!selectedAssetId) { setSelectedAsset(null); return; }
    let cancelled = false;
    setAssetLoading(true);
    fetch(`/api/assets/${selectedAssetId}`)
      .then((r) => r.json())
      .then((data: AssetDetail) => { if (!cancelled) setSelectedAsset(data); })
      .catch(() => { if (!cancelled) setSelectedAsset(null); })
      .finally(() => { if (!cancelled) setAssetLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAssetId]);

  const handleAssetClick = useCallback((id: string) => {
    setSelectedAssetId((prev) => (prev === id ? null : id));
  }, []);

  const handleClose = useCallback(() => { setSelectedAssetId(null); }, []);

  // Receive pattern data from the MovementLayer via RiskMap callback
  const handlePatterns = useCallback((newPatterns: MovementPattern[]) => {
    setPatterns(newPatterns);
    // Approximate total event count from pattern eventCounts (rough proxy)
    const total = newPatterns.reduce((s, p) => s + p.eventCount, 0);
    // Use fixed total from API summary instead — keep a separate fetch
    setMovementEventCount((prev) => prev === 0 ? total : prev);
  }, []);

  // Keep event count fresh separately (lightweight)
  useEffect(() => {
    if (!showMovement) return;
    const refresh = async () => {
      try {
        const res = await fetch("/api/movement");
        if (res.ok) {
          const data = await res.json();
          setMovementEventCount(data.summary?.totalEvents ?? 0);
        }
      } catch { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [showMovement]);

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
      {/* Left panel — alert list */}
      <AlertsPanel
        alerts={initialAlerts}
        selectedId={selectedAssetId}
        onAssetClick={handleAssetClick}
      />

      {/* Map area fills remaining space */}
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        {/* Pattern detection alert bar — floats above map */}
        <PatternBar patterns={patterns} />

        <RiskMap
          geojson={initialGeojson}
          selectedId={selectedAssetId}
          activeModule={activeModule}
          onAssetClick={handleAssetClick}
          showMovement={showMovement}
          onPatterns={handlePatterns}
        />

        {/* Legend sits over the map, bottom-left */}
        <ModuleLegend activeModule={activeModule} onModuleChange={setActiveModule} />

        {/* Movement on/off toggle — top-right of map */}
        <MovementToggle
          on={showMovement}
          count={movementEventCount}
          onToggle={() => setShowMovement((v) => !v)}
        />

        {/* Liquid AI floating panel — bottom right */}
        <LiquidAnalysisPanel />
      </div>

      {/* Right detail panel — slides over map */}
      <AssetDetailPanel
        asset={assetLoading ? null : selectedAsset}
        onClose={handleClose}
      />
    </div>
  );
}

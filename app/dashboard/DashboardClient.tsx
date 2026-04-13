"use client";

import React, { useState, useEffect, useCallback } from "react";
import AlertsPanel from "@/components/panels/AlertsPanel";
import RiskMap from "@/components/map/RiskMap";
import AssetDetailPanel from "@/components/panels/AssetDetailPanel";
import ModuleLegend from "@/components/panels/ModuleLegend";
import LiquidAnalysisPanel from "@/components/panels/LiquidAnalysisPanel";
import SentinelPanel from "@/components/panels/SentinelPanel";
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
  convoy:          "⚡ CONVOY",
  dark_zone:       "⬛ DARK ZONE",
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

// ── LIVE tracking badge (top-left) ───────────────────────────────────────────
function LiveBadge({ count, lastUpdated }: { count: number; lastUpdated: number }) {
  const [secsAgo, setSecsAgo] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSecsAgo(Math.round((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return (
    <div style={{
      position: "absolute", top: 8, left: 8, zIndex: 850,
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(13,17,23,0.88)",
      border: "1px solid #22c55e44",
      borderRadius: 5,
      padding: "4px 10px",
      fontFamily: "monospace",
      fontSize: 10,
      color: "#22c55e",
      backdropFilter: "blur(6px)",
      pointerEvents: "none",
    }}>
      <span style={{
        display: "inline-block",
        width: 7, height: 7,
        borderRadius: "50%",
        background: "#22c55e",
        boxShadow: "0 0 6px #22c55e",
        animation: "live-pulse 2s ease-in-out infinite",
        flexShrink: 0,
      }} />
      <span>LIVE TRACKING</span>
      <span style={{ color: "#8b949e" }}>—</span>
      <span style={{ color: "#c9d1d9" }}>{count.toLocaleString()} entities</span>
      <span style={{ color: "#8b949e" }}>—</span>
      <span style={{ color: "#484f58" }}>updated {secsAgo}s ago</span>
    </div>
  );
}

// ── Map toolbar (top-right) — movement + AIS + sentinel toggles ──────────────
function MapToolbar({
  showMovement, movementCount, onToggleMovement,
  showAIS, onToggleAIS,
  showSentinel, onToggleSentinel,
}: {
  showMovement: boolean; movementCount: number; onToggleMovement: () => void;
  showAIS: boolean; onToggleAIS: () => void;
  showSentinel: boolean; onToggleSentinel: () => void;
}) {
  const btnStyle = (active: boolean, color = "#06b6d4") => ({
    display: "flex", alignItems: "center", gap: 5,
    background: active ? `${color}18` : "rgba(13,17,23,0.85)",
    border: `1px solid ${active ? color : "#30363d"}`,
    borderRadius: 5, padding: "5px 10px", cursor: "pointer",
    fontFamily: "monospace", fontSize: 10,
    color: active ? color : "#8b949e",
    transition: "all 0.2s ease",
  } as React.CSSProperties);

  return (
    <div style={{
      position: "absolute", top: 8, right: 8, zIndex: 900,
      display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end",
    }}>
      {/* Movement intelligence */}
      <button style={btnStyle(showMovement)} onClick={onToggleMovement}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: showMovement ? "#06b6d4" : "#484f58",
          animation: showMovement ? "live-pulse 2s ease-in-out infinite" : undefined,
        }} />
        MOVEMENT {showMovement ? `· ${movementCount}` : "OFF"}
      </button>

      {/* AIS vessel tracking */}
      <button style={btnStyle(showAIS, "#4a9eff")} onClick={onToggleAIS}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: showAIS ? "#4a9eff" : "#484f58",
          animation: showAIS ? "live-pulse 2s ease-in-out infinite" : undefined,
        }} />
        AIS VESSELS {showAIS ? "· LIVE" : "OFF"}
      </button>

      {/* Sentinel-1 acquisitions */}
      <button style={btnStyle(showSentinel, "#a855f7")} onClick={onToggleSentinel}>
        <div style={{
          width: 14, height: 14, borderRadius: 2,
          background: showSentinel ? "linear-gradient(135deg,#a855f7,#06b6d4)" : "#30363d",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 7, fontWeight: 700, color: "#fff", lineHeight: 1,
          flexShrink: 0,
        }}>
          S1
        </div>
        SENTINEL-1 {showSentinel ? "· LIVE" : "OFF"}
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardClient({ initialAlerts, initialGeojson }: Props) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId | "all">("all");
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [showMovement, setShowMovement] = useState(true);
  const [showAIS, setShowAIS] = useState(false);
  const [showSentinel, setShowSentinel] = useState(false);
  const [patterns, setPatterns] = useState<MovementPattern[]>([]);
  const [movementEventCount, setMovementEventCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

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
          setLastUpdated(Date.now());
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

        {/* LIVE tracking badge — top-left of map */}
        {showMovement && (
          <LiveBadge count={movementEventCount} lastUpdated={lastUpdated} />
        )}

        <RiskMap
          geojson={initialGeojson}
          selectedId={selectedAssetId}
          activeModule={activeModule}
          onAssetClick={handleAssetClick}
          showMovement={showMovement}
          showAIS={showAIS}
          onPatterns={handlePatterns}
        />

        {/* Legend sits over the map, bottom-left */}
        <ModuleLegend activeModule={activeModule} onModuleChange={setActiveModule} />

        {/* Map toolbar: movement + AIS + Sentinel toggles — top-right */}
        <MapToolbar
          showMovement={showMovement}
          movementCount={movementEventCount}
          onToggleMovement={() => setShowMovement((v) => !v)}
          showAIS={showAIS}
          onToggleAIS={() => setShowAIS((v) => !v)}
          showSentinel={showSentinel}
          onToggleSentinel={() => setShowSentinel((v) => !v)}
        />

        {/* Liquid AI floating panel — bottom right (above Sentinel panel) */}
        <LiquidAnalysisPanel />
      </div>

      {/* Sentinel-1 acquisition panel — bottom-right corner, outside map div */}
      <SentinelPanel
        assetId={selectedAssetId}
        assetName={selectedAsset?.name}
        lat={selectedAsset?.lat}
        lng={selectedAsset?.lng}
        visible={showSentinel}
        onToggle={() => setShowSentinel(false)}
      />

      {/* Right detail panel — slides over map */}
      <AssetDetailPanel
        asset={assetLoading ? null : selectedAsset}
        onClose={handleClose}
      />
    </div>
  );
}

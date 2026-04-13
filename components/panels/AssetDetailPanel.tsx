"use client";

import { X, Landmark, Building2, Mountain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AssetDetail } from "@/lib/types";
import { RISK_COLORS, getRiskLabel, getRiskScoreColor } from "@/lib/risk-colors";
import DisplacementChart from "@/components/charts/DisplacementChart";

interface Props {
  asset: AssetDetail | null;
  onClose: () => void;
}

function TrendIcon({ trend }: { trend: AssetDetail["trend"] }) {
  if (trend === "accelerating") return <TrendingDown size={12} color="#ef4444" />;
  if (trend === "decelerating") return <TrendingUp size={12} color="#22c55e" />;
  return <Minus size={12} color="#eab308" />;
}

function trendLabel(trend: AssetDetail["trend"]): string {
  if (trend === "accelerating") return "Accelerating";
  if (trend === "decelerating") return "Decelerating";
  return "Stable";
}

function trendColor(trend: AssetDetail["trend"]): string {
  if (trend === "accelerating") return "#ef4444";
  if (trend === "decelerating") return "#22c55e";
  return "#eab308";
}

function AssetTypeIcon({ type }: { type: AssetDetail["type"] }) {
  const props = { size: 13, color: "#8b949e" };
  if (type === "bridge") return <Landmark {...props} />;
  if (type === "building") return <Building2 {...props} />;
  return <Mountain {...props} />;
}

function moduleLabel(module: AssetDetail["module"]): string {
  if (module === "ground_shift") return "MODULE A — Ground Shift Monitor";
  if (module === "bridge") return "MODULE C — Bridge Monitor";
  return "MODULE D — Slope Risk Engine";
}

export default function AssetDetailPanel({ asset, onClose }: Props) {
  const isOpen = asset !== null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 380,
        height: "100%",
        background: "#0d1117",
        borderLeft: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 600,
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Only render content when open to avoid layout work */}
      {isOpen && asset ? (
        <>
          {/* Header */}
          <div
            style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid #21262d",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <AssetTypeIcon type={asset.type} />
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      color: RISK_COLORS[asset.risk_level].text,
                      background: RISK_COLORS[asset.risk_level].bg,
                      border: `1px solid ${RISK_COLORS[asset.risk_level].border}`,
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                  >
                    {getRiskLabel(asset.risk_level)}
                  </span>
                </div>
                <h2
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#f0f6fc",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {asset.name}
                </h2>
                <div style={{ fontSize: 11, color: "#484f58", marginTop: 2 }}>
                  {asset.location}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "#484f58",
                  marginLeft: 8,
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {/* Risk score hero */}
            <div
              style={{
                background: "#161b22",
                border: "1px solid #21262d",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: getRiskScoreColor(asset.risk_score),
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {asset.risk_score}
                </span>
                <span style={{ fontSize: 13, color: "#484f58" }}>/100</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#484f58",
                    marginLeft: "auto",
                  }}
                >
                  {moduleLabel(asset.module)}
                </span>
              </div>
              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  background: "#1c2128",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${asset.risk_score}%`,
                    background: getRiskScoreColor(asset.risk_score),
                    borderRadius: 2,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>

            {/* Key metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {[
                {
                  label: "Rate",
                  value: `${asset.current_rate_mm_mo.toFixed(1)} mm/mo`,
                  color: RISK_COLORS[asset.risk_level].fill,
                },
                {
                  label: "Total (18mo)",
                  value: `${asset.total_displacement_mm.toFixed(0)} mm`,
                  color: "#c9d1d9",
                },
                {
                  label: "Trend",
                  value: trendLabel(asset.trend),
                  color: trendColor(asset.trend),
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    background: "#161b22",
                    border: "1px solid #21262d",
                    borderRadius: 6,
                    padding: "8px 10px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#484f58", marginBottom: 4 }}>
                    {metric.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: metric.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                    }}
                  >
                    {metric.label === "Trend" ? (
                      <>
                        <TrendIcon trend={asset.trend} />
                        {metric.value}
                      </>
                    ) : (
                      metric.value
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Displacement chart */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
                DISPLACEMENT TIME SERIES (mm)
              </div>
              <DisplacementChart data={asset.time_series} riskLevel={asset.risk_level} />
            </div>

            {/* Explanation */}
            <div
              style={{
                background: "#161b22",
                border: "1px solid #21262d",
                borderLeft: `3px solid ${RISK_COLORS[asset.risk_level].fill}`,
                borderRadius: "0 6px 6px 0",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
                SAR INTELLIGENCE ASSESSMENT
              </div>
              <p style={{ fontSize: 12, color: "#c9d1d9", lineHeight: 1.6, margin: 0 }}>
                {asset.explanation}
              </p>
            </div>

            {/* Asset metadata */}
            <div
              style={{
                background: "#161b22",
                border: "1px solid #21262d",
                borderRadius: 6,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 8, letterSpacing: "0.06em" }}>
                ASSET METADATA
              </div>
              {[
                { label: "Asset ID", value: asset.id },
                { label: "Type", value: asset.type.charAt(0).toUpperCase() + asset.type.slice(1) },
                ...(asset.year_built > 0 ? [{ label: "Year Built", value: String(asset.year_built) }] : []),
                ...(asset.length_m ? [{ label: "Length", value: `${asset.length_m} m` }] : []),
                ...(asset.height_m ? [{ label: "Height", value: `${asset.height_m} m` }] : []),
                ...(asset.area_sqm ? [{ label: "Area", value: `${(asset.area_sqm / 1000).toFixed(0)} km²` }] : []),
                { label: "Last Observed", value: asset.last_observed },
                { label: "Scene ID", value: asset.sar_scene_id },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ color: "#484f58" }}>{row.label}</span>
                  <span style={{ color: "#8b949e", textAlign: "right", maxWidth: 200, wordBreak: "break-all" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

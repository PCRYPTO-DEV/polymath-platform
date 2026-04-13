"use client";

import { Landmark, Building2, Mountain, AlertTriangle } from "lucide-react";
import type { AlertItem, AssetType, ModuleId } from "@/lib/types";
import { RISK_COLORS, getRiskLabel } from "@/lib/risk-colors";

interface Props {
  alerts: AlertItem[];
  selectedId: string | null;
  onAssetClick: (id: string) => void;
}

// Hoisted outside component (rendering-hoist-jsx)
function AssetIcon({ type }: { type: AssetType }) {
  const size = 13;
  const color = "#8b949e";
  if (type === "bridge") return <Landmark size={size} color={color} />;
  if (type === "building") return <Building2 size={size} color={color} />;
  return <Mountain size={size} color={color} />;
}

function moduleLabel(module: ModuleId): string {
  if (module === "ground_shift") return "Ground Shift";
  if (module === "bridge") return "Bridge";
  return "Slope";
}

export default function AlertsPanel({ alerts, selectedId, onAssetClick }: Props) {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        height: "100%",
        background: "#0d1117",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={13} color="#ef4444" />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#f0f6fc", letterSpacing: "0.06em" }}>
            TOP ALERTS
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#484f58", marginTop: 2 }}>
          Ranked by risk score · This month
        </div>
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {alerts.map((alert) => {
          const isSelected = selectedId === alert.id;
          const riskStyle = RISK_COLORS[alert.risk_level];

          return (
            <button
              key={alert.id}
              onClick={() => onAssetClick(alert.id)}
              style={{
                width: "100%",
                textAlign: "left",
                background: isSelected ? "rgba(6,182,212,0.08)" : "transparent",
                border: "none",
                borderLeft: `3px solid ${isSelected ? "#06b6d4" : "transparent"}`,
                padding: "9px 14px",
                cursor: "pointer",
                transition: "background 0.12s ease",
              }}
            >
              {/* Risk badge + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    color: riskStyle.text,
                    background: riskStyle.bg,
                    border: `1px solid ${riskStyle.border}`,
                    borderRadius: 3,
                    padding: "1px 5px",
                    flexShrink: 0,
                  }}
                >
                  {getRiskLabel(alert.risk_level)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isSelected ? "#f0f6fc" : "#c9d1d9",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {alert.name}
                </span>
              </div>

              {/* Meta row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <AssetIcon type={alert.type} />
                  <span style={{ fontSize: 10, color: "#484f58" }}>
                    {moduleLabel(alert.module)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: riskStyle.fill,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {alert.current_rate_mm_mo.toFixed(1)} mm/mo
                </span>
              </div>

              {/* Alert reason */}
              <div style={{ fontSize: 10, color: "#484f58", marginTop: 3 }}>
                {alert.alert_reason}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid #21262d",
          fontSize: 10,
          color: "#484f58",
          flexShrink: 0,
        }}
      >
        {alerts.length} assets monitored · Polymath v0.1
      </div>
    </div>
  );
}

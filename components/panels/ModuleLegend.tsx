"use client";

import type { ModuleId } from "@/lib/types";
import { RISK_COLORS } from "@/lib/risk-colors";

interface Props {
  activeModule: ModuleId | "all";
  onModuleChange: (m: ModuleId | "all") => void;
}

// Hoisted outside component (rendering-hoist-jsx)
const RISK_LEVELS = [
  { label: "Stable", color: RISK_COLORS.stable.fill },
  { label: "Monitor", color: RISK_COLORS.monitor.fill },
  { label: "Concerning", color: RISK_COLORS.concerning.fill },
  { label: "Dangerous", color: RISK_COLORS.dangerous.fill },
] as const;

const MODULE_FILTERS: { id: ModuleId | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ground_shift", label: "Ground Shift" },
  { id: "bridge", label: "Bridge" },
  { id: "slope", label: "Slope" },
];

export default function ModuleLegend({ activeModule, onModuleChange }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 296,
        zIndex: 500,
        background: "rgba(13,17,23,0.92)",
        border: "1px solid #21262d",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backdropFilter: "blur(8px)",
        minWidth: 200,
      }}
    >
      {/* Color scale */}
      <div>
        <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
          RISK LEVEL
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {RISK_LEVELS.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: r.color,
                }}
              />
              <span style={{ fontSize: 11, color: "#8b949e" }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Module filter pills */}
      <div>
        <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, letterSpacing: "0.06em" }}>
          MODULE FILTER
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MODULE_FILTERS.map((f) => {
            const isActive = activeModule === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onModuleChange(f.id)}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: isActive ? "#06b6d4" : "#21262d",
                  background: isActive ? "rgba(6,182,212,0.15)" : "transparent",
                  color: isActive ? "#06b6d4" : "#8b949e",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SAR source tag */}
      <div style={{ fontSize: 10, color: "#484f58", borderTop: "1px solid #21262d", paddingTop: 8 }}>
        Sentinel-1 C-band · InSAR PS/SBAS · Delhi NCR
      </div>
    </div>
  );
}

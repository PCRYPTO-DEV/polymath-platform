"use client";

import { useState } from "react";
import type { ModuleId } from "@/lib/types";
import { RISK_COLORS } from "@/lib/risk-colors";

interface Props {
  activeModule: ModuleId | "all";
  onModuleChange: (m: ModuleId | "all") => void;
}

const MODULE_FILTERS: { id: ModuleId | "all"; label: string }[] = [
  { id: "all",          label: "All"         },
  { id: "ground_shift", label: "Ground Shift" },
  { id: "bridge",       label: "Bridge"       },
  { id: "slope",        label: "Slope"        },
];

const sectionHead: React.CSSProperties = {
  fontSize: 9,
  color: "#484f58",
  letterSpacing: "0.08em",
  marginBottom: 5,
  fontFamily: "monospace",
  fontWeight: 700,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 3,
};

const label: React.CSSProperties = {
  fontSize: 10,
  color: "#8b949e",
  fontFamily: "monospace",
  lineHeight: 1.3,
};

const dot = (color: string, size = 8): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: "50%",
  background: color,
  flexShrink: 0,
});

const divider: React.CSSProperties = {
  borderTop: "1px solid #21262d",
  margin: "8px 0",
};

export default function ModuleLegend({ activeModule, onModuleChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 296,
        zIndex: 500,
        background: "rgba(13,17,23,0.94)",
        border: "1px solid #21262d",
        borderRadius: 8,
        backdropFilter: "blur(8px)",
        minWidth: collapsed ? 140 : 220,
        maxWidth: 240,
        fontFamily: "monospace",
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 10px",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid #21262d",
          userSelect: "none",
        }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span style={{ fontSize: 10, color: "#c9d1d9", fontWeight: 700, letterSpacing: "0.06em" }}>
          MAP GUIDE
        </span>
        <span style={{ fontSize: 11, color: "#484f58", lineHeight: 1 }}>
          {collapsed ? "▶" : "▼"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* ── SECTION 1: SAR RISK ASSETS ── */}
          <div style={sectionHead}>◈ SAR RISK ASSETS</div>
          <div style={row}>
            <div style={dot(RISK_COLORS.dangerous.fill)} />
            <span style={label}>Dangerous — active subsidence/failure</span>
          </div>
          <div style={row}>
            <div style={dot(RISK_COLORS.concerning.fill)} />
            <span style={label}>Concerning — elevated displacement rate</span>
          </div>
          <div style={row}>
            <div style={dot(RISK_COLORS.monitor.fill)} />
            <span style={label}>Monitor — above baseline, watching</span>
          </div>
          <div style={row}>
            <div style={dot(RISK_COLORS.stable.fill)} />
            <span style={label}>Stable — within safe parameters</span>
          </div>

          <div style={divider} />

          {/* ── SECTION 2: MOVEMENT INTELLIGENCE ── */}
          <div style={sectionHead}>◈ MOVEMENT INTELLIGENCE</div>
          <div style={row}>
            <div style={dot("#ff2244", 7)} />
            <span style={label}>Red dot — entity in danger zone (&lt;600m)</span>
          </div>
          <div style={row}>
            <div style={dot("#ffbb00", 7)} />
            <span style={label}>Yellow dot — entity in caution zone</span>
          </div>
          <div style={row}>
            <div style={dot("#00e5ff", 7)} />
            <span style={label}>Cyan dot — entity in safe zone</span>
          </div>
          <div style={{ ...row, marginTop: 2 }}>
            <div style={{
              width: 16, height: 2, background: "#8b949e",
              borderTop: "2px solid #8b949e", flexShrink: 0,
            }} />
            <span style={label}>Heading line — direction of travel</span>
          </div>
          <div style={{ ...row }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: "1.5px dashed #8b949e", flexShrink: 0,
            }} />
            <span style={label}>Dashed ring — DBSCAN cluster (3+ entities)</span>
          </div>

          <div style={divider} />

          {/* ── SECTION 3: TRAFFIC DENSITY HEATMAP ── */}
          <div style={sectionHead}>◈ GLOBAL TRAFFIC DENSITY</div>
          <div style={row}>
            <div style={{ ...dot("#ef4444", 8), boxShadow: "0 0 5px #ef444488" }} />
            <span style={label}>Red glow — high-activity near SAR risk</span>
          </div>
          <div style={row}>
            <div style={{ ...dot("#eab308", 8), boxShadow: "0 0 5px #eab30888" }} />
            <span style={label}>Gold glow — active monitoring zone</span>
          </div>
          <div style={row}>
            <div style={{ ...dot("#06b6d4", 8), boxShadow: "0 0 5px #06b6d488" }} />
            <span style={label}>Cyan glow — normal global traffic baseline</span>
          </div>

          <div style={divider} />

          {/* ── SECTION 4: MILITARY INTELLIGENCE ── */}
          <div style={sectionHead}>◈ MILITARY INTELLIGENCE</div>
          <div style={row}>
            <div style={{ ...dot("#ff6b35", 8), border: "1.5px solid #ffffff" }} />
            <span style={label}>Orange dot — military entity detected</span>
          </div>
          <div style={{ ...row, alignItems: "flex-start" }}>
            <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>⚡</span>
            <span style={label}>CONVOY — 3+ vehicles in formation, same direction, &lt;2km spacing</span>
          </div>
          <div style={{ ...row, alignItems: "flex-start" }}>
            <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>🚢</span>
            <span style={label}>NAVAL — warship/military vessel detected</span>
          </div>
          <div style={{ ...row, alignItems: "flex-start" }}>
            <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>⬛</span>
            <span style={label}>DARK ZONE — vessel went AIS-silent in monitored zone</span>
          </div>

          <div style={divider} />

          {/* ── SECTION 5: MODULE FILTER ── */}
          <div style={sectionHead}>◈ MODULE FILTER</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {MODULE_FILTERS.map((f) => {
              const isActive = activeModule === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => onModuleChange(f.id)}
                  style={{
                    fontSize: 10,
                    padding: "3px 7px",
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: isActive ? "#06b6d4" : "#21262d",
                    background: isActive ? "rgba(6,182,212,0.15)" : "transparent",
                    color: isActive ? "#06b6d4" : "#8b949e",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    transition: "all 0.15s ease",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div style={divider} />

          {/* Source tag */}
          <div style={{ fontSize: 9, color: "#484f58", fontFamily: "monospace" }}>
            Sentinel-1 C-band · Global Coverage · Live
          </div>
        </div>
      )}
    </div>
  );
}

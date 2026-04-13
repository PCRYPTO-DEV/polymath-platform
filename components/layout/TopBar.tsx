"use client";

import { AETHER_ACCENT } from "@/lib/risk-colors";
import { Activity, Satellite } from "lucide-react";

interface ModuleStat {
  label: string;
  count: number;
  color: string;
}

const MODULE_STATS: ModuleStat[] = [
  { label: "Ground Shift", count: 7, color: "#22c55e" },
  { label: "Bridge Monitor", count: 4, color: "#f97316" },
  { label: "Slope Risk", count: 3, color: "#ef4444" },
];

// Static date avoids server/client hydration mismatch (rendering-hydration-no-flicker)
const LAST_UPDATED = "15 Mar 2025";

export default function TopBar() {

  return (
    <div
      style={{
        height: 48,
        background: "#0d1117",
        borderBottom: "1px solid #21262d",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Satellite size={18} color={AETHER_ACCENT} strokeWidth={1.5} />
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#f0f6fc",
              letterSpacing: "0.08em",
            }}
          >
            POLYMATH
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#8b949e",
              marginLeft: 8,
              letterSpacing: "0.04em",
            }}
          >
            SAR INTELLIGENCE PLATFORM
          </span>
        </div>
      </div>

      {/* Center: Module status pills */}
      <div style={{ display: "flex", gap: 8 }}>
        {MODULE_STATS.map((mod) => (
          <div
            key={mod.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "#161b22",
              border: "1px solid #21262d",
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 11,
              color: "#c9d1d9",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: mod.color,
                flexShrink: 0,
              }}
            />
            {mod.label}
            <span style={{ color: "#8b949e", marginLeft: 2 }}>{mod.count}</span>
          </div>
        ))}
      </div>

      {/* Right: Live indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "#8b949e",
        }}
      >
        <Activity size={12} color="#22c55e" />
        <div
          className="live-dot"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#22c55e",
          }}
        />
        <span>LIVE</span>
        <span style={{ marginLeft: 4, color: "#484f58" }}>·</span>
        <span>Sentinel-1 · {LAST_UPDATED}</span>
      </div>
    </div>
  );
}

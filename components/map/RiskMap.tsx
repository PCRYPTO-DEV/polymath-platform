"use client";

// RiskMap.tsx — dynamic() wrapper that prevents Leaflet from running on the server.
// Must be "use client" because next/dynamic with ssr:false is only allowed in Client Components (Next.js 15+).

import dynamic from "next/dynamic";
import type { RiskMapProps } from "./RiskMapInner";

const RiskMapInner = dynamic(() => import("./RiskMapInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        flex: 1,
        height: "100%",
        background: "#0d1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: "2px solid #21262d",
            borderTopColor: "#06b6d4",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 10px",
          }}
        />
        <div style={{ fontSize: 11, color: "#484f58", letterSpacing: "0.06em" }}>
          LOADING MAP
        </div>
      </div>
    </div>
  ),
});

// Re-export RiskMapProps so DashboardClient can import the full type
export type { RiskMapProps };

export default function RiskMap(props: RiskMapProps) {
  return <RiskMapInner {...props} />;
}

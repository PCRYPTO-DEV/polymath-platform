// app/dashboard/page.tsx — Server Component shell that pre-fetches initial data,
// then hands off to DashboardClient for all interactive state.

import { Suspense } from "react";
import Shell from "@/components/layout/Shell";
import DashboardClient from "./DashboardClient";
import type { AlertItem } from "@/lib/types";
import type { FeatureCollection } from "geojson";

async function fetchAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"}/api/alerts`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

async function fetchRiskGrid(): Promise<FeatureCollection> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"}/api/risk-grid`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return { type: "FeatureCollection", features: [] };
    return res.json();
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}

export default async function DashboardPage() {
  // Fetch both in parallel — no waterfall
  const [alerts, geojson] = await Promise.all([fetchAlerts(), fetchRiskGrid()]);

  return (
    <Shell>
      <Suspense fallback={null}>
        <DashboardClient initialAlerts={alerts} initialGeojson={geojson} />
      </Suspense>
    </Shell>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import AlertsPanel from "@/components/panels/AlertsPanel";
import RiskMap from "@/components/map/RiskMap";
import AssetDetailPanel from "@/components/panels/AssetDetailPanel";
import ModuleLegend from "@/components/panels/ModuleLegend";
import LiquidAnalysisPanel from "@/components/panels/LiquidAnalysisPanel";
import type { AlertItem, AssetDetail, ModuleId } from "@/lib/types";
import type { FeatureCollection } from "geojson";

interface Props {
  initialAlerts: AlertItem[];
  initialGeojson: FeatureCollection;
}

export default function DashboardClient({ initialAlerts, initialGeojson }: Props) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId | "all">("all");
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);

  // Fetch full asset detail whenever selection changes
  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      return;
    }

    let cancelled = false;
    setAssetLoading(true);

    fetch(`/api/assets/${selectedAssetId}`)
      .then((r) => r.json())
      .then((data: AssetDetail) => {
        if (!cancelled) setSelectedAsset(data);
      })
      .catch(() => {
        if (!cancelled) setSelectedAsset(null);
      })
      .finally(() => {
        if (!cancelled) setAssetLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedAssetId]);

  const handleAssetClick = useCallback((id: string) => {
    setSelectedAssetId((prev) => (prev === id ? null : id));
  }, []);

  const handleClose = useCallback(() => {
    setSelectedAssetId(null);
  }, []);

  return (
    // Flex row: AlertsPanel | Map (fills remaining space) | AssetDetailPanel (absolute overlay)
    <div style={{ display: "flex", flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
      {/* Left panel — alert list */}
      <AlertsPanel
        alerts={initialAlerts}
        selectedId={selectedAssetId}
        onAssetClick={handleAssetClick}
      />

      {/* Map fills remaining space */}
      <div style={{ flex: 1, height: "100%", position: "relative" }}>
        <RiskMap
          geojson={initialGeojson}
          selectedId={selectedAssetId}
          activeModule={activeModule}
          onAssetClick={handleAssetClick}
        />

        {/* Legend sits over the map, bottom-left (offset from alerts panel) */}
        <ModuleLegend
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />

        {/* Liquid AI floating panel — bottom right of map area */}
        <LiquidAnalysisPanel />
      </div>

      {/* Right detail panel — slides in over the map */}
      <AssetDetailPanel
        asset={assetLoading ? null : selectedAsset}
        onClose={handleClose}
      />
    </div>
  );
}

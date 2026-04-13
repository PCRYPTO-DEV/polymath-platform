"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { ModuleId, MovementPattern } from "@/lib/types";
import { RISK_COLORS } from "@/lib/risk-colors";
import MovementLayer from "./MovementLayer";
import TrafficLayer from "./TrafficLayer";
import AISLayer from "./AISLayer";

export interface RiskMapProps {
  geojson: FeatureCollection;
  selectedId: string | null;
  activeModule: ModuleId | "all";
  onAssetClick: (id: string) => void;
  showMovement?: boolean;
  showAIS?: boolean;
  onPatterns?: (patterns: MovementPattern[]) => void;
}

// Global view: centred mid-Atlantic so all 6 continents are visible
const GLOBAL_CENTER: [number, number] = [20, 10];
const DEFAULT_ZOOM = 2;

function getRadius(riskLevel: string, isSelected: boolean): number {
  const base = riskLevel === "dangerous" ? 11 : riskLevel === "concerning" ? 9 : 7;
  return isSelected ? base + 4 : base;
}

function getColor(riskLevel: string): string {
  return (RISK_COLORS as Record<string, { fill: string }>)[riskLevel]?.fill ?? "#8b949e";
}

// FlyTo sub-component — must live inside MapContainer to use useMap()
function FlyToAsset({ geojson, selectedId }: { geojson: FeatureCollection; selectedId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const feature = geojson.features.find(
      (f) => f.properties?.id === selectedId
    ) as Feature<Point> | undefined;
    if (feature) {
      const [lng, lat] = feature.geometry.coordinates;
      map.flyTo([lat, lng], 10, { duration: 1.4 });
    }
  }, [selectedId, geojson, map]);

  return null;
}

export default function RiskMapInner({
  geojson,
  selectedId,
  activeModule,
  onAssetClick,
  showMovement = true,
  showAIS = false,
  onPatterns,
}: RiskMapProps) {
  const layerKey = `${activeModule}-${selectedId ?? "none"}`;

  const pointToLayer = (feature: Feature<Point>, latlng: L.LatLng): L.CircleMarker => {
    const props = feature.properties ?? {};
    const isSelected = props.id === selectedId;
    const riskLevel = props.risk_level ?? "stable";

    return L.circleMarker(latlng, {
      radius: getRadius(riskLevel, isSelected),
      fillColor: getColor(riskLevel),
      color: isSelected ? "#06b6d4" : getColor(riskLevel),
      weight: isSelected ? 2.5 : 1,
      opacity: 1,
      fillOpacity: isSelected ? 0.95 : 0.78,
    });
  };

  const onEachFeature = (feature: Feature, layer: L.Layer): void => {
    const props = feature.properties ?? {};

    layer.bindTooltip(
      `<div style="
        background:#161b22;border:1px solid #30363d;border-radius:5px;
        padding:6px 10px;font-family:monospace;font-size:12px;color:#c9d1d9;min-width:160px;
      ">
        <div style="font-weight:600;margin-bottom:3px;">${props.name ?? ""}</div>
        <div style="font-size:10px;color:#484f58;">
          ${(props.current_rate_mm_mo ?? 0).toFixed(1)} mm/mo · Risk ${props.risk_score ?? 0}/100
        </div>
      </div>`,
      { sticky: true, opacity: 1, className: "polymath-tooltip" }
    );

    layer.on("click", () => {
      if (props.id) onAssetClick(props.id);
    });
  };

  // Filter GeoJSON by active module
  const filteredGeojson: FeatureCollection = {
    ...geojson,
    features:
      activeModule === "all"
        ? geojson.features
        : geojson.features.filter((f) => f.properties?.module === activeModule),
  };

  return (
    <MapContainer
      center={GLOBAL_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%", background: "#0d1117" }}
      zoomControl={true}
      minZoom={2}
      maxZoom={18}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      {/* SAR risk asset layer */}
      <GeoJSON
        key={layerKey}
        data={filteredGeojson}
        pointToLayer={pointToLayer}
        onEachFeature={onEachFeature}
      />

      {/* Global traffic density heatmap — 4 000 worldwide entity dots + heatgrid */}
      <TrafficLayer visible={showMovement} />

      {/* SAR-correlated movement intelligence layer — DBSCAN + pattern analysis */}
      <MovementLayer visible={showMovement} onPatterns={onPatterns} />

      {/* Live AIS vessel tracking — aisstream.io WebSocket */}
      <AISLayer visible={showAIS} />

      <FlyToAsset geojson={geojson} selectedId={selectedId} />
    </MapContainer>
  );
}

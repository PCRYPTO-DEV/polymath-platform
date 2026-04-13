"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { ModuleId } from "@/lib/types";
import { RISK_COLORS } from "@/lib/risk-colors";

export interface RiskMapProps {
  geojson: FeatureCollection;
  selectedId: string | null;
  activeModule: ModuleId | "all";
  onAssetClick: (id: string) => void;
}

// Delhi NCR center
const DELHI_CENTER: [number, number] = [28.6, 77.2];
const DEFAULT_ZOOM = 10;

// Map risk level to circle radius
function getRadius(riskLevel: string, isSelected: boolean): number {
  const base = riskLevel === "dangerous" ? 10 : riskLevel === "concerning" ? 8 : 6;
  return isSelected ? base + 4 : base;
}

// Map risk level to color fill
function getColor(riskLevel: string): string {
  return (RISK_COLORS as Record<string, { fill: string }>)[riskLevel]?.fill ?? "#8b949e";
}

// FlyTo sub-component — uses useMap() hook which requires being inside MapContainer
function FlyToAsset({
  geojson,
  selectedId,
}: {
  geojson: FeatureCollection;
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const feature = geojson.features.find(
      (f) => f.properties?.id === selectedId
    ) as Feature<Point> | undefined;
    if (feature) {
      const [lng, lat] = feature.geometry.coordinates;
      map.flyTo([lat, lng], 13, { duration: 1.2 });
    }
  }, [selectedId, geojson, map]);

  return null;
}

export default function RiskMapInner({
  geojson,
  selectedId,
  activeModule,
  onAssetClick,
}: RiskMapProps) {
  // GeoJSON layer key forces full re-render when module filter changes
  const layerKey = `${activeModule}-${selectedId ?? "none"}`;

  const pointToLayer = (
    feature: Feature<Point>,
    latlng: L.LatLng
  ): L.CircleMarker => {
    const props = feature.properties ?? {};
    const isSelected = props.id === selectedId;
    const riskLevel = props.risk_level ?? "stable";

    return L.circleMarker(latlng, {
      radius: getRadius(riskLevel, isSelected),
      fillColor: getColor(riskLevel),
      color: isSelected ? "#06b6d4" : getColor(riskLevel),
      weight: isSelected ? 2.5 : 1,
      opacity: 1,
      fillOpacity: isSelected ? 0.95 : 0.75,
    });
  };

  const onEachFeature = (
    feature: Feature,
    layer: L.Layer
  ): void => {
    const props = feature.properties ?? {};

    // Tooltip
    layer.bindTooltip(
      `<div style="
        background:#161b22;
        border:1px solid #30363d;
        border-radius:5px;
        padding:6px 10px;
        font-family:monospace;
        font-size:12px;
        color:#c9d1d9;
        min-width:150px;
      ">
        <div style="font-weight:600;margin-bottom:3px;">${props.name ?? ""}</div>
        <div style="font-size:10px;color:#484f58;">${(props.current_rate_mm_mo ?? 0).toFixed(1)} mm/mo · Risk ${props.risk_score ?? 0}/100</div>
      </div>`,
      {
        sticky: true,
        opacity: 1,
        className: "polymath-tooltip",
      }
    );

    // Click handler
    layer.on("click", () => {
      if (props.id) onAssetClick(props.id);
    });
  };

  // Filter features by active module
  const filteredGeojson: FeatureCollection = {
    ...geojson,
    features:
      activeModule === "all"
        ? geojson.features
        : geojson.features.filter(
            (f) => f.properties?.module === activeModule
          ),
  };

  return (
    <MapContainer
      center={DELHI_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%", background: "#0d1117" }}
      zoomControl={false}
    >
      {/* CartoDB Dark Matter — free, no API key required */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      <GeoJSON
        key={layerKey}
        data={filteredGeojson}
        pointToLayer={pointToLayer}
        onEachFeature={onEachFeature}
      />

      <FlyToAsset geojson={geojson} selectedId={selectedId} />
    </MapContainer>
  );
}

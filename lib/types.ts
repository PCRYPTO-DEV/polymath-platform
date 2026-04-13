export type RiskLevel = "stable" | "monitor" | "concerning" | "dangerous";
export type ModuleId = "ground_shift" | "bridge" | "slope";
export type AssetType = "bridge" | "building" | "slope";

export interface DisplacementPoint {
  month: string;           // "2023-04"
  label: string;           // "Apr 23"
  displacement_mm: number; // cumulative, negative = subsidence
  rate_mm_mo: number;      // velocity this month
}

export interface AssetSummary {
  id: string;
  name: string;
  type: AssetType;
  module: ModuleId;
  location: string;
  lat: number;
  lng: number;
  risk_score: number;
  risk_level: RiskLevel;
  current_rate_mm_mo: number;
  total_displacement_mm: number;
  trend: "accelerating" | "stable" | "decelerating";
}

export interface AssetDetail extends AssetSummary {
  year_built: number;
  length_m?: number;
  height_m?: number;
  area_sqm?: number;
  time_series: DisplacementPoint[];
  explanation: string;
  last_observed: string;
  sar_scene_id: string;
}

export interface AlertItem {
  id: string;
  name: string;
  type: AssetType;
  module: ModuleId;
  location: string;
  risk_level: RiskLevel;
  risk_score: number;
  current_rate_mm_mo: number;
  alert_reason: string;
}

export interface RiskGridFeatureProperties {
  id: string;
  name: string;
  type: AssetType;
  module: ModuleId;
  risk_level: RiskLevel;
  risk_score: number;
  current_rate_mm_mo: number;
}

export interface LiquidAnalysis {
  interpretation: string;
  confidence?: string;
  flags?: string[];
}

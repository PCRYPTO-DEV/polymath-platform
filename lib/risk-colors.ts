import type { RiskLevel } from "./types";

export const RISK_COLORS: Record<
  RiskLevel,
  { fill: string; bg: string; label: string; text: string; border: string }
> = {
  stable: {
    fill: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    label: "STABLE",
    text: "#16a34a",
    border: "rgba(34,197,94,0.4)",
  },
  monitor: {
    fill: "#eab308",
    bg: "rgba(234,179,8,0.12)",
    label: "MONITOR",
    text: "#ca8a04",
    border: "rgba(234,179,8,0.4)",
  },
  concerning: {
    fill: "#f97316",
    bg: "rgba(249,115,22,0.12)",
    label: "CONCERNING",
    text: "#ea580c",
    border: "rgba(249,115,22,0.4)",
  },
  dangerous: {
    fill: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    label: "DANGEROUS",
    text: "#dc2626",
    border: "rgba(239,68,68,0.4)",
  },
};

export const AETHER_ACCENT = "#06b6d4";
export const AETHER_ACCENT_GLOW = "rgba(6,182,212,0.15)";

export function getRiskColor(level: RiskLevel): string {
  return RISK_COLORS[level].fill;
}

export function getRiskLabel(level: RiskLevel): string {
  return RISK_COLORS[level].label;
}

export function getRiskBg(level: RiskLevel): string {
  return RISK_COLORS[level].bg;
}

export function getRiskText(level: RiskLevel): string {
  return RISK_COLORS[level].text;
}

export function getRiskBorder(level: RiskLevel): string {
  return RISK_COLORS[level].border;
}

export function getRiskScoreColor(score: number): string {
  if (score >= 75) return RISK_COLORS.dangerous.fill;
  if (score >= 50) return RISK_COLORS.concerning.fill;
  if (score >= 25) return RISK_COLORS.monitor.fill;
  return RISK_COLORS.stable.fill;
}

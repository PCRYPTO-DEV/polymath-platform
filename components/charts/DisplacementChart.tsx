"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import type { DisplacementPoint, RiskLevel } from "@/lib/types";
import { getRiskColor } from "@/lib/risk-colors";

interface Props {
  data: DisplacementPoint[];
  riskLevel: RiskLevel;
}

interface TooltipPayload {
  value: number;
  name: string;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const unit = p.dataKey === "rate_mm_mo" ? " mm/mo" : " mm";
  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        fontFamily: "monospace",
      }}
    >
      <div style={{ color: "#8b949e", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#f0f6fc", fontWeight: 600 }}>
        {typeof p.value === "number" ? p.value.toFixed(1) : "—"}{unit}
      </div>
    </div>
  );
}

// ── Bar colour by velocity ────────────────────────────────────────────────────
function barColor(rate: number): string {
  if (rate < -5)  return "#ef4444"; // red — accelerating
  if (rate < -2)  return "#f97316"; // orange — moderate
  if (rate < 0)   return "#eab308"; // yellow — slow
  return "#22c55e";                 // green — positive / recovery
}

// ── Linear regression slope over last N points ───────────────────────────────
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  values.forEach((y, i) => {
    sumX  += i;
    sumY  += y;
    sumXY += i * y;
    sumX2 += i * i;
  });
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

export default function DisplacementChart({ data, riskLevel }: Props) {
  const color       = getRiskColor(riskLevel);
  const gradientId  = `dg-${riskLevel}`;

  // ── Stats calculations ────────────────────────────────────────────────────
  const latestDisp  = data.length > 0 ? data[data.length - 1].displacement_mm : 0;
  const latestRate  = data.length > 0 ? data[data.length - 1].rate_mm_mo       : 0;

  // Days-to-critical: (latestDisp - (-100)) / |rate_per_day|  (rate is mm/mo → /30)
  const ratePerDay  = latestRate / 30;
  const daysToCrit  = ratePerDay < 0
    ? Math.max(0, Math.round((latestDisp - (-100)) / Math.abs(ratePerDay)))
    : Infinity;

  // Trend badge
  const trend: string =
    latestRate < -5  ? "▼ ACCELERATING" :
    latestRate < -2  ? "▼ WORSENING"    :
    latestRate < 0   ? "▼ SLOW DECLINE" :
    latestRate === 0 ? "— STABLE"        :
                       "▲ RECOVERING";
  const trendColor: string =
    latestRate < -5  ? "#ef4444" :
    latestRate < -2  ? "#f97316" :
    latestRate < 0   ? "#eab308" :
    latestRate === 0 ? "#8b949e"  :
                       "#22c55e";

  // Projected trend line: slope of last 6 months, extend 3 months forward
  const window6 = data.slice(-6);
  const slope   = linearSlope(window6.map(d => d.displacement_mm));
  const lastVal = window6.length > 0 ? window6[window6.length - 1].displacement_mm : 0;
  // Build projection data aligned to data labels — append 3 phantom points
  const projectionPoints = [1, 2, 3].map(offset => ({
    label: `+${offset}mo`,
    displacement_mm: undefined as number | undefined,
    projection: parseFloat((lastVal + slope * (window6.length - 1 + offset)).toFixed(1)),
    rate_mm_mo: undefined as number | undefined,
  }));
  const chartData = [
    ...data.map(d => ({ ...d, projection: undefined as number | undefined })),
    ...projectionPoints,
  ];

  const rateColor = barColor(latestRate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: 260 }}>

      {/* ── PANEL 1: Cumulative displacement timeline (120px) ─────────────── */}
      <div style={{ height: 120 }}>
        <div style={{
          fontSize: 9, color: "#484f58", fontFamily: "monospace",
          letterSpacing: "0.07em", paddingLeft: 2, marginBottom: 2,
        }}>
          CUMULATIVE DISPLACEMENT (mm)
        </div>
        <ResponsiveContainer width="100%" height={104}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.30} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2128" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#484f58", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#484f58", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}mm`}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Zero line */}
            <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 2" />
            {/* CAUTION threshold */}
            <ReferenceLine
              y={-50}
              stroke="#eab308"
              strokeDasharray="4 3"
              strokeWidth={1.2}
              label={{ value: "CAUTION", position: "insideTopRight", fill: "#eab308", fontSize: 8, fontFamily: "monospace" }}
            />
            {/* CRITICAL threshold */}
            <ReferenceLine
              y={-100}
              stroke="#ef4444"
              strokeDasharray="4 3"
              strokeWidth={1.2}
              label={{ value: "CRITICAL", position: "insideTopRight", fill: "#ef4444", fontSize: 8, fontFamily: "monospace" }}
            />
            {/* Actual displacement area */}
            <Area
              type="monotone"
              dataKey="displacement_mm"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color }}
              connectNulls={false}
            />
            {/* Projected trend dashed line */}
            <Line
              type="linear"
              dataKey="projection"
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls={true}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── PANEL 2: Monthly velocity bars (80px) ─────────────────────────── */}
      <div style={{ height: 80 }}>
        <div style={{
          fontSize: 9, color: "#484f58", fontFamily: "monospace",
          letterSpacing: "0.07em", paddingLeft: 2, marginBottom: 2,
        }}>
          MONTHLY VELOCITY (mm/mo)
        </div>
        <ResponsiveContainer width="100%" height={64}>
          <BarChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }} barSize={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2128" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#484f58", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#484f58", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#30363d" strokeWidth={1} />
            <Bar dataKey="rate_mm_mo" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={barColor(entry.rate_mm_mo)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── STATS ROW (40px) ──────────────────────────────────────────────── */}
      <div style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 4px",
        borderTop: "1px solid #21262d",
        marginTop: 2,
      }}>
        {/* Left: current rate */}
        <div style={{ fontFamily: "monospace", fontSize: 10 }}>
          <span style={{ color: "#484f58" }}>RATE </span>
          <span style={{ color: rateColor, fontWeight: 700 }}>
            {latestRate >= 0 ? "+" : ""}{latestRate.toFixed(1)} mm/mo
          </span>
        </div>

        {/* Centre: days to critical */}
        <div style={{ fontFamily: "monospace", fontSize: 10, textAlign: "center" }}>
          <span style={{ color: "#484f58" }}>TO -100mm </span>
          {daysToCrit === Infinity ? (
            <span style={{ color: "#22c55e", fontWeight: 700 }}>N/A</span>
          ) : (
            <span style={{ color: daysToCrit < 180 ? "#ef4444" : "#eab308", fontWeight: 700 }}>
              {daysToCrit}d
            </span>
          )}
        </div>

        {/* Right: trend badge */}
        <div style={{
          fontFamily: "monospace",
          fontSize: 9,
          color: trendColor,
          fontWeight: 700,
          background: `${trendColor}18`,
          border: `1px solid ${trendColor}44`,
          borderRadius: 4,
          padding: "2px 6px",
          letterSpacing: "0.04em",
        }}>
          {trend}
        </div>
      </div>
    </div>
  );
}

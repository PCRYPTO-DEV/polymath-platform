"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
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
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

// Hoisted outside component (rendering-hoist-jsx)
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#8b949e", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#f0f6fc", fontWeight: 600 }}>
        {payload[0].value.toFixed(1)} mm
      </div>
    </div>
  );
}

export default function DisplacementChart({ data, riskLevel }: Props) {
  const color = getRiskColor(riskLevel);
  const gradientId = `displacement-gradient-${riskLevel}`;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1c2128" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#484f58", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: "#484f58", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}mm`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 2" />
        <Area
          type="monotone"
          dataKey="displacement_mm"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

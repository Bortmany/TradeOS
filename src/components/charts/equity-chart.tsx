"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { EquityPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: EquityPoint[];
  height?: number;
  startingBalance?: number;
}

export function EquityChart({ data, height = 280, startingBalance = 0 }: Props) {
  const chartData = data.map((p) => ({
    time: p.time,
    value: p.value,
    label: new Date(p.time * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  const last = data[data.length - 1]?.value ?? startingBalance;
  const up = last >= startingBalance;
  const stroke = up ? "hsl(var(--profit))" : "hsl(var(--loss))";

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        No closed trades yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
        />
        {startingBalance > 0 && (
          <ReferenceLine y={startingBalance} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
        )}
        <Tooltip content={<EquityTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#equityFill)"
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EquityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{p.label}</p>
      <p className="mt-0.5 font-semibold tabular">{formatCurrency(p.value)}</p>
    </div>
  );
}

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
import { formatCurrency } from "@/lib/utils";

interface Props {
  /** Points from computeDrawdownSeries — `drawdown` may be signed either way. */
  data: { time: number; drawdown: number }[];
  height?: number;
}

/**
 * Underwater equity curve: peak-to-trough drawdown rendered below the zero line
 * in the loss color. Accepts either sign of `drawdown` and always plots the
 * negative magnitude so the area hangs beneath zero.
 */
export function DrawdownChart({ data, height = 240 }: Props) {
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

  const chartData = data.map((p) => ({
    time: p.time,
    value: -Math.abs(p.drawdown), // negative-going
    label: new Date(p.time * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  const stroke = "hsl(var(--loss))";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.3} />
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
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip content={<DrawdownTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#drawdownFill)"
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{p.label}</p>
      <p className="mt-0.5 font-semibold tabular text-loss">
        {formatCurrency(p.value)}
      </p>
    </div>
  );
}

"use client";

// Two-series equity comparison for backtest results: the strategy variant
// (sign-colored, filled) against the baseline of what actually happened
// (muted, dashed, no fill). Both series are cumulative P&L from 0.

import {
  Area,
  ComposedChart,
  Line,
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
  variant: EquityPoint[];
  baseline?: EquityPoint[];
  variantLabel?: string;
  baselineLabel?: string;
  height?: number;
}

export function ComparisonChart({
  variant,
  baseline = [],
  variantLabel = "Strategy",
  baselineLabel = "Baseline",
  height = 280,
}: Props) {
  if (variant.length === 0 && baseline.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        No closed trades in this test.
      </div>
    );
  }

  // Merge the two series onto one time axis; missing sides carry forward so
  // the lines stay continuous.
  const times = Array.from(
    new Set([...variant.map((p) => p.time), ...baseline.map((p) => p.time)])
  ).sort((a, b) => a - b);
  const variantAt = new Map(variant.map((p) => [p.time, p.value]));
  const baselineAt = new Map(baseline.map((p) => [p.time, p.value]));

  let lastVariant: number | null = null;
  let lastBaseline: number | null = null;
  const chartData = times.map((time) => {
    lastVariant = variantAt.get(time) ?? lastVariant;
    lastBaseline = baselineAt.get(time) ?? lastBaseline;
    return {
      time,
      variant: lastVariant,
      baseline: baseline.length > 0 ? lastBaseline : null,
      label: new Date(time * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  });

  const last = variant[variant.length - 1]?.value ?? 0;
  const stroke = last >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="comparisonFill" x1="0" y1="0" x2="0" y2="1">
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
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
        <Tooltip
          content={<ComparisonTooltip variantLabel={variantLabel} baselineLabel={baselineLabel} />}
        />
        {baseline.length > 0 && (
          <Line
            type="monotone"
            dataKey="baseline"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
        <Area
          type="monotone"
          dataKey="variant"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#comparisonFill)"
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ComparisonTooltip({ active, payload, variantLabel, baselineLabel }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{p.label}</p>
      {p.variant != null && (
        <p className="mt-0.5 font-semibold tabular">
          {variantLabel}: {formatCurrency(p.variant)}
        </p>
      )}
      {p.baseline != null && (
        <p className="mt-0.5 text-muted-foreground tabular">
          {baselineLabel}: {formatCurrency(p.baseline)}
        </p>
      )}
    </div>
  );
}

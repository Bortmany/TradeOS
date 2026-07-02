"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { BucketPerformance } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface Props {
  data: BucketPerformance[];
  height?: number;
  layout?: "horizontal" | "vertical";
}

/** A P&L-by-bucket bar chart. Bars are colored by profit/loss sign. */
export function BucketBar({ data, height = 240, layout = "horizontal" }: Props) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        Not enough data.
      </div>
    );
  }

  const color = (v: number) => (v >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))");

  if (layout === "vertical") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCurrency(v, { compact: true })}
          />
          <YAxis
            type="category"
            dataKey="key"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={88}
          />
          <Tooltip cursor={{ fill: "hsl(var(--accent))" }} content={<BucketTooltip />} />
          <Bar dataKey="netPnl" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={color(d.netPnl)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="key"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={data.length > 8 ? -35 : 0}
          textAnchor={data.length > 8 ? "end" : "middle"}
          height={data.length > 8 ? 50 : 24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
        />
        <Tooltip cursor={{ fill: "hsl(var(--accent))" }} content={<BucketTooltip />} />
        <Bar dataKey="netPnl" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={color(d.netPnl)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BucketTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BucketPerformance;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{d.key}</p>
      <p className={`mt-0.5 font-semibold tabular ${d.netPnl >= 0 ? "text-profit" : "text-loss"}`}>
        {formatCurrency(d.netPnl, { sign: true })}
      </p>
      <p className="text-muted-foreground">
        {d.tradeCount} trades · {formatPercent(d.winRate)} win
      </p>
    </div>
  );
}

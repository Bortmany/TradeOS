"use client";

import { useMemo, type CSSProperties } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";

interface DayPoint {
  date: string; // "YYYY-MM-DD"
  pnl: number;
  trades: number;
}

interface Props {
  data: DayPoint[];
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthBlock {
  key: string;
  label: string;
  year: number;
  month: number; // 0-11
  days: number;
  firstWeekday: number; // 0=Sun
}

/**
 * Compact monthly P&L heatmap. Profitable days render green, losing days red,
 * intensity scaled by magnitude relative to the window's largest |P&L| day.
 */
export function PnlCalendar({ data }: Props) {
  const { months, byDate, maxAbs } = useMemo(() => {
    const byDate = new Map<string, DayPoint>();
    let maxAbs = 0;
    for (const d of data) {
      byDate.set(d.date, d);
      maxAbs = Math.max(maxAbs, Math.abs(d.pnl));
    }

    // Determine the span of months present in the data.
    const monthKeys = new Set<string>();
    for (const d of data) monthKeys.add(d.date.slice(0, 7)); // "YYYY-MM"

    const months: MonthBlock[] = Array.from(monthKeys)
      .sort()
      .map((mk) => {
        const [y, m] = mk.split("-").map(Number);
        const first = new Date(Date.UTC(y, m - 1, 1));
        return {
          key: mk,
          label: `${MONTH_NAMES[m - 1]} ${y}`,
          year: y,
          month: m - 1,
          days: new Date(Date.UTC(y, m, 0)).getUTCDate(),
          firstWeekday: first.getUTCDay(),
        };
      });

    return { months, byDate, maxAbs };
  }, [data]);

  if (months.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No daily P&L yet.
      </div>
    );
  }

  function cellStyle(pnl: number): CSSProperties {
    const intensity = maxAbs > 0 ? Math.abs(pnl) / maxAbs : 0;
    const alpha = 0.18 + 0.62 * intensity;
    const token = pnl >= 0 ? "var(--profit)" : "var(--loss)";
    return { backgroundColor: `hsl(${token} / ${alpha.toFixed(3)})` };
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="grid gap-6 sm:grid-cols-2">
        {months.map((mb) => (
          <div key={mb.key}>
            <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {mb.label}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  className="text-center text-[9px] font-medium uppercase text-muted-foreground/60"
                >
                  {w}
                </div>
              ))}
              {Array.from({ length: mb.firstWeekday }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: mb.days }).map((_, i) => {
                const day = i + 1;
                const date = `${mb.year}-${String(mb.month + 1).padStart(2, "0")}-${String(
                  day
                ).padStart(2, "0")}`;
                const pt = byDate.get(date);
                if (!pt) {
                  return (
                    <div
                      key={date}
                      className="flex aspect-square items-center justify-center rounded-[4px] border border-border/40 text-[9px] text-muted-foreground/40"
                    >
                      {day}
                    </div>
                  );
                }
                const detail = (
                  <>
                    <p className={`font-semibold tabular ${pt.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {formatCurrency(pt.pnl, { sign: true })}
                    </p>
                    <p className="text-muted-foreground">
                      {pt.trades} {pt.trades === 1 ? "trade" : "trades"}
                    </p>
                  </>
                );
                return (
                  // Popover so the day's numbers open on tap/click (phones have
                  // no hover); the tooltip still serves pointer users on hover.
                  <Popover key={date}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${date}: ${formatCurrency(pt.pnl, { sign: true })}, ${pt.trades} ${pt.trades === 1 ? "trade" : "trades"}`}
                            className="flex aspect-square cursor-pointer items-center justify-center rounded-[4px] text-[9px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            style={cellStyle(pt.pnl)}
                          >
                            {day}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{detail}</TooltipContent>
                    </Tooltip>
                    <PopoverContent>{detail}</PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

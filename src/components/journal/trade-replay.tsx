"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pointMultiplier } from "@/lib/ingestion/symbols";
import { clamp, formatCurrency, formatNumber, pnlColor } from "@/lib/utils";
import type { Side } from "@/lib/types";

// Animated, deterministic replay of a single trade's price action. TradeOS's MVP
// has NO live market data, so — exactly like trade-context-chart — we synthesize
// a plausible intrabar path from the trade's own prices & times, seeded off the
// trade id so the same trade always replays identically. Purely schematic.

interface Props {
  id: string;
  symbol: string;
  side: Side;
  entryPrice: number;
  exitPrice: number | null;
  entryTime: Date;
  exitTime: Date | null;
  quantity: number;
  pnl: number;
}

const W = 640;
const H = 260;
const M = { top: 18, right: 16, bottom: 24, left: 16 };
const BASE_DURATION_MS = 9000; // full sweep at 1x
const SPEEDS = [1, 2, 4] as const;

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toPath(pts: readonly (readonly [number, number])[]): string {
  return pts
    .map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");
}

export function TradeReplay({
  id,
  symbol,
  side,
  entryPrice,
  exitPrice,
  entryTime,
  exitTime,
  quantity,
  pnl,
}: Props) {
  const open = exitPrice == null || exitTime == null;

  // --- deterministic price model (same technique as trade-context-chart) ---
  const model = useMemo(() => {
    const rand = mulberry32(hashSeed(id));
    const exitP = exitPrice ?? entryPrice;

    const Bn = 24; // before window
    const Dn = 32; // during trade
    const An = 20; // after
    const N = Bn + Dn + An;

    const outcomeVal = exitP - entryPrice;
    const base = Math.max(Math.abs(outcomeVal), Math.abs(entryPrice) * 0.003, 0.5);

    const prices: number[] = new Array(N);

    // before: random walk pinned to land on the entry price
    const beforeWalk: number[] = [];
    let acc = 0;
    for (let i = 0; i < Bn; i++) {
      acc += (rand() - 0.5) * base * 0.5;
      beforeWalk.push(acc);
    }
    const beforeEnd = beforeWalk[Bn - 1];
    for (let i = 0; i < Bn; i++) {
      prices[i] = entryPrice + (beforeWalk[i] - beforeEnd) * (0.4 + 0.6 * (1 - i / Bn));
    }
    prices[Bn - 1] = entryPrice;

    // during: entry -> exit with pinned endpoints and mild noise
    for (let i = 0; i < Dn; i++) {
      const f = (i + 1) / Dn;
      const line = entryPrice + (exitP - entryPrice) * f;
      const noise = (rand() - 0.5) * base * 0.35 * Math.sin(f * Math.PI);
      prices[Bn + i] = open ? entryPrice + (rand() - 0.5) * base * 0.5 : line + noise;
    }
    prices[Bn + Dn - 1] = exitP;

    // after: continues drifting from the exit
    let after = exitP;
    for (let i = 0; i < An; i++) {
      after += (rand() - 0.5) * base * 0.55;
      prices[Bn + Dn + i] = after;
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;

    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xAt = (i: number) => M.left + (i / (N - 1)) * plotW;
    const yAt = (p: number) => M.top + (1 - (p - min) / span) * plotH;

    const pts = prices.map((p, i) => [xAt(i), yAt(p)] as const);

    const entryIdx = Bn - 1;
    const exitIdx = open ? N - 1 : Bn + Dn - 1;

    return {
      prices,
      pts,
      N,
      min,
      span,
      xAt,
      yAt,
      entryIdx,
      exitIdx,
      entryX: xAt(entryIdx),
      exitX: xAt(open ? N - 1 : Bn + Dn - 1),
      plotRight: M.left + plotW,
    };
  }, [id, entryPrice, exitPrice, open]);

  // --- playback state ---
  const [progress, setProgress] = useState(0); // 0..1 across the whole series
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => Math.min(1, p + (dt / BASE_DURATION_MS) * speed));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed]);

  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  const onPlayPause = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progress >= 1) setProgress(0);
    setPlaying(true);
  };

  const onRestart = () => {
    setProgress(0);
    setPlaying(true);
  };

  const onSeek = (v: number) => {
    setPlaying(false);
    setProgress(clamp(v / 1000, 0, 1));
  };

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  // --- derived, per-frame (cheap) ---
  const { N, prices, pts, entryIdx, exitIdx } = model;
  const fIdx = progress * (N - 1);
  const head = Math.min(N - 1, Math.floor(fIdx));
  const frac = fIdx - head;

  const priceAt = (f: number) => {
    const lo = Math.floor(f);
    const hi = Math.min(N - 1, lo + 1);
    return prices[lo] + (prices[hi] - prices[lo]) * (f - lo);
  };
  const pointAt = (f: number): [number, number] => {
    const x = M.left + (f / (N - 1)) * (W - M.left - M.right);
    return [x, model.yAt(priceAt(f))];
  };

  const currentPrice = priceAt(fIdx);
  const headPt = pointAt(fIdx);

  // revealed polyline points (whole steps + interpolated head)
  const revealed: [number, number][] = pts.slice(0, head + 1).map(([x, y]) => [x, y]);
  if (frac > 0 && head < N - 1) revealed.push(headPt);

  const splitPath = (fromIdx: number, toIdx: number) => {
    const seg: [number, number][] = [];
    for (const [x, y] of revealed) {
      const idx = (x - M.left) / (W - M.left - M.right) * (N - 1);
      if (idx >= fromIdx - 0.001 && idx <= toIdx + 0.001) seg.push([x, y]);
    }
    return seg.length > 1 ? toPath(seg) : "";
  };

  // phase & outcome
  const phase: "before" | "in" | "after" =
    fIdx < entryIdx ? "before" : fIdx <= exitIdx || open ? "in" : "after";
  const entered = fIdx >= entryIdx;
  const closedNow = !open && fIdx >= exitIdx;

  const outcome = pnl > 0 ? "profit" : pnl < 0 ? "loss" : "muted";
  const outcomeClass =
    outcome === "profit" ? "text-profit" : outcome === "loss" ? "text-loss" : "text-muted-foreground";
  const outcomeDot =
    outcome === "profit" ? "bg-profit" : outcome === "loss" ? "bg-loss" : "bg-muted-foreground";

  const beforePath = splitPath(0, Math.min(fIdx, entryIdx));
  const duringPath = entered ? splitPath(entryIdx, Math.min(fIdx, exitIdx)) : "";
  const afterPath = closedNow ? splitPath(exitIdx, fIdx) : "";

  // --- live readouts ---
  const dir = side === "long" ? 1 : -1;
  const mult = pointMultiplier(symbol);
  const refPrice = closedNow ? (exitPrice as number) : currentPrice;
  const unreal = entered ? (refPrice - entryPrice) * dir * quantity * mult : 0;

  const holdMin =
    !open && exitTime ? (exitTime.getTime() - entryTime.getTime()) / 60000 : NaN;
  const duringProgress = clamp(
    (fIdx - entryIdx) / Math.max(1, exitIdx - entryIdx),
    0,
    1
  );
  const elapsedMin = Number.isFinite(holdMin) ? holdMin * duringProgress : NaN;

  const pnlLabel = !entered
    ? "Flat — not yet entered"
    : closedNow
      ? "Realized P&L"
      : "Unrealized P&L";
  const phaseLabel = !entered
    ? "Pre-entry"
    : open
      ? "In trade (open)"
      : closedNow
        ? "Closed"
        : "In trade";

  const headClass =
    phase === "in" ? outcomeClass : "text-muted-foreground";

  return (
    <div>
      {/* Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Animated schematic replay of the trade's price action"
      >
        {/* Phase regions */}
        <rect
          x={M.left}
          y={M.top}
          width={model.entryX - M.left}
          height={H - M.top - M.bottom}
          className="text-muted-foreground"
          fill="currentColor"
          fillOpacity={0.04}
        />
        {/* In-trade region — fill strength follows the theme token so the
            shading reads correctly on both paper-white and near-black. */}
        <rect
          x={model.entryX}
          y={M.top}
          width={Math.max(0, model.exitX - model.entryX)}
          height={H - M.top - M.bottom}
          className={outcomeClass}
          fill="currentColor"
          style={{ fillOpacity: "var(--chart-area-opacity)" }}
        />
        {!open && (
          <rect
            x={model.exitX}
            y={M.top}
            width={Math.max(0, model.plotRight - model.exitX)}
            height={H - M.top - M.bottom}
            className="text-muted-foreground"
            fill="currentColor"
            fillOpacity={0.04}
          />
        )}

        {/* Entry / exit guide lines */}
        <line
          x1={model.entryX}
          x2={model.entryX}
          y1={M.top}
          y2={H - M.bottom}
          className="text-border"
          stroke="currentColor"
          strokeDasharray="3 3"
        />
        {!open && (
          <line
            x1={model.exitX}
            x2={model.exitX}
            y1={M.top}
            y2={H - M.bottom}
            className="text-border"
            stroke="currentColor"
            strokeDasharray="3 3"
          />
        )}

        {/* Revealed path, split by phase */}
        {beforePath && (
          <path
            d={beforePath}
            className="text-muted-foreground/60"
            stroke="currentColor"
            strokeWidth={1.5}
            fill="none"
            strokeLinejoin="round"
          />
        )}
        {duringPath && (
          <path
            d={duringPath}
            className={outcomeClass}
            stroke="currentColor"
            strokeWidth={2.25}
            fill="none"
            strokeLinejoin="round"
          />
        )}
        {afterPath && (
          <path
            d={afterPath}
            className="text-muted-foreground/60"
            stroke="currentColor"
            strokeWidth={1.5}
            fill="none"
            strokeLinejoin="round"
          />
        )}

        {/* Entry marker (once reached) */}
        {entered && (
          <>
            <circle
              cx={model.pts[entryIdx][0]}
              cy={model.pts[entryIdx][1]}
              r={4}
              className="text-foreground"
              fill="currentColor"
            />
            <circle
              cx={model.pts[entryIdx][0]}
              cy={model.pts[entryIdx][1]}
              r={4}
              className="text-background"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </>
        )}

        {/* Exit marker (once reached, closed trades only) */}
        {closedNow && (
          <>
            <circle
              cx={model.pts[exitIdx][0]}
              cy={model.pts[exitIdx][1]}
              r={4}
              className={outcomeClass}
              fill="currentColor"
            />
            <circle
              cx={model.pts[exitIdx][0]}
              cy={model.pts[exitIdx][1]}
              r={4}
              className="text-background"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </>
        )}

        {/* Playhead */}
        <line
          x1={headPt[0]}
          x2={headPt[0]}
          y1={M.top}
          y2={H - M.bottom}
          className="text-foreground/30"
          stroke="currentColor"
          strokeWidth={1}
        />
        <circle cx={headPt[0]} cy={headPt[1]} r={5} className={headClass} fill="currentColor" />
        <circle
          cx={headPt[0]}
          cy={headPt[1]}
          r={5}
          className="text-background"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>

      {/* Live readout */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Readout label="Current price">
          <span className="tabular text-foreground">{formatNumber(currentPrice, 2)}</span>
        </Readout>
        <Readout label={pnlLabel}>
          <span className={`tabular ${entered ? pnlColor(unreal) : "text-muted-foreground"}`}>
            {entered ? formatCurrency(unreal, { sign: true }) : "—"}
          </span>
        </Readout>
        <Readout label="Elapsed in trade">
          <span className="tabular text-foreground">
            {!entered
              ? "—"
              : open
                ? `${Math.round(duringProgress * 100)}%`
                : `${formatElapsed(elapsedMin)} / ${formatElapsed(holdMin)}`}
          </span>
        </Readout>
      </div>

      {/* Controls — each icon-only control gets a hover hint. */}
      <TooltipProvider delayDuration={300}>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="secondary" onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause /> : <Play />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{playing ? "Pause" : "Play"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={onRestart} aria-label="Restart">
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restart</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="Seek"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-overlay accent-primary"
              />
            </TooltipTrigger>
            <TooltipContent>Seek</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={cycleSpeed} className="tabular" aria-label="Playback speed">
                <Gauge />
                {speed}x
              </Button>
            </TooltipTrigger>
            <TooltipContent>Playback speed</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Legend / disclaimer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground" /> Entry
          </span>
          {!open && (
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${outcomeDot}`} /> Exit
            </span>
          )}
          <span className="uppercase tracking-wide">{phaseLabel}</span>
        </div>
        <span className="uppercase tracking-wide text-muted-foreground/70">
          Schematic replay — not live market data
        </span>
      </div>
    </div>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{children}</p>
    </div>
  );
}

function formatElapsed(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

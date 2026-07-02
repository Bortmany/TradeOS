"use client";

import { useMemo } from "react";

// Schematic, deterministic price-context chart. There is NO live market data in
// TradeOS's MVP, so we synthesize a plausible-looking intrabar path from the
// trade's own entry/exit prices & times, seeded off the trade id so the same
// trade always renders the same picture. Purely illustrative context.

interface Props {
  tradeId: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  isWin: boolean | null;
  pnl: number;
}

const W = 640;
const H = 260;
const M = { top: 18, right: 16, bottom: 24, left: 16 };

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

export function TradeContextChart({ tradeId, side, entryPrice, exitPrice, isWin, pnl }: Props) {
  const model = useMemo(() => {
    const rand = mulberry32(hashSeed(tradeId));
    const open = exitPrice == null;
    const exitP = exitPrice ?? entryPrice;

    const Bn = 22; // before window
    const Dn = 22; // during trade
    const An = 18; // after
    const N = Bn + Dn + An;

    // Volatility scale relative to the move (or a small default for scratches).
    const base = Math.max(Math.abs(exitP - entryPrice), Math.abs(entryPrice) * 0.003, 0.5);

    const prices: number[] = new Array(N);

    // --- before: random walk that lands exactly on the entry price ---
    const beforeWalk: number[] = [];
    let acc = 0;
    for (let i = 0; i < Bn; i++) {
      acc += (rand() - 0.5) * base * 0.5;
      beforeWalk.push(acc);
    }
    const beforeEnd = beforeWalk[Bn - 1];
    for (let i = 0; i < Bn; i++) {
      // shift so the last before-point equals entryPrice, taper drift toward it
      prices[i] = entryPrice + (beforeWalk[i] - beforeEnd) * (0.4 + 0.6 * (1 - i / Bn));
    }
    prices[Bn - 1] = entryPrice;

    // --- during: entry -> exit with pinned endpoints and mild noise ---
    for (let i = 0; i < Dn; i++) {
      const f = (i + 1) / Dn;
      const line = entryPrice + (exitP - entryPrice) * f;
      const noise = (rand() - 0.5) * base * 0.35 * Math.sin(f * Math.PI);
      prices[Bn + i] = open ? entryPrice + (rand() - 0.5) * base * 0.5 : line + noise;
    }
    prices[Bn + Dn - 1] = exitP;

    // --- after: random walk continuing from the exit ---
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
    const x = (i: number) => M.left + (i / (N - 1)) * plotW;
    const y = (p: number) => M.top + (1 - (p - min) / span) * plotH;

    const pts = prices.map((p, i) => [x(i), y(p)] as const);
    const toPath = (arr: readonly (readonly [number, number])[]) =>
      arr.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

    const entryIdx = Bn - 1;
    const exitIdx = Bn + Dn - 1;

    return {
      open,
      full: toPath(pts),
      during: toPath(pts.slice(entryIdx, exitIdx + 1)),
      entry: pts[entryIdx],
      exit: pts[exitIdx],
      entryX: x(entryIdx),
      exitX: x(exitIdx),
      plotRight: M.left + plotW,
    };
  }, [tradeId, entryPrice, exitPrice]);

  const outcome = isWin === true || pnl > 0 ? "profit" : pnl < 0 ? "loss" : "muted-foreground";
  const outcomeClass =
    outcome === "profit" ? "text-profit" : outcome === "loss" ? "text-loss" : "text-muted-foreground";
  const sideLabel = side === "long" ? "Long" : "Short";

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Schematic price context around the trade"
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
        <rect
          x={model.entryX}
          y={M.top}
          width={Math.max(0, model.exitX - model.entryX)}
          height={H - M.top - M.bottom}
          className={outcomeClass}
          fill="currentColor"
          fillOpacity={0.1}
        />
        <rect
          x={model.exitX}
          y={M.top}
          width={Math.max(0, model.plotRight - model.exitX)}
          height={H - M.top - M.bottom}
          className="text-muted-foreground"
          fill="currentColor"
          fillOpacity={0.04}
        />

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
        {!model.open && (
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

        {/* Full path (context) */}
        <path
          d={model.full}
          className="text-muted-foreground/60"
          stroke="currentColor"
          strokeWidth={1.25}
          fill="none"
        />
        {/* During-trade segment, colored by outcome */}
        <path
          d={model.during}
          className={outcomeClass}
          stroke="currentColor"
          strokeWidth={2.25}
          fill="none"
          strokeLinejoin="round"
        />

        {/* Markers */}
        <circle cx={model.entry[0]} cy={model.entry[1]} r={4} className="text-foreground" fill="currentColor" />
        <circle cx={model.entry[0]} cy={model.entry[1]} r={4} className="text-background" fill="none" stroke="currentColor" strokeWidth={1.5} />
        {!model.open && (
          <>
            <circle cx={model.exit[0]} cy={model.exit[1]} r={4} className={outcomeClass} fill="currentColor" />
            <circle cx={model.exit[0]} cy={model.exit[1]} r={4} className="text-background" fill="none" stroke="currentColor" strokeWidth={1.5} />
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground" /> Entry
          </span>
          {!model.open && (
            <span className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${outcome === "profit" ? "bg-profit" : outcome === "loss" ? "bg-loss" : "bg-muted-foreground"}`} />{" "}
              Exit
            </span>
          )}
          <span>{sideLabel} · during-trade window shaded</span>
        </div>
        <span className="uppercase tracking-wide text-muted-foreground/70">
          Schematic — no live market data
        </span>
      </div>
    </div>
  );
}

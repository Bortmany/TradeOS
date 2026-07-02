// Fixture test for the ProjectX FIFO pairing engine (run: npx tsx scripts/test-pairing.ts)
import { pairFills, contractIdToSymbol, type ProjectXFill } from "../src/lib/connectors/topstepx";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}
const f = (
  id: number,
  contractId: string,
  side: 0 | 1,
  size: number,
  price: number,
  t: string,
  fees = 0,
  pnl: number | null = null
): ProjectXFill => ({
  id,
  accountId: 1,
  contractId,
  creationTimestamp: t,
  price,
  profitAndLoss: pnl,
  fees,
  side,
  size,
});

const ES = "CON.F.US.EP.U25";
const NQ = "CON.F.US.ENQ.U25";
const MES = "CON.F.US.MES.U25";

console.log("symbol mapping");
check("EP→ES", contractIdToSymbol(ES) === "ES");
check("ENQ→NQ", contractIdToSymbol(NQ) === "NQ");
check("unknown passthrough", contractIdToSymbol("CON.F.US.ZB.U25") === "ZB");

console.log("1. simple long win (2 ES, +2pts, $4 fees/side)");
{
  const t = pairFills([
    f(1, ES, 0, 2, 5000, "2026-07-01T13:35:00Z", 4),
    f(2, ES, 1, 2, 5002, "2026-07-01T13:50:00Z", 4),
  ]);
  check("one round trip", t.length === 1, t);
  check("side long", t[0]?.side === "long");
  check("gross 2pts×2×$50 = 200", t[0]?.pnlGross === 200, t[0]);
  check("fees 8, net 192", t[0]?.fees === 8 && t[0]?.pnl === 192, t[0]);
  check("externalId from closing fill", t[0]?.externalId === "px-2");
}

console.log("2. short win (1 NQ, −10pts)");
{
  const t = pairFills([
    f(3, NQ, 1, 1, 18000, "2026-07-01T14:00:00Z", 2),
    f(4, NQ, 0, 1, 17990, "2026-07-01T14:20:00Z", 2),
  ]);
  check("side short, gross 10×20=200, net 196", t[0]?.side === "short" && t[0]?.pnlGross === 200 && t[0]?.pnl === 196, t[0]);
}

console.log("3. partial closes (buy 3 MES, sell 1, sell 2)");
{
  const t = pairFills([
    f(5, MES, 0, 3, 5000, "2026-07-01T13:35:00Z", 3),
    f(6, MES, 1, 1, 5004, "2026-07-01T13:45:00Z", 1),
    f(7, MES, 1, 2, 4998, "2026-07-01T14:05:00Z", 2),
  ]);
  check("two round trips", t.length === 2, t.length);
  check("first: qty1 +4pts×$5=20 gross", t[0]?.quantity === 1 && t[0]?.pnlGross === 20, t[0]);
  check("second: qty2 −2pts → −20 gross", t[1]?.quantity === 2 && t[1]?.pnlGross === -20, t[1]);
  check("fees split proportionally (1+1=2 / 2+2=4)", t[0]?.fees === 2 && t[1]?.fees === 4, [t[0]?.fees, t[1]?.fees]);
}

console.log("4. reversal (long 1 → sell 3 → buy 2)");
{
  const t = pairFills([
    f(8, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(9, ES, 1, 3, 5010, "2026-07-01T13:55:00Z", 6),
    f(10, ES, 0, 2, 5005, "2026-07-01T14:15:00Z", 4),
  ]);
  check("two round trips", t.length === 2, t.length);
  check("first closes the long: qty1 +10pts=500 gross", t[0]?.side === "long" && t[0]?.quantity === 1 && t[0]?.pnlGross === 500, t[0]);
  check("second closes the reversal short: qty2 (5010−5005)×2×50=500", t[1]?.side === "short" && t[1]?.quantity === 2 && t[1]?.pnlGross === 500, t[1]);
}

console.log("5. scale-in weighted entry (1@5000 + 1@5002 → sell 2@5003)");
{
  const t = pairFills([
    f(11, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(12, ES, 0, 1, 5002, "2026-07-01T13:40:00Z", 2),
    f(13, ES, 1, 2, 5003, "2026-07-01T13:55:00Z", 4),
  ]);
  check("entry weighted to 5001", t[0]?.entryPrice === 5001, t[0]);
  check("gross (5003−5001)×2×50=200", t[0]?.pnlGross === 200, t[0]);
  check("entryTime = first lot (FIFO)", t[0]?.entryTime.toISOString() === "2026-07-01T13:35:00.000Z", t[0]?.entryTime);
}

console.log("6. gateway P&L passthrough when fill fully matched");
{
  const t = pairFills([
    f(14, ES, 0, 1, 5000, "2026-07-01T13:35:00Z", 2),
    f(15, ES, 1, 1, 5002, "2026-07-01T13:50:00Z", 2, 97.5), // gateway says 97.5 gross
  ]);
  check("uses gateway pnl 97.5 gross, net 93.5", t[0]?.pnlGross === 97.5 && t[0]?.pnl === 93.5, t[0]);
}

console.log("7. open position emits no trade");
{
  const t = pairFills([f(16, ES, 0, 2, 5000, "2026-07-01T13:35:00Z", 4)]);
  check("no round trips for open position", t.length === 0, t);
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll pairing checks passed.");

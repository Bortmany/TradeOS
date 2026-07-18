// TradeOS — best-effort compliance recompute, shared by the API routes that
// mutate trades. Wraps `recomputeUserCompliance` so the caller's write always
// succeeds even if the recompute fails: the dynamic import + try/catch means
// neither a module-load failure nor a recompute error can break the request.
// Denormalized scores/snapshots simply catch up on the next successful pass.

import "server-only";

export async function recomputeCompliance(userId: string): Promise<void> {
  try {
    const { recomputeUserCompliance } = await import("@/lib/rules/recompute");
    await recomputeUserCompliance(userId);
  } catch {
    /* best-effort */
  }
}

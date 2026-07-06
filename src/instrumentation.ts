// Next.js instrumentation hook — runs once when the server boots.
// Used to start the in-process broker auto-sync scheduler on persistent-server
// deployments (Railway/VPS/Docker). No-ops on serverless (Vercel) and in the
// edge runtime.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSync } = await import("@/lib/auto-sync");
    startAutoSync();
  }
}

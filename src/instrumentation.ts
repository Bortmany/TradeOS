// Next.js instrumentation hook — runs once when the server boots.
// Used to (1) initialize Sentry error tracking when it's configured, and
// (2) start the in-process broker auto-sync scheduler on persistent-server
// deployments (Railway/VPS/Docker). No-ops on serverless (Vercel) and in the
// edge runtime.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Error tracking — DORMANT until keyed. With no SENTRY_DSN set, nothing is
    // imported or initialized, so the SDK has zero effect on a fresh install.
    if (process.env.SENTRY_DSN) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        // Error tracking only by default; opt into tracing via env if wanted.
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      });
    }

    const { startAutoSync } = await import("@/lib/auto-sync");
    startAutoSync();
  }
}

// Forwards server-side request errors (API routes, RSC renders) to Sentry when
// it's configured. Inert with no SENTRY_DSN. Next.js calls this automatically.
export async function onRequestError(
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRequestError
  >
) {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  }
}

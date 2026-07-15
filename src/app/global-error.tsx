"use client";

// Root error boundary. This catches errors thrown in the root layout itself —
// the cases the per-group `(app)/error.tsx` can't reach — so the user always
// sees a plain-English "something went wrong" instead of a blank screen.
// Because it replaces the whole document, it must render its own <html>/<body>
// and can't rely on the app's stylesheet, so the styling here is inline.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Report to Sentry when it's configured. The import is dynamic and wrapped
    // so that with no Sentry set up this is a harmless no-op — nothing runs and
    // nothing is sent.
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureException?.(error))
      .catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0c10",
          color: "#e6e8eb",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#9aa1a9" }}>
            The app hit an unexpected error and couldn&apos;t finish loading.
            Please try again — if it keeps happening, reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#0a0c10",
              background: "#e6e8eb",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#6b7280",
              }}
            >
              Ref {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

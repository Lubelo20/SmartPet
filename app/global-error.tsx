"use client";

import { useEffect } from "react";

/**
 * The last line of defence: this replaces the root layout, so it cannot use the
 * app's providers, fonts or primitives — it must stand entirely on its own and
 * render its own <html> and <body>. Reached only when the root layout itself
 * throws.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal error in the root layout:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ maxWidth: "28rem", width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "1rem", padding: "2rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
              The dashboard could not start
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 1.5rem" }}>
              Reloading usually clears this. The feeder itself is unaffected.
            </p>
            <button
              onClick={reset}
              style={{ background: "#f59e0b", color: "#0f172a", border: 0, borderRadius: "0.75rem", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "1.5rem" }}>
                Reference <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}

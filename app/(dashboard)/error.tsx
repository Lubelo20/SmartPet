"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { FeederError } from "@/lib/errors";

/**
 * Scoped to the dashboard route group, so a failing page is replaced while the
 * sidebar, header and device status stay put — the user keeps their bearings
 * and can navigate somewhere else instead of losing the whole app.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error on a dashboard route:", error);
  }, [error]);

  const message =
    error instanceof FeederError
      ? error.message
      : "This page could not be displayed. Your pets, schedules and history are unaffected.";

  return (
    <Card>
      <ErrorState title="Something went wrong" message={message} onRetry={reset} />
    </Card>
  );
}

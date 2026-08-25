"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { FeederError } from "@/lib/errors";

/**
 * Catches anything thrown while rendering a route. Without this, Next shows a
 * bare "Application error: a client-side exception has occurred" — an unstyled
 * dead end with no way back, which is what a user would have seen if
 * `getFirebase()` threw on an unconfigured deployment.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The screen shows a sentence; the console keeps the detail for whoever
    // has to diagnose it.
    console.error("Unhandled error while rendering:", error);
  }, [error]);

  // FeederError messages are written for people. Anything else is a programming
  // error whose message would only confuse.
  const message =
    error instanceof FeederError
      ? error.message
      : "Something went wrong while loading this screen. The feeder itself is unaffected.";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <ErrorState title="This screen could not load" message={message} onRetry={reset} />
        <div className="flex justify-center gap-2 pb-6">
          <Link href="/">
            <Button variant="ghost">Back to dashboard</Button>
          </Link>
        </div>
        {error.digest && (
          <p className="pb-5 text-center text-xs text-muted">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </Card>
    </div>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FeederDataProvider } from "@/hooks/useFeederData";
import { ToastProvider } from "@/hooks/useToast";
import { useAuth } from "@/lib/firebase/auth-provider";
import { ServicesProvider } from "@/services/services-provider";

/**
 * This gate is UX, not security. `firestore.rules` is the boundary and holds
 * regardless of what the client renders. There is deliberately no Next
 * middleware: with no server session cookie, a middleware check would be
 * theatre.
 *
 * In mock mode `status` is always "ready" and `householdId` is
 * "demo-household", so nothing redirects and the dashboard runs with no
 * Firebase config at all.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status, householdId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") router.replace("/sign-in");
    if (status === "no-household") router.replace("/join");
  }, [status, router]);

  // Never the sign-in page here: a flash of it on every reload is the bug the
  // "resolving" state exists to prevent.
  if (status === "resolving") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <LoadingState label="Checking your session" rows={2} />
        </Card>
      </div>
    );
  }

  if (status !== "ready" || !householdId) return null;

  return (
    <ServicesProvider householdId={householdId} key={householdId}>
      <ToastProvider>
        <FeederDataProvider>
          <DashboardShell>{children}</DashboardShell>
        </FeederDataProvider>
      </ToastProvider>
    </ServicesProvider>
  );
}

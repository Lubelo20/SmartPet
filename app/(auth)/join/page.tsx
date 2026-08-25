"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAuth } from "@/lib/firebase/auth-provider";
import { toFeederError } from "@/lib/errors";

export default function JoinPage() {
  const { status, pendingInviteHid, acceptInvite, createHousehold } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed-out") router.replace("/sign-in");
    if (status === "ready") router.replace("/");
  }, [status, router]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true); setError(null);
    try { await action(); router.replace("/"); }
    catch (e) { setError(toFeederError(e, fallback).message); }
    finally { setBusy(false); }
  }

  if (status === "resolving") {
    return <Card><LoadingState label="Checking your invitation" rows={2} /></Card>;
  }

  if (!pendingInviteHid) {
    return (
      <Card>
        <EmptyState
          icon={MailOpen}
          title="No invitation waiting"
          message="Nobody has invited you to a household yet. You can set up your own instead."
          action={
            <Button
              disabled={busy}
              onClick={() => run(createHousehold, "Could not create your household.")}
            >
              Create my household
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4">
          <MailOpen size={22} />
        </div>
        <p className="text-sm font-semibold text-ink">You have been invited</p>
        <p className="text-sm text-muted mt-1">
          Someone has invited you to share their feeder. Accepting adds you to their household.
        </p>
      </div>

      <div className="space-y-3 mt-6">
        <Button
          size="lg" className="w-full" disabled={busy}
          onClick={() => run(acceptInvite, "Could not join that household.")}
        >
          Accept invitation
        </Button>
        <Button
          variant="ghost" size="lg" className="w-full" disabled={busy}
          onClick={() => run(createHousehold, "Could not create your household.")}
        >
          Create my own household instead
        </Button>
      </div>

      {error && <ErrorState title="Could not join" message={error} />}
    </Card>
  );
}

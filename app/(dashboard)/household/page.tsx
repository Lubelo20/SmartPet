"use client";

import { useState, type FormEvent } from "react";
import { MailPlus, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";
import { useAuth } from "@/lib/firebase/auth-provider";
import { fmtDate } from "@/lib/utils";

export default function HouseholdPage() {
  const {
    loading, loadError, reload,
    householdName, members, invites, inviteMember, revokeInvite,
  } = useFeederData();
  const { user } = useAuth();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    // The provider toasts both outcomes; swallow here so a rejection does not
    // become an unhandled promise error.
    try { await inviteMember(email); setEmail(""); } catch { /* already reported */ }
    finally { setBusy(false); }
  }

  async function onRevoke(target: string) {
    setBusy(true);
    try { await revokeInvite(target); } catch { /* already reported */ }
    finally { setBusy(false); }
  }

  if (loadError) return <Card><ErrorState message={loadError} onRetry={() => void reload()} /></Card>;
  if (loading) return <Card><LoadingState label="Loading household" rows={3} /></Card>;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionHead
          title={householdName || "Your household"}
          subtitle={`${members.length} ${members.length === 1 ? "person shares" : "people share"} this feeder`}
        />
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.uid} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
              <span className="w-9 h-9 rounded-full bg-surface-2 text-muted flex items-center justify-center shrink-0">
                <UserRound size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink truncate">
                  {m.displayName || m.email || m.uid}
                </span>
                <span className="block text-xs text-muted truncate">
                  {m.displayName && m.email
                    ? m.email
                    : !m.email && !m.displayName
                      ? "Has not signed in since sharing was added"
                      : " "}
                </span>
              </span>
              {m.uid === user?.uid && <Badge tone="info">You</Badge>}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead
          title="Invite someone"
          subtitle="They will be able to see and feed your pets. Invite people you trust."
        />
        <form onSubmit={onInvite} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <span className="flex-1">
            <Field label="Email address">
              <Input
                type="email" value={email} required placeholder="them@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </span>
          <Button type="submit" disabled={busy || !email.trim()} icon={MailPlus}>Send invite</Button>
        </form>
        <p className="text-xs text-muted mt-2">
          They accept the first time they sign in with that address.
        </p>
      </Card>

      <Card className="p-5">
        <SectionHead
          title="Pending invitations"
          subtitle="Not yet accepted. Revoking stops them joining."
        />
        {invites.length === 0 ? (
          <EmptyState
            icon={MailPlus}
            title="No pending invitations"
            message="Anyone you invite appears here until they sign in and accept."
          />
        ) : (
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.email} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink truncate">{i.email}</span>
                  <span className="block text-xs text-muted">
                    Invited {i.createdAt ? fmtDate(i.createdAt) : "recently"}
                  </span>
                </span>
                <Button
                  variant="danger" size="sm" icon={Trash2} disabled={busy}
                  onClick={() => void onRevoke(i.email)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

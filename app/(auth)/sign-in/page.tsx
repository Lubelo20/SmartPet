"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAuth } from "@/lib/firebase/auth-provider";
import { toFeederError } from "@/lib/errors";

export default function SignInPage() {
  const {
    status, pendingInviteHid, signInWithPassword, registerWithPassword,
    signInWithGoogle, createHousehold,
  } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "ready") { router.replace("/"); return; }
    if (status === "no-household") {
      if (pendingInviteHid) { router.replace("/join"); return; }
      // Nobody invited them and they have no household: make one and go in.
      void createHousehold().then(() => router.replace("/")).catch((e) => {
        setError(toFeederError(e, "Could not set up your household.").message);
      });
    }
  }, [status, pendingInviteHid, router, createHousehold]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "sign-in") await signInWithPassword(email, password);
      else await registerWithPassword(email, password);
    } catch (err) {
      setError(toFeederError(err, "Could not sign you in.").message);
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true); setError(null);
    try { await signInWithGoogle(); }
    catch (err) { setError(toFeederError(err, "Google sign-in did not complete.").message); }
    finally { setBusy(false); }
  }

  // A returning user must not see a flash of the sign-in form while Firebase
  // restores their session.
  if (status === "resolving" || status === "ready") {
    return <Card><LoadingState label="Checking your session" rows={2} /></Card>;
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email" value={email} required autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" hint={mode === "register" ? "At least six characters." : undefined}>
          <Input
            type="password" value={password} required
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button variant="ghost" size="lg" disabled={busy} className="w-full" onClick={onGoogle}>
        Continue with Google
      </Button>

      <p className="text-sm text-muted text-center mt-5">
        {mode === "sign-in" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-semibold text-amber-600 hover:text-amber-700"
          onClick={() => { setMode(mode === "sign-in" ? "register" : "sign-in"); setError(null); }}
        >
          {mode === "sign-in" ? "Create one" : "Sign in"}
        </button>
      </p>

      {error && <ErrorState title="Sign-in failed" message={error} />}
    </Card>
  );
}

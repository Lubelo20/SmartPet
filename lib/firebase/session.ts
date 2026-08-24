import type { SessionStatus } from "@/lib/types";

export type AuthUser = { uid: string; email: string | null; displayName: string | null };

export type AuthValue = {
  status: SessionStatus;
  user: AuthUser | null;
  householdId: string | null;
  pendingInviteHid: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutNow: () => Promise<void>;
  acceptInvite: () => Promise<void>;
  createHousehold: () => Promise<void>;
};

/**
 * Mock mode's fixed session. The dashboard must run with no Firebase config at
 * all, so AuthProvider yields this before it ever touches getFirebase().
 *
 * Lives in a plain .ts module rather than beside the provider because tsconfig
 * sets jsx: "preserve" for Next's compiler, which leaves vite unable to parse a
 * .tsx import from a test.
 */
export const MOCK_SESSION: Pick<AuthValue, "status" | "user" | "householdId" | "pendingInviteHid"> = {
  status: "ready",
  user: { uid: "demo-user", email: "demo@example.com", displayName: "Demo" },
  householdId: "demo-household",
  pendingInviteHid: null,
};

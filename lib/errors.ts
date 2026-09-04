export type FeederErrorKind = "denied" | "offline" | "not-found" | "unknown";

/**
 * The error both adapters throw. Firestore raises opaque codes and
 * "FirebaseError: Missing or insufficient permissions" is not a sentence
 * anyone feeding their dog should have to read; mapping happens once, here,
 * so error paths stay testable without a backend.
 */
export class FeederError extends Error {
  constructor(readonly kind: FeederErrorKind, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FeederError";
  }
}

const hasCode = (e: unknown): e is { code: string } =>
  typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";

export function toFeederError(e: unknown, fallback: string): FeederError {
  if (e instanceof FeederError) return e;
  if (hasCode(e)) {
    switch (e.code) {
      case "permission-denied":
        return new FeederError("denied", "You do not have access to this feeder.", e);
      case "unavailable":
      case "deadline-exceeded":
        return new FeederError("offline", "Cannot reach the feeder data. Check your connection.", e);
      case "not-found":
        return new FeederError("not-found", "That record no longer exists.", e);
      case "failed-precondition":
        // Nearly always a missing composite index; say so while developing.
        return new FeederError("unknown", "This query needs a Firestore index that has not been created yet.", e);

      // Firebase Auth has its own code namespace. Without these every sign-in
      // failure arrives as the caller's fallback, so a project with auth
      // switched off reads as a rejected password.
      case "auth/configuration-not-found":
        return new FeederError(
          "unknown",
          "Sign-in is not switched on for this project yet. Enable it in the Firebase console.",
          e,
        );
      case "auth/unauthorized-domain":
        return new FeederError(
          "denied",
          "This site is not an authorised domain for sign-in.",
          e,
        );
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        // Deliberately one message for all three: saying which half was wrong
        // tells an attacker whether the address is registered.
        return new FeederError("denied", "That email address or password is not correct.", e);
      case "auth/email-already-in-use":
        return new FeederError("denied", "That email address already has an account. Sign in instead.", e);
      case "auth/weak-password":
        return new FeederError("unknown", "Choose a password of at least six characters.", e);
      case "auth/invalid-email":
        return new FeederError("unknown", "That does not look like an email address.", e);
      case "auth/too-many-requests":
        return new FeederError("denied", "Too many attempts. Wait a few minutes and try again.", e);
      case "auth/network-request-failed":
        return new FeederError("offline", "Cannot reach the sign-in service. Check your connection.", e);
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return new FeederError("unknown", "The Google sign-in window closed before it finished.", e);
      case "auth/popup-blocked":
        return new FeederError("unknown", "Your browser blocked the Google sign-in window.", e);

      default:
        break;
    }
  }
  return new FeederError("unknown", fallback, e);
}

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
      default:
        break;
    }
  }
  return new FeederError("unknown", fallback, e);
}

import { describe, expect, it } from "vitest";
import { FeederError, toFeederError } from "@/lib/errors";

class FakeFirebaseError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "FirebaseError"; }
}

describe("toFeederError", () => {
  it("passes a FeederError through unchanged", () => {
    const original = new FeederError("denied", "Nope");
    expect(toFeederError(original, "fallback")).toBe(original);
  });

  it("maps permission-denied to a readable message", () => {
    const err = toFeederError(new FakeFirebaseError("permission-denied", "Missing or insufficient permissions."), "fallback");
    expect(err.kind).toBe("denied");
    expect(err.message).toBe("You do not have access to this feeder.");
  });

  it("maps unavailable to offline", () => {
    const err = toFeederError(new FakeFirebaseError("unavailable", "backend unreachable"), "fallback");
    expect(err.kind).toBe("offline");
    expect(err.message).toBe("Cannot reach the feeder data. Check your connection.");
  });

  it("maps not-found", () => {
    expect(toFeederError(new FakeFirebaseError("not-found", "no doc"), "fallback").kind).toBe("not-found");
  });

  it("calls out a missing index on failed-precondition", () => {
    const err = toFeederError(new FakeFirebaseError("failed-precondition", "The query requires an index."), "fallback");
    expect(err.kind).toBe("unknown");
    expect(err.message).toContain("index");
  });

  it("falls back for an unrecognised error and keeps the cause", () => {
    const raw = new Error("something odd");
    const err = toFeederError(raw, "Could not load feeder data.");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Could not load feeder data.");
    expect(err.cause).toBe(raw);
  });

  it("handles a thrown non-Error", () => {
    const err = toFeederError("just a string", "Could not load feeder data.");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Could not load feeder data.");
  });
});

/**
 * Firebase Auth raises its own code namespace, which went unmapped: every
 * failure — a wrong password, an unprovisioned project — reached the user as
 * the caller's generic fallback. A live deploy failed on
 * auth/configuration-not-found and the screen said "Could not create that
 * account", which sent the reader looking at their password.
 */
describe("toFeederError — Firebase Auth codes", () => {
  it("says sign-in is not enabled when the project has no auth config", () => {
    const err = toFeederError(
      new FakeFirebaseError("auth/configuration-not-found", "CONFIGURATION_NOT_FOUND"),
      "Could not create that account.",
    );
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe(
      "Sign-in is not switched on for this project yet. Enable it in the Firebase console.",
    );
  });

  it("names the authorised-domain problem rather than failing silently", () => {
    const err = toFeederError(
      new FakeFirebaseError("auth/unauthorized-domain", "domain not allowlisted"),
      "fallback",
    );
    expect(err.kind).toBe("denied");
    expect(err.message).toContain("authorised domain");
  });

  it.each([
    "auth/invalid-credential",
    "auth/wrong-password",
    "auth/user-not-found",
  ])("treats %s as a plain credential mismatch", (code) => {
    const err = toFeederError(new FakeFirebaseError(code, "nope"), "fallback");
    expect(err.kind).toBe("denied");
    expect(err.message).toBe("That email address or password is not correct.");
  });

  it("tells an existing user to sign in instead of registering", () => {
    const err = toFeederError(
      new FakeFirebaseError("auth/email-already-in-use", "EMAIL_EXISTS"),
      "Could not create that account.",
    );
    expect(err.message).toBe("That email address already has an account. Sign in instead.");
  });

  it("states the password length rule", () => {
    const err = toFeederError(new FakeFirebaseError("auth/weak-password", "WEAK_PASSWORD"), "fallback");
    expect(err.message).toContain("six characters");
  });

  it("maps a network failure to offline, like the Firestore codes do", () => {
    const err = toFeederError(
      new FakeFirebaseError("auth/network-request-failed", "network error"),
      "fallback",
    );
    expect(err.kind).toBe("offline");
  });

  it("does not treat a closed Google popup as a failure worth alarming about", () => {
    const err = toFeederError(
      new FakeFirebaseError("auth/popup-closed-by-user", "popup closed"),
      "Google sign-in did not complete.",
    );
    expect(err.message).toBe("The Google sign-in window closed before it finished.");
  });

  it("keeps the original error as the cause", () => {
    const raw = new FakeFirebaseError("auth/wrong-password", "nope");
    expect(toFeederError(raw, "fallback").cause).toBe(raw);
  });
});

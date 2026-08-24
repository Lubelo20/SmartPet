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

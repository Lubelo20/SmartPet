import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOCK_SESSION } from "@/lib/firebase/session";

describe("auth provider", () => {
  it("exposes a fixed fake session for mock mode", () => {
    expect(MOCK_SESSION.status).toBe("ready");
    expect(MOCK_SESSION.householdId).toBe("demo-household");
    expect(MOCK_SESSION.user?.uid).toBe("demo-user");
  });

  it("never redirects in mock mode, because status is always ready", () => {
    expect(MOCK_SESSION.status).not.toBe("signed-out");
  });

  it("treats resolving as a distinct state from signed-out", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(source).toContain('"resolving"');
    expect(source).toContain('"signed-out"');
    expect(source).toContain('"no-household"');
  });

  it("subscribes with onAuthStateChanged and unsubscribes", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(source).toContain("onAuthStateChanged");
    // The effect must return the unsubscribe, or a second mount double-subscribes.
    expect(/return\s+onAuthStateChanged|return\s+unsub/.test(source)).toBe(true);
  });

  it("does not construct firebase at module scope", () => {
    const source = readFileSync("lib/firebase/auth-provider.tsx", "utf8");
    expect(/^const \w+ = getFirebase\(\)/m.test(source)).toBe(false);
  });
});

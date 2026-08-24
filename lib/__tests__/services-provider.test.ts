import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("services/services-provider.tsx", "utf8");

describe("services provider wiring", () => {
  it("branches on CONFIG.dataSource", () => {
    expect(source).toContain("CONFIG.dataSource");
    expect(source).toContain("createFirebaseAdapter");
    expect(source).toContain("createMockAdapter");
  });

  it("still constructs everything inside a single state initialiser", () => {
    expect(source).toContain("useState");
    // Construction at module scope would run during prerender.
    expect(/^const \w+ = create(Mock|Firebase)Adapter\(/m.test(source)).toBe(false);
  });

  it("takes the household id as a prop rather than reading auth itself", () => {
    // Keeps the provider testable and makes the remount boundary explicit.
    expect(source).toContain("householdId");
  });
});

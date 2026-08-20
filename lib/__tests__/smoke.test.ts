import { describe, expect, it } from "vitest";
import { clamp } from "@/lib/utils";

describe("harness", () => {
  it("resolves the @/ alias and runs a real import", () => {
    expect(clamp(12, 0, 10)).toBe(10);
  });
});

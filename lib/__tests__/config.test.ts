import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG } from "@/lib/config";

describe("CONFIG", () => {
  it("falls back to mock/simulation defaults when env is unset", () => {
    expect(CONFIG.dataSource).toBe("mock");
    expect(CONFIG.transport).toBe("simulation");
    expect(CONFIG.useEmulators).toBe(false);
    expect(CONFIG.deviceId).toBe("ESP32-PETFEEDER-001");
    expect(CONFIG.hopperCapacityG).toBe(800);
    expect(CONFIG.lowFoodThreshold).toBe(0.2);
  });

  it("reads env vars literally so Next can inline them", () => {
    const source = readFileSync("lib/config.ts", "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_DATA_SOURCE");
    expect(source).toContain("process.env.NEXT_PUBLIC_USE_EMULATORS");
    expect(source).not.toMatch(/const\s+env\s*=/);
  });
});

describe("hopper capacity", () => {
  it("matches the printed hopper in design/scad/common.scad", () => {
    // 2.0 L at 0.40 g/cm^3 dry kibble bulk density.
    expect(CONFIG.hopperCapacityG).toBe(800);
  });
});

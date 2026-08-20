import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clamp, dayKey, fmtDate, fmtShort, fmtTime, fmtUptime, resetSeed, rint, rnd, timeAgo, uid } from "@/lib/utils";

describe("formatters", () => {
  const at = new Date(2026, 7, 20, 9, 5).getTime(); // 20 Aug 2026, 09:05 local

  it("formats dates, times and short dates", () => {
    expect(fmtDate(at)).toBe("20 Aug 2026");
    expect(fmtTime(at)).toBe("09:05");
    expect(fmtShort(at)).toBe("20 Aug");
  });

  it("formats uptime across day, hour and minute scales", () => {
    expect(fmtUptime(183642)).toBe("2d 3h 0m");
    expect(fmtUptime(3725)).toBe("1h 2m 05s");
    expect(fmtUptime(65)).toBe("1m 05s");
  });

  it("keys days as ISO dates", () => {
    expect(dayKey(Date.UTC(2026, 7, 20, 12))).toBe("2026-08-20");
  });

  it("clamps to bounds", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("timeAgo", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 7, 20, 12, 0, 0)));
  afterEach(() => vi.useRealTimers());

  it("describes elapsed time in the largest sensible unit", () => {
    const now = Date.now();
    expect(timeAgo(0)).toBe("never");
    expect(timeAgo(now - 1000)).toBe("just now");
    expect(timeAgo(now - 30_000)).toBe("30 seconds ago");
    expect(timeAgo(now - 60_000)).toBe("1 minute ago");
    expect(timeAgo(now - 3 * 60_000)).toBe("3 minutes ago");
    expect(timeAgo(now - 2 * 3_600_000)).toBe("2 hours ago");
    expect(timeAgo(now - 3 * 86_400_000)).toBe("3 days ago");
  });
});

describe("seeded PRNG", () => {
  beforeEach(() => resetSeed());

  it("produces the same sequence after a reset", () => {
    const first = [rnd(), rnd(), rnd()];
    resetSeed();
    expect([rnd(), rnd(), rnd()]).toEqual(first);
  });

  it("keeps rint within bounds inclusive", () => {
    const values = Array.from({ length: 200 }, () => rint(3, 7));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values)).toBeLessThanOrEqual(7);
  });
});

describe("uid", () => {
  it("prefixes and stays unique across calls", () => {
    const a = uid("PET");
    const b = uid("PET");
    expect(a.startsWith("PET_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/insights/route";

const KEY = "FAKE-GEMINI-KEY";

const goodBody = {
  pets: [{ name: "Max", portionG: 150, mealsPerDay: 3 }],
  analytics: {
    accuracyPct: 96.2, successRate: 91.5, meanErr: 4.3,
    daily: [{ label: "Mon", grams: 810, cycles: 6 }],
    perPet: [{ name: "Max", grams: 900, cycles: 6, avg: 150 }],
  },
  unreadAlerts: [],
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/insights", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const geminiReply = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("POST /api/insights", () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("reports not-configured rather than failing when there is no key", async () => {
    const res = await POST(req(goodBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: null, reason: "not-configured" });
  });

  it("rejects a malformed body before any network call", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ nonsense: true }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Gemini's text and keeps the key out of the URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    const fetchMock = vi.fn().mockResolvedValue(geminiReply("All pets fed on plan."));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(req(goodBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: "All pets fed on plan." });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // The key travels in a header. A key in a URL lands in access logs.
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init.body)).toContain("Max");
  });

  it("maps a Gemini rejection to 502 without leaking the response", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota", { status: 429 })));
    const res = await POST(req(goodBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ summary: null, reason: "gemini-rejected", status: 429 });
  });

  it("maps a network failure to 502 unreachable", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const res = await POST(req(goodBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ summary: null, reason: "unreachable" });
  });

  it("refuses to return a summary the model did not finish", async () => {
    // Gemini spends "thinking" tokens from the same budget as the answer
    // (measured ~1600 of them for this prompt), so a tight ceiling truncates
    // mid-sentence. Half a sentence presented as a summary is worse than an
    // honest failure.
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Bella is trending under her tar" }] } }],
    }), { status: 200 })));

    const res = await POST(req(goodBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ summary: null, reason: "truncated" });
  });

  it("returns a complete summary when the model finished normally", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "All pets fed on plan." }] } }],
    }), { status: 200 })));

    expect(await (await POST(req(goodBody))).json()).toEqual({ summary: "All pets fed on plan." });
  });

  it("treats an empty candidates payload as a rejection, not a crash", async () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const res = await POST(req(goodBody));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ summary: null, reason: "empty-response" });
  });
});

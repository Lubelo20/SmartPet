import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/route";

const TOKEN = "123456:FAKE-TOKEN-VALUE";

function req(body: unknown): Request {
  return new Request("http://localhost/api/telegram", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/telegram", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("reports not-configured rather than failing when there is no token", async () => {
    // Mock mode must run with no setup at all.
    const res = await POST(req({ text: "hello" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: false, reason: "not-configured" });
  });

  it("posts to Telegram when configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(req({ text: "Hopper low" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_id).toBe("42");
    expect(body.text).toBe("Hopper low");
  });

  it("never returns the token, even when Telegram rejects the call", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ description: `bot${TOKEN} is unauthorized` }), { status: 401 }),
    ));

    const res = await POST(req({ text: "hi" }));
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(502);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("FAKE-TOKEN-VALUE");
  });

  it("survives Telegram being unreachable", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await POST(req({ text: "hi" }));
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe("unreachable");
  });

  it("rejects an empty or malformed body", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    expect((await POST(req({ text: "   " }))).status).toBe(400);
    expect((await POST(req("not json"))).status).toBe(400);
  });
});

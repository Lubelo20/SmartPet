import { NextResponse } from "next/server";
import { buildInsightsPrompt, sanitiseInsightsInput } from "@/lib/insights";

/**
 * The only place the Gemini key exists — same rule as the Telegram route:
 * no NEXT_PUBLIC_ prefix ever, because that inlines the value into the
 * browser bundle. Read literally at the read site, per the project env rule.
 *
 * The key travels in the x-goog-api-key HEADER, not the URL: a key in a URL
 * lands in access logs on every hop that sees the request line.
 *
 * Absent configuration is not an error. Mock mode must run with no setup at
 * all, exactly as it does for Firebase and Telegram.
 */

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ summary: null, reason: "not-configured" }, { status: 200 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ summary: null, reason: "bad-request" }, { status: 400 });
  }

  // Nothing the sanitiser did not approve reaches the prompt — this is what
  // stops a hostile client ballooning a metered API call.
  const input = sanitiseInsightsInput(raw);
  if (input === null) {
    return NextResponse.json({ summary: null, reason: "bad-request" }, { status: 400 });
  }

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildInsightsPrompt(input) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      // Never forward the body: some error payloads echo request details.
      return NextResponse.json(
        { summary: null, reason: "gemini-rejected", status: res.status },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json({ summary: null, reason: "empty-response" }, { status: 502 });
    }
    return NextResponse.json({ summary: text }, { status: 200 });
  } catch {
    return NextResponse.json({ summary: null, reason: "unreachable" }, { status: 502 });
  }
}

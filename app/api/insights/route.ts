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

/**
 * Model names get retired: gemini-2.5-flash returned 404 "no longer available
 * to new users" the first time a real key was pointed at it. GEMINI_MODEL
 * overrides this without a code change when that happens again.
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * Vercel's default function ceiling is 10s, and a measured summary takes ~20s
 * because the model thinks before it writes. Without this the platform kills
 * the request before Gemini answers, and the card reports a failure that never
 * happened.
 */
export const maxDuration = 60;
const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
    const res = await fetch(geminiUrl(MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildInsightsPrompt(input) }] }],
        // Generous on purpose: Gemini 3.x spends "thinking" tokens from this
        // same budget — measured at ~500 for a four-sentence summary — so 512
        // truncated the answer mid-word. Deliberately not using thinkingConfig
        // to trim that: the field is model-specific and GEMINI_MODEL is
        // overridable, so a narrower budget is the portable fix.
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
      // Measured at 19.4s for a four-sentence summary; 20s cut it off at the
      // wire. Generous enough to be the model's answer, short enough that a
      // hung request still fails inside the platform's own ceiling.
      signal: AbortSignal.timeout(45_000),
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

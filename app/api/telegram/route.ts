import { NextResponse } from "next/server";

/**
 * The only place the bot token exists.
 *
 * These are read WITHOUT a NEXT_PUBLIC_ prefix on purpose: Next inlines
 * NEXT_PUBLIC_ variables into the browser bundle at build time, so prefixing
 * them would hand the bot to anyone who opens devtools. Read literally at the
 * read site, per the project's env rule.
 */
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Absent configuration is not an error. Mock mode must run with no setup at
  // all, exactly as it does for Firebase.
  if (!token || !chatId) {
    return NextResponse.json({ sent: false, reason: "not-configured" }, { status: 200 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ sent: false, reason: "bad-request" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ sent: false, reason: "bad-request" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });

    if (!res.ok) {
      // Telegram echoes the token back in some error bodies, and the URL
      // contains it outright. Never pass either to the client or the log.
      return NextResponse.json(
        { sent: false, reason: "telegram-rejected", status: res.status },
        { status: 502 },
      );
    }
    return NextResponse.json({ sent: true }, { status: 200 });
  } catch {
    return NextResponse.json({ sent: false, reason: "unreachable" }, { status: 502 });
  }
}

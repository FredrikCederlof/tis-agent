import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Translate chat snippets to English for admin reading.
 * Original WhatsApp / Tina language is unchanged — this is display-only.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Translation is not configured (OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const texts = Array.isArray(payload?.texts)
    ? payload.texts.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (!texts.length) {
    return NextResponse.json({ detail: "texts is required" }, { status: 400 });
  }
  if (texts.length > 40) {
    return NextResponse.json({ detail: "At most 40 texts per request" }, { status: 400 });
  }

  const numbered = texts.map((text: string, index: number) => `${index + 1}. ${text}`).join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You translate school-parent WhatsApp messages into clear English for administrators. " +
              "Keep meaning, names, dates, and document titles. Do not add commentary. " +
              "Return ONLY a JSON array of English strings in the same order as the numbered inputs.",
          },
          {
            role: "user",
            content: `Translate each numbered item to English.\n\n${numbered}`,
          },
        ],
      }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        result?.error?.message || `OpenAI translation failed (${response.status})`;
      return NextResponse.json({ detail }, { status: 502 });
    }
    const content = String(result?.choices?.[0]?.message?.content || "").trim();
    const translations = parseJsonArray(content, texts.length);
    if (!translations) {
      return NextResponse.json(
        { detail: "Could not parse translation response" },
        { status: 502 },
      );
    }
    return NextResponse.json({ translations });
  } catch (error) {
    return NextResponse.json(
      {
        detail: `Translation failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }
}

function parseJsonArray(content: string, expected: number): string[] | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== expected) return null;
    return parsed.map((item) => String(item ?? ""));
  } catch {
    return null;
  }
}

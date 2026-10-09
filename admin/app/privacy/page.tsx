import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const NOTICE_VERSION = "2026-10-09";

const PROVIDERS = [
  "Meta (WhatsApp) carries the phone number and the message.",
  "Railway hosts the webhook in Amsterdam and may keep application logs.",
  "OpenAI receives the question and short document excerpts. The phone number is not sent to the model.",
  "Supabase, in Tokyo, stores the conversation and the knowledge base.",
  "Vercel hosts this admin site.",
  "Google Drive is a source of documents the operator chooses to index.",
];

export default async function PrivacyNoticePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("privacy_notice_public")
    .select("retention_days, privacy_contact_email")
    .maybeSingle();

  const days = data?.retention_days ?? 90;
  const contact = (data?.privacy_contact_email || "").trim();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tis-gold">
        Privacy notice · {NOTICE_VERSION}
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-tis-navy">How Tina handles information</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-tis-ink">
        <p>
          Tina is an independent AI-powered information assistant created by a parent to help
          families navigate everyday school life.
        </p>
        <p>Tina is not affiliated with, endorsed by, or operated by Tokyo International School.</p>
        <p>
          AI-generated responses may contain inaccuracies. For official information, please contact
          TIS directly.
        </p>
        <p>Please avoid sharing sensitive personal information about students, families, or staff.</p>

        <h2 className="pt-2 text-lg font-bold text-tis-navy">What is stored</h2>
        <p>
          When you message Tina on WhatsApp, Tina stores your phone number, your message, Tina’s
          reply, the language, the time, and the titles of documents used in the answer.
        </p>
        <h2 className="pt-2 text-lg font-bold text-tis-navy">Why</h2>
        <p>To answer the question, and to review questions Tina could not answer from the documents.</p>
        <h2 className="pt-2 text-lg font-bold text-tis-navy">Who else handles it</h2>
        <ul className="list-disc space-y-1 pl-5">
          {PROVIDERS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="pt-2 text-lg font-bold text-tis-navy">How long</h2>
        <p>
          Conversation records in Tina’s database are deleted {days} days after the message.
          Deleting them here does not remove the chat on your phone, Meta’s copy, or rows still
          inside Supabase’s backup window.
        </p>
        <h2 className="pt-2 text-lg font-bold text-tis-navy">Your request</h2>
        <p>
          {contact
            ? `To ask for a copy, a correction, or earlier deletion, email ${contact}.`
            : "To ask for a copy, a correction, or earlier deletion, contact the parent who operates Tina."}
        </p>
        <p>Tina has no child accounts. Do not send information about other children.</p>
      </div>
      <p className="mt-8">
        <Link href="/login" className="text-sm font-semibold text-tis-navy underline">
          Admin sign in
        </Link>
      </p>
    </main>
  );
}

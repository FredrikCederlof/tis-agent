import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const NOTICE_VERSION = "2026-10-09";

const NAV = [
  { href: "#about", label: "About" },
  { href: "#stored", label: "What is stored" },
  { href: "#not-stored", label: "What we don't store" },
  { href: "#safety", label: "Safety" },
  { href: "#built", label: "How it is built" },
  { href: "#knowledge", label: "Knowledge" },
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
    <div className="min-h-full bg-[#e6e6e6] text-stone-900">
      <header className="sticky top-0 z-10 bg-black">
        <nav
          aria-label="Privacy"
          className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 py-3 text-sm"
        >
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-white underline-offset-4 hover:underline">
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Privacy notice · {NOTICE_VERSION}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-stone-950">How Tina handles information</h1>

        <section id="about" className="mt-8 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">About this project</h2>
          <p>
            Tina is an independent assistant a parent at Tokyo International School set up so other
            parents can find everyday school information more easily. It is a non-commercial
            project: there is no fee, no advertising, and information is not sold.
          </p>
          <p>
            Tina is not affiliated with, endorsed by, or operated by Tokyo International School. The
            school has not commissioned this assistant.
          </p>
          <p>
            Answers are generated and can be wrong. For official information, contact Tokyo
            International School directly.
          </p>
          <p>Please avoid sharing sensitive personal information about students, families, or staff.</p>
        </section>

        <section id="stored" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">What is stored</h2>
          <p>
            When you message Tina on WhatsApp, Tina stores your phone number, your message, Tina’s
            reply, the language, the time, and the titles of documents used in the answer. A short
            copy of the question is also kept so a retried WhatsApp delivery is not answered twice.
          </p>
          <p>
            Staff who are invited into Tina Admin have an email and a name stored so they can sign
            in. Parents do not get accounts.
          </p>
          <h2 className="pt-2 text-lg font-bold text-stone-950">How long</h2>
          <p>
            Conversation records in Tina’s database are deleted {days} days after the message.
            Deleting them here does not remove the chat on your phone, Meta’s copy, or rows still
            inside Supabase’s backup window. School documents and knowledge articles are kept.
          </p>
        </section>

        <section id="not-stored" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">What we don&apos;t store</h2>
          <p>
            Tina does not keep student records. There are no grades, report cards, medical files, or
            a named child’s school account in this project. The knowledge base is general school
            information: handbooks, calendars, notices, and similar documents.
          </p>
          <p>
            Weekly school mail is sanitized before it is stored, and child names are removed. Tina
            has no child accounts. Do not send information about other children.
          </p>
          <p>Your phone number is not sent to the model that writes the reply.</p>
        </section>

        <section id="safety" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">How we limit access</h2>
          <p>
            These are the controls in the system today. They are not a certification, and this page
            is not a legal opinion.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Only invited staff can open Tina Admin. A new account needs an invitation from an active admin.</li>
            <li>Conversation records are not readable by the public. An active admin can read them. The WhatsApp service writes them with its own key.</li>
            <li>WhatsApp checks Meta’s signature before a message is accepted.</li>
            <li>Documents marked restricted are stored, but they are not sent to the model.</li>
            <li>Phone numbers and question text are not written into the application log line.</li>
            <li>An admin can export or delete the stored rows for one phone number.</li>
            <li>Conversation rows older than the retention period are deleted on a schedule. Documents stay.</li>
          </ul>
        </section>

        <section id="built" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">How it is built</h2>
          <p>Parents use WhatsApp. The rest of the chain is a small set of tools, each with one job.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Meta (WhatsApp) carries the phone number and the message.</li>
            <li>Railway, in Amsterdam, runs the webhook that receives the message and sends the reply. It may keep application logs.</li>
            <li>OpenAI writes the reply from the question and short document excerpts. The phone number is not part of that request.</li>
            <li>Supabase, in Tokyo, stores the conversation and the searchable knowledge base.</li>
            <li>Vercel hosts this admin site.</li>
            <li>Google Drive is where documents are placed before they are indexed.</li>
          </ul>
          <p>
            Each company handles its own slice under that company’s terms. Tina does not carry a
            compliance badge from any of them.
          </p>
        </section>

        <section id="knowledge" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Knowledge</h2>
          <p>
            Knowledge is general school information. It is not a file about a student. The same
            material is kept in three places:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Google Drive holds the source documents the operator chooses to index.</li>
            <li>Supabase holds the copy used to search and answer, including the file and the text used for retrieval.</li>
            <li>Tina Admin holds knowledge articles staff write, or save from a question Tina could not answer. Those articles are added to the same search store.</li>
          </ul>
          <p>
            A document can be marked restricted. It remains in storage and is left out of answers.
          </p>
        </section>

        <section id="request" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Your request</h2>
          <p>
            {contact
              ? `To ask for a copy, a correction, or earlier deletion, email ${contact}.`
              : "To ask for a copy, a correction, or earlier deletion, contact the parent who operates Tina."}
          </p>
        </section>

        <p className="mt-10">
          <Link href="/login" className="text-sm font-semibold text-stone-950 underline">
            Admin sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

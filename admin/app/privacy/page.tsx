import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const NOTICE_VERSION = "2026-10-09";

const CONTACT_NAME = "Fredrik Sterner Cederlöf";
const CONTACT_EMAIL = "fredrik@insightworks.se";

const NAV = [
  { href: "#notice", label: "Privacy Notice & Consent" },
  { href: "#retention", label: "Data Retention Policy" },
  { href: "#access", label: "Access Control & Audit Logs" },
  { href: "#requests", label: "Data Requests & Deletion" },
  { href: "#about", label: "About" },
  { href: "#knowledge", label: "Knowledge" },
];

export default async function PrivacyNoticePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("privacy_notice_public")
    .select("retention_days")
    .maybeSingle();

  const days = data?.retention_days ?? 90;

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

        <section id="notice" className="mt-8 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Privacy Notice &amp; Consent</h2>
          <p>This page is the privacy notice for Tina. Questions go to {CONTACT_NAME} at {CONTACT_EMAIL}.</p>
          <p>
            Using Tina is optional. You start by sending a WhatsApp message. The first reply to a new
            number includes a link to this notice. There is no separate checkbox. If you do not want
            Tina to keep the conversation, stop messaging, or ask for deletion using the contact
            below.
          </p>
          <p>
            When you message Tina, Tina stores your phone number, your message, Tina’s reply, the
            language, the time, and the titles of documents used in the answer. A short copy of the
            question is also kept so a retried WhatsApp delivery is not answered twice.
          </p>
          <p>
            Please do not send information about other children. Tina has no child accounts. This
            page describes how the system works. It is not a legal opinion and not a certification.
          </p>
        </section>

        <section id="retention" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Data Retention Policy</h2>
          <p>
            Conversation records are kept for {days} days. An administrator can set that period to
            30, 90, 180, or 365 days. The default is 90 days.
          </p>
          <p>
            When the period ends, a scheduled job deletes the conversation rows and the
            duplicate-delivery copies. School documents, knowledge articles, and the file store stay.
          </p>
          <p>
            Deleting them here does not remove the chat on your phone, Meta’s copy, or rows still
            inside Supabase’s backup window.
          </p>
        </section>

        <section id="access" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Access Control &amp; Audit Logs</h2>
          <p>
            Tina Admin is invitation-only. An active administrator sends the invitation. A person
            without one cannot open the admin site.
          </p>
          <p>
            Conversation records are not public. Active administrators can read them. The WhatsApp
            service writes them with its own key. WhatsApp checks Meta’s signature before a message
            is accepted. Documents marked restricted are stored and are not sent to the model.
          </p>
          <p>
            Staff invitations, revoked invitations, and removed access are written to an
            administrator audit log. Scheduled deletion of old conversations, and deletion of one
            phone number, are written to a privacy log with the time, who ran it, and how many rows
            were removed. That privacy log keeps the last four digits of a phone number, not the
            full number. Opening a conversation in the inbox is not written as its own event.
          </p>
        </section>

        <section id="requests" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Data Requests &amp; Deletion</h2>
          <p>
            To ask for a copy, a correction, or deletion, contact {CONTACT_NAME} at{" "}
            <a className="font-semibold text-stone-950 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            An administrator can export the stored WhatsApp rows for one number, or delete those
            rows from Tina’s database. That deletion does not remove the chat on your phone or
            Meta’s copy.
          </p>
        </section>

        <section id="about" className="mt-10 scroll-mt-16 space-y-4 text-sm leading-relaxed">
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

        <p className="mt-10">
          <Link href="/login" className="text-sm font-semibold text-stone-950 underline">
            Admin sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { PublicArticle } from "@/components/public-article";
import { createClient } from "@/lib/supabase/server";

const NOTICE_VERSION = "2026-10-09";

const CONTACT_NAME = "Fredrik Sterner Cederlöf";
const CONTACT_EMAIL = "fredrik@insightworks.se";

export default async function PrivacyNoticePage() {
  const supabase = await createClient();
  const [{ data }, pageResult] = await Promise.all([
    supabase.from("privacy_notice_public").select("retention_days, privacy_contact_email").maybeSingle(),
    supabase.from("content_pages").select("title, body_html").eq("slug", "privacy").maybeSingle(),
  ]);

  const days = data?.retention_days ?? 90;
  const email = data?.privacy_contact_email || CONTACT_EMAIL;
  if (!pageResult.error && pageResult.data?.body_html) {
    return (
      <PublicArticle
        title={pageResult.data.title}
        html={pageResult.data.body_html}
        days={days}
        email={email}
      />
    );
  }

  return (
    <div className="min-h-full bg-[#e6e6e6] text-stone-900">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
          Privacy notice · {NOTICE_VERSION}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-stone-950">How Tina handles information</h1>

        <section id="about" className="mt-8 space-y-4 text-sm leading-relaxed">
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
          <p>
            This page describes how Tina works. It is not a legal opinion, and it is not a statement
            that Tina meets a particular law.
          </p>
        </section>

        <section id="notice" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Privacy notice</h2>
          <p>
            Questions about this notice go to {CONTACT_NAME} at{" "}
            <a className="font-semibold text-stone-950 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            Using Tina is optional. You start by sending a WhatsApp message. The first reply to a
            new number includes a link to this notice. That first message is received and answered
            before the link is shown. If you do not want Tina to keep the conversation, stop
            messaging, or ask for deletion using the contact below.
          </p>
          <p>
            When you message Tina, Tina stores your phone number, your message, Tina’s reply, the
            language, the time, and the titles of documents used in the answer. A short copy of the
            question is also kept so a retried WhatsApp delivery is not answered twice.
          </p>
        </section>

        <section id="use" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">How we use your information</h2>
          <p>Tina uses personal information to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Receive a WhatsApp question and reply to it.</li>
            <li>Keep recent messages in the same chat so a follow-up can be understood.</li>
            <li>Ignore a duplicate delivery of the same message.</li>
            <li>Let an invited administrator review a question Tina could not answer.</li>
            <li>Let an administrator save a reviewed, general article into the knowledge base.</li>
            <li>Notify staff of a question. In that notification the phone number is masked.</li>
            <li>Respond to a request for a copy, a correction, or deletion, and look into a technical problem.</li>
          </ul>
          <p>
            Information is not sold and is not used for advertising. Improving Tina means a person
            writes a general article. The raw chat is not kept for that purpose beyond the retention
            period below.
          </p>
        </section>

        <section id="children" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Children</h2>
          <p>
            Tina does not keep student profiles, grades, medical records, or a named child’s school
            account. The material used to answer is general school information.
          </p>
          <p>
            A message you send can still name a child or include other personal details. That
            message is stored as you sent it, and recent messages in the same chat can be sent with
            the next question so Tina can follow the conversation. Please do not share information
            about children or other people unless you need to.
          </p>
          <p>
            Weekly school mail is cleaned before it is added to the knowledge base, and child names
            are removed from that mail.
          </p>
        </section>

        <section id="retention" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Data retention</h2>
          <p>
            Conversation records are kept for {days} days, then deleted from Tina’s active database.
            School documents and knowledge articles stay.
          </p>
          <p>
            The chat on your phone, copies held by WhatsApp or other providers, and temporary
            backups can remain for a different period.
          </p>
        </section>

        <section id="access" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Who can see conversations</h2>
          <p>
            Tina Admin is only for people an administrator has invited. Conversation records are not
            public. Invited staff can read them in order to handle questions Tina could not answer.
          </p>
          <p>
            Some documents are marked so they stay in storage and are left out of answers. Changes
            to who can sign in, and deletions of conversation records, are recorded.
          </p>
        </section>

        <section id="requests" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Your request</h2>
          <p>
            You can ask for a copy, a correction, or deletion of the information stored for your
            WhatsApp number. Contact {CONTACT_NAME} at{" "}
            <a className="font-semibold text-stone-950 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p>
            We may need to confirm that you control that phone number before completing the request.
            We will respond without undue delay.
          </p>
          <p>
            Deleting the rows in Tina’s database does not delete the chat on your phone, copies held
            by other providers, or temporary backups.
          </p>
        </section>

        <section id="built" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Where information is handled</h2>
          <p>Some of this happens outside Japan.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Meta (WhatsApp) carries the phone number and the message.</li>
            <li>A service in Singapore receives the message and sends the reply. It may keep application logs.</li>
            <li>
              OpenAI writes the reply from the question, recent messages in the same chat, and short
              excerpts from school documents. The phone number is not included.
            </li>
            <li>Supabase, in Tokyo, stores the conversation and the searchable knowledge base.</li>
            <li>Vercel hosts this website.</li>
            <li>Google Drive holds the source documents that are chosen for indexing.</li>
            <li>Slack can show staff the text of a question. The phone number in that notice is masked.</li>
          </ul>
          <p>
            Each company handles its own part under that company’s terms. This page does not
            describe a completed legal arrangement for transfers outside Japan.
          </p>
        </section>

        <section id="knowledge" className="mt-10 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-stone-950">Knowledge</h2>
          <p>
            Answers come from general school information, not from a file about a student. That
            material is kept in three places:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Google Drive holds the source documents.</li>
            <li>Supabase holds the copy used to search and answer.</li>
            <li>
              Tina Admin holds knowledge articles a person writes and saves. An article can start
              from a question Tina could not answer. The person reviews it and is expected to keep
              it general before it is saved.
            </li>
          </ul>
          <p>
            A saved article stays after the conversation itself is deleted. A document can be marked
            so it remains in storage and is left out of answers.
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

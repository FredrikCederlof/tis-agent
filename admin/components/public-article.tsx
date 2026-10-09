import Link from "next/link";
import { applyContentTokens, sanitizeHtml } from "@/lib/content-pages";

export function PublicArticle({
  title,
  html,
  days,
  email,
}: {
  title: string;
  html: string;
  days: number;
  email: string;
}) {
  const safe = applyContentTokens(sanitizeHtml(html), days, email);
  return (
    <div className="min-h-full bg-[#e6e6e6] text-stone-900">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold text-stone-950">{title}</h1>
        <article
          className="mt-8 space-y-4 text-sm leading-relaxed [&_a]:font-semibold [&_a]:underline [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-950 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: safe }}
        />
        <p className="mt-10">
          <Link href="/login" className="text-sm font-semibold text-stone-950 underline">
            Admin sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

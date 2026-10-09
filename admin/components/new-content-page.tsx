"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateSlug } from "@/lib/content-pages";

export function NewContentPage({ actorEmail }: { actorEmail: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const nextSlug = slug.trim();
    const slugError = validateSlug(nextSlug);
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    if (slugError) {
      setError(slugError);
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("content_pages")
      .insert({
        title: title.trim(),
        slug: nextSlug,
        body_html: "<p></p>",
        published: false,
        sort_order: 10,
        updated_by: actorEmail,
      })
      .select("id")
      .single();
    setBusy(false);
    if (insertError || !data) {
      setError(insertError?.message || "Could not create the page.");
      return;
    }
    router.push(`/content/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void create(event)} className="card space-y-4">
      <h2 className="text-lg font-bold text-tis-navy">New page</h2>
      <div>
        <label className="label" htmlFor="new-title">
          Title
        </label>
        <input id="new-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="new-slug">
          Address
        </label>
        <input
          id="new-slug"
          value={slug}
          placeholder="school-week"
          onChange={(event) => setSlug(event.target.value)}
        />
        <p className="hint">Published at /pages/your-address. New pages start unpublished.</p>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>
        Create
      </button>
    </form>
  );
}

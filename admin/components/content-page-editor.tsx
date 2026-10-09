"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/rich-text-editor";
import { publicPageHref, sanitizeHtml, validateSlug, type ContentPage } from "@/lib/content-pages";

export function ContentPageEditor({
  page,
  actorEmail,
}: {
  page: ContentPage;
  actorEmail: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [published, setPublished] = useState(page.published);
  const [sortOrder, setSortOrder] = useState(String(page.sort_order));
  const [body, setBody] = useState(page.body_html);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lockedSlug = page.slug === "privacy";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const nextSlug = slug.trim();
    const slugError = lockedSlug ? null : validateSlug(nextSlug);
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    if (slugError) {
      setError(slugError);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("content_pages")
      .update({
        title: title.trim(),
        slug: lockedSlug ? "privacy" : nextSlug,
        published,
        sort_order: Number(sortOrder) || 0,
        body_html: sanitizeHtml(body),
        updated_at: new Date().toISOString(),
        updated_by: actorEmail,
      })
      .eq("id", page.id);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Saved. The public page uses this text.");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete “${title}”?`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("content_pages").delete().eq("id", page.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/content");
    router.refresh();
  }

  const href = publicPageHref(lockedSlug ? "privacy" : slug.trim() || page.slug);

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="page-title">
            Title
          </label>
          <input id="page-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="page-slug">
            Address
          </label>
          <input
            id="page-slug"
            value={slug}
            disabled={lockedSlug}
            onChange={(event) => setSlug(event.target.value)}
          />
          <p className="hint">
            Public page: {href}
            {lockedSlug ? ". This address stays /privacy." : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-tis-navy">
            <input
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />
            Published
          </label>
          <div>
            <label className="label" htmlFor="page-order">
              Order
            </label>
            <input
              id="page-order"
              type="number"
              className="!w-24"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-tis-muted">
          Write the article here. {"{retention_days}"} becomes the current retention period.{" "}
          {"{privacy_contact_email}"} becomes the contact address from Privacy settings.
          {lockedSlug
            ? " Unpublishing this page shows the built-in notice instead."
            : ""}
        </p>
        <RichTextEditor value={body} onChange={setBody} />
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-tis-success">{message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="primary" disabled={busy}>
          Save
        </button>
        <a className="secondary" href={href} target="_blank" rel="noreferrer">
          View
        </a>
        {!lockedSlug && (
          <button type="button" className="secondary" disabled={busy} onClick={() => void remove()}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

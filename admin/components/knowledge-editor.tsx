"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Copy,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import {
  ANSWER_MAX,
  AUDIENCE_ROLES,
  CONTENT_OWNERS,
  GRADE_OPTIONS,
  OTHER,
  PRIMARY_QUESTION_MAX,
  PROGRAMME_OPTIONS,
  SIMILAR_QUESTION_MAX,
  addChip,
  categorySelectOptions,
  createSuccessPath,
  effectiveKnowledgeStatus,
  formatEditorPerson,
  formatEditorTimestamp,
  formatIngestedAt,
  isReviewOverdue,
  knowledgeEditorBackLabel,
  normalizeChipList,
  parseAudienceGroups,
  removeChip,
  serializeAudienceGroups,
  toggleAudienceRole,
  toggleGrade,
  toggleProgramme,
  truncateArticleId,
  type AudienceGroups,
} from "@/lib/knowledge-hub";
import type { KnowledgeEntry, KnowledgeStatus } from "@/lib/types";

type RelatedHit = {
  title?: string;
  similarity?: number;
  content?: string;
};

const RELATED_WARN_AT = 0.68;
const CUSTOM_CATEGORY = "__custom__";

function statusDotClass(status: KnowledgeStatus): string {
  switch (status) {
    case "draft":
      return "bg-slate-400";
    case "expired":
      return "bg-amber-500";
    case "archived":
      return "bg-rose-400";
    default:
      return "bg-emerald-500";
  }
}

function Pill({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        selected
          ? "bg-tis-navy text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ChipInput({
  values,
  onChange,
  placeholder,
  max,
  addLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
  addLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw = draft) {
    const next = addChip(values, raw, max);
    onChange(next);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-2.5 py-2">
        {values.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-tis-navy"
          >
            {item}
            <button
              type="button"
              className="rounded-full p-0.5 text-tis-muted hover:bg-slate-200 hover:text-tis-navy"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(removeChip(values, index))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length < max && (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Backspace" && !draft && values.length) {
                onChange(removeChip(values, values.length - 1));
              }
            }}
            onBlur={() => {
              if (draft.trim()) commit();
            }}
            placeholder={values.length === 0 ? placeholder : ""}
            className="!min-w-[8rem] flex-1 !border-0 !bg-transparent !px-1 !py-0.5 !shadow-none !ring-0 focus:!ring-0"
          />
        )}
      </div>
      {values.length < max && (
        <button
          type="button"
          className="secondary !px-3 !py-1.5 text-xs"
          onClick={() => {
            if (draft.trim()) commit();
            else inputRef.current?.focus();
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {addLabel}
        </button>
      )}
    </div>
  );
}

function EditorCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-base font-semibold text-tis-navy">{title}</h2>
        <p className="mt-0.5 text-sm text-tis-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function KnowledgeEditor({
  entry,
  initialQuestion = "",
  initialAnswer = "",
  origin,
  originInteractionId,
  userEmail,
  apiUrl,
  syncSecret,
  backHref = "/knowledge",
  categories = [],
  nameByEmail = {},
}: {
  entry?: KnowledgeEntry;
  initialQuestion?: string;
  initialAnswer?: string;
  origin: "manual" | "inbox";
  originInteractionId?: string | null;
  userEmail: string;
  apiUrl: string;
  syncSecret: string;
  backHref?: string;
  categories?: string[];
  nameByEmail?: Record<string, string>;
}) {
  const router = useRouter();
  const [primaryQuestion, setPrimaryQuestion] = useState(
    entry?.primary_question || initialQuestion,
  );
  const [similarQuestions, setSimilarQuestions] = useState<string[]>(
    normalizeChipList(entry?.similar_questions, SIMILAR_QUESTION_MAX),
  );
  const [answer, setAnswer] = useState(entry?.answer || initialAnswer);
  const [tagList, setTagList] = useState<string[]>(normalizeChipList(entry?.tags, 20));
  const initialCategory = entry?.category?.trim() || OTHER;
  const [category, setCategory] = useState(initialCategory);
  const [customCategory, setCustomCategory] = useState("");
  const [categoryMode, setCategoryMode] = useState<"list" | "custom">("list");
  const [sourceNote, setSourceNote] = useState(entry?.source_note || "");
  const [audienceGroups, setAudienceGroups] = useState<AudienceGroups>(() =>
    parseAudienceGroups(entry?.audience),
  );
  const [contentOwner, setContentOwner] = useState(entry?.content_owner || "");
  const [sourceUrl, setSourceUrl] = useState(entry?.source_url || "");
  const [status, setStatus] = useState<KnowledgeStatus>(
    entry ? effectiveKnowledgeStatus(entry) : "active",
  );
  const [validUntil, setValidUntil] = useState(entry?.valid_until?.slice(0, 10) || "");
  const [reviewDueDate, setReviewDueDate] = useState(
    entry?.review_due_date?.slice(0, 10) || "",
  );
  const [exclusionNotes, setExclusionNotes] = useState(entry?.exclusion_notes || "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedHit[] | null>(null);
  const [checkingRelated, setCheckingRelated] = useState(false);
  const [showInboxBanner, setShowInboxBanner] = useState(origin === "inbox");
  const [copied, setCopied] = useState(false);

  const isNew = !entry;
  const displayStatus = entry ? effectiveKnowledgeStatus(entry) : status;
  const archived = displayStatus === "archived";
  const reviewOverdue = entry ? isReviewOverdue(entry) : false;
  const configured = Boolean(apiUrl && syncSecret);
  const relatedHits = useMemo(
    () => (related || []).filter((hit) => (hit.similarity ?? 0) >= RELATED_WARN_AT),
    [related],
  );
  const categoryOptions = useMemo(
    () => categorySelectOptions(categories, entry?.category),
    [categories, entry?.category],
  );
  const resolvedCategory =
    categoryMode === "custom" ? customCategory.trim() : category.trim();
  const updatedByName = formatEditorPerson(entry?.updated_by, nameByEmail);
  const title = isNew
    ? origin === "inbox"
      ? "Add inbox question to Knowledge Hub"
      : "New Knowledge Hub entry"
    : "Edit Knowledge Hub entry";
  const subtitle = isNew
    ? "Create the article that Tina uses to answer parent questions."
    : "Update the article that Tina uses to answer parent questions.";

  async function checkRelated() {
    if (!isNew || !configured || !primaryQuestion.trim()) {
      setRelated([]);
      return true;
    }
    setCheckingRelated(true);
    try {
      const url = new URL(`${apiUrl.replace(/\/$/, "")}/admin/knowledge/related`);
      url.searchParams.set("q", primaryQuestion.trim());
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${syncSecret}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Related check failed (${response.status})`);
      }
      setRelated(body.results || []);
    } catch (err) {
      setRelated([]);
      console.warn(err);
    } finally {
      setCheckingRelated(false);
    }
    return true;
  }

  async function save(nextStatus: KnowledgeStatus) {
    if (!configured) {
      setError(
        "Knowledge Hub save is not configured. Set NEXT_PUBLIC_TINA_API_URL and ADMIN_SYNC_SECRET.",
      );
      return;
    }
    if (nextStatus !== "draft") {
      if (!resolvedCategory) {
        setError("Category is required.");
        return;
      }
      if (!contentOwner.trim()) {
        setError("Content owner is required.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await checkRelated();
      const payload = {
        primary_question: primaryQuestion.trim(),
        similar_questions: similarQuestions,
        answer: answer.trim(),
        category: resolvedCategory || OTHER,
        tags: tagList,
        source_note: sourceNote.trim(),
        audience: serializeAudienceGroups(audienceGroups),
        content_owner: contentOwner.trim() || null,
        source_url: sourceUrl.trim() || null,
        status: archived ? "active" : nextStatus,
        valid_until: validUntil || null,
        review_due_date: reviewDueDate || null,
        exclusion_notes: exclusionNotes.trim() || null,
        origin,
        origin_interaction_id: originInteractionId || undefined,
        updated_by: userEmail,
      };
      const path = entry
        ? `${apiUrl.replace(/\/$/, "")}/admin/knowledge/${entry.id}`
        : `${apiUrl.replace(/\/$/, "")}/admin/knowledge`;
      const response = await fetch(path, {
        method: entry ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${syncSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Save failed (${response.status})`);
      }
      const next = createSuccessPath(isNew);
      if (next) {
        router.push(next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!entry || !configured) return;
    if (
      !window.confirm(
        "Archive this entry? Tina will stop using it; the Hub row stays for history.",
      )
    ) {
      return;
    }
    setArchiving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/admin/knowledge/${entry.id}/archive`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${syncSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ updated_by: userEmail }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || `Archive failed (${response.status})`);
      }
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function copyId() {
    if (!entry?.id) return;
    try {
      await navigator.clipboard.writeText(entry.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy article ID.");
    }
  }

  const busy = saving || archiving;

  return (
    <form
      className="flex min-h-0 flex-col pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(archived ? "active" : status);
      }}
    >
      <div className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-tis-muted hover:text-tis-navy"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {knowledgeEditorBackLabel(backHref)}
        </Link>
        <h1 className="page-title mt-2">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      {showInboxBanner && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          <p className="min-w-0 flex-1">
            Started from an unanswered inbox question. Saving marks that row as reviewed and
            links it to this entry.
          </p>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1 text-amber-800 hover:bg-amber-100"
            aria-label="Dismiss inbox notice"
            onClick={() => setShowInboxBanner(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {archived && (
        <p className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-tis-muted">
          This entry is archived. Saving again with Active status re-ingests it into Tina’s
          knowledge store.
        </p>
      )}
      {reviewOverdue && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Review is overdue. Tina still uses this article until you change status or validity.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <EditorCard
            title="Article content"
            description="Define the question, answer and related questions that Tina should match on."
          >
            <label className="block">
              <span className="label">
                Primary question <span className="text-tis-danger">*</span>
              </span>
              <input
                type="text"
                required
                maxLength={PRIMARY_QUESTION_MAX}
                value={primaryQuestion}
                onChange={(e) => setPrimaryQuestion(e.target.value)}
                onBlur={() => {
                  if (isNew) void checkRelated();
                }}
                placeholder="When does Grade 6 finish on Friday?"
              />
              <p className="mt-1 text-right text-xs text-tis-muted">
                {primaryQuestion.length}/{PRIMARY_QUESTION_MAX}
              </p>
            </label>

            <div>
              <span className="label">Similar questions</span>
              <p className="hint !mt-0 mb-2">
                Optional phrases parents might use. They stay on this one document — not
                separate answers.
              </p>
              <ChipInput
                values={similarQuestions}
                onChange={setSimilarQuestions}
                placeholder="Add a similar question…"
                max={SIMILAR_QUESTION_MAX}
                addLabel="Add similar question"
              />
              <p className="mt-1 text-right text-xs text-tis-muted">
                {similarQuestions.length}/{SIMILAR_QUESTION_MAX}
              </p>
            </div>

            <label className="block">
              <span className="label">
                Verified answer <span className="text-tis-danger">*</span>
              </span>
              <textarea
                required
                rows={8}
                maxLength={ANSWER_MAX}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Grade 6 finishes at 2:30pm on Fridays."
              />
              <p className="mt-1 text-right text-xs text-tis-muted">
                {answer.length}/{ANSWER_MAX}
              </p>
            </label>
          </EditorCard>

          <EditorCard
            title="Classification"
            description="Organize the article so it’s easy to find and filter."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">
                  Category <span className="text-tis-danger">*</span>
                </span>
                <select
                  value={categoryMode === "custom" ? CUSTOM_CATEGORY : category}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_CATEGORY) {
                      setCategoryMode("custom");
                      return;
                    }
                    setCategoryMode("list");
                    setCategory(e.target.value);
                  }}
                  required={categoryMode !== "custom"}
                >
                  {categoryOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value={CUSTOM_CATEGORY}>Custom category…</option>
                </select>
                {categoryMode === "custom" && (
                  <input
                    className="mt-2"
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Category name"
                    required
                  />
                )}
              </label>
              <div>
                <span className="label">Tags</span>
                <ChipInput
                  values={tagList}
                  onChange={setTagList}
                  placeholder="Add a tag…"
                  max={20}
                  addLabel="Add a tag"
                />
              </div>
            </div>
          </EditorCard>

          <EditorCard
            title="Applies to"
            description="Define who this information is relevant for."
          >
            <div>
              <p className="label">
                Audience <span className="text-tis-danger">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_ROLES.map((option) => (
                  <Pill
                    key={option}
                    selected={audienceGroups.roles.includes(option)}
                    onClick={() =>
                      setAudienceGroups((current) => toggleAudienceRole(current, option))
                    }
                  >
                    {option === "All" ? "All (default)" : option}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Programme</p>
              <div className="flex flex-wrap gap-2">
                <Pill
                  selected={audienceGroups.programmes.length === 0}
                  onClick={() =>
                    setAudienceGroups((current) => toggleProgramme(current, "All"))
                  }
                >
                  All
                </Pill>
                {PROGRAMME_OPTIONS.map((option) => (
                  <Pill
                    key={option}
                    selected={audienceGroups.programmes.includes(option)}
                    onClick={() =>
                      setAudienceGroups((current) => toggleProgramme(current, option))
                    }
                  >
                    {option}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Grade level</p>
              <div className="flex flex-wrap gap-2">
                <Pill
                  selected={audienceGroups.grades.length === 0}
                  onClick={() =>
                    setAudienceGroups((current) => toggleGrade(current, "All grades"))
                  }
                >
                  All grades
                </Pill>
                {GRADE_OPTIONS.map((option) => (
                  <Pill
                    key={option}
                    selected={audienceGroups.grades.includes(option)}
                    onClick={() =>
                      setAudienceGroups((current) => toggleGrade(current, option))
                    }
                  >
                    {option}
                  </Pill>
                ))}
              </div>
            </div>
          </EditorCard>

          <EditorCard
            title="Source & ownership"
            description="Add a reference to the original information and who is responsible for maintaining it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">
                  Content owner <span className="text-tis-danger">*</span>
                </span>
                <select
                  value={contentOwner}
                  onChange={(e) => setContentOwner(e.target.value)}
                >
                  <option value="">Select owner</option>
                  {CONTENT_OWNERS.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Source URL</span>
                <div className="relative">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://…"
                    className="pr-10"
                  />
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-tis-muted hover:text-tis-navy"
                      aria-label="Open source URL"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <p className="hint">
                  Link to the original document, website or policy (e.g. Google Drive, Toddle).
                </p>
              </label>
            </div>
            <label className="block">
              <span className="label">Source note</span>
              <input
                type="text"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="Confirmed with TIS office, Aug 2026"
              />
              <p className="hint">Internal note about the source (not shown to Tina).</p>
            </label>
          </EditorCard>

          <EditorCard
            title="AI guidance"
            description="Help Tina understand when to use this article and what to avoid."
          >
            <label className="block">
              <span className="label">Do not use this article when / Common misconceptions</span>
              <textarea
                rows={4}
                value={exclusionNotes}
                onChange={(e) => setExclusionNotes(e.target.value)}
                placeholder='Do not interpret "wear green" as requiring the green TIS uniform.'
              />
              <p className="hint">
                Describe situations where this article should not be used or common
                misunderstandings to avoid.
              </p>
            </label>
          </EditorCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <EditorCard
            title="Status & lifecycle"
            description="Control when this article is available to Tina."
          >
            <label className="block">
              <span className="label">
                Status <span className="text-tis-danger">*</span>
              </span>
              <div className="relative">
                <span
                  className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full ${statusDotClass(
                    archived ? "archived" : status,
                  )}`}
                  aria-hidden
                />
                <select
                  className="!pl-8"
                  value={archived ? "archived" : status}
                  disabled={archived}
                  onChange={(e) => setStatus(e.target.value as KnowledgeStatus)}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  {archived && <option value="archived">Archived</option>}
                </select>
              </div>
              <p className="hint">Only active articles are used by Tina.</p>
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="block">
                <span className="label">Valid until</span>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
                <p className="hint">After this date Tina stops using the article.</p>
              </label>
              <label className="block">
                <span className="label">Review due</span>
                <input
                  type="date"
                  value={reviewDueDate}
                  onChange={(e) => setReviewDueDate(e.target.value)}
                />
                <p className="hint">Flags overdue review without removing from Tina.</p>
              </label>
            </div>
          </EditorCard>

          {!isNew && (
            <section className="card space-y-4">
              <div>
                <h2 className="text-base font-semibold text-tis-navy">System information</h2>
                <p className="mt-0.5 text-sm text-tis-muted">
                  Managed automatically by the system.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tis-muted">
                  Last ingested
                </p>
                <p className="mt-1 text-sm font-medium text-tis-navy">
                  {entry?.last_ingested_at
                    ? formatEditorTimestamp(entry.last_ingested_at)
                    : formatIngestedAt(entry?.last_ingested_at)}
                </p>
                <p className="mt-0.5 text-xs text-tis-muted">
                  {entry?.last_ingested_at
                    ? "This article is included in Tina’s knowledge."
                    : "This article is not in Tina’s retrieval yet."}
                </p>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-tis-muted">
                    Article ID
                  </p>
                  <p className="mt-1 font-mono text-sm text-tis-navy">
                    {truncateArticleId(entry?.id || "")}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-tis-muted hover:bg-tis-mist hover:text-tis-navy"
                  aria-label="Copy article ID"
                  onClick={() => void copyId()}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {copied && <p className="text-xs text-tis-success">Copied</p>}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tis-muted">
                  Created
                </p>
                <p className="mt-1 text-sm text-tis-navy">
                  {formatEditorTimestamp(entry?.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tis-muted">
                  Last updated
                </p>
                <p className="mt-1 text-sm text-tis-navy">
                  {formatEditorTimestamp(entry?.updated_at)}
                </p>
                {updatedByName && (
                  <p className="mt-0.5 text-xs text-tis-muted">by {updatedByName}</p>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>

      {checkingRelated && (
        <p className="mt-4 text-sm text-tis-muted">Checking for related Hub entries…</p>
      )}
      {relatedHits.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Possible duplicate</p>
          <p className="mt-1">
            A similar Knowledge Hub entry already exists. Edit that one instead of creating
            another document with the same answer.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {relatedHits.map((hit, index) => (
              <li key={`${hit.title || "related"}-${index}`}>
                {(hit.title || "Existing entry") +
                  (hit.similarity != null
                    ? ` (${Math.round(hit.similarity * 100)}% similar)`
                    : "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-tis-danger">{error}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-4">
        <button type="submit" className="primary" disabled={busy}>
          {saving
            ? "Saving…"
            : isNew
              ? "Add to Knowledge Hub"
              : "Save and re-ingest"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void save("draft")}
        >
          Save draft
        </button>
        <Link href={backHref} className="secondary !border-transparent !bg-transparent !shadow-none">
          Cancel
        </Link>
        {entry && !archived && (
          <button
            type="button"
            className="secondary ml-auto text-tis-muted"
            disabled={busy}
            onClick={() => void onArchive()}
          >
            <Archive className="h-4 w-4" aria-hidden />
            {archiving ? "Archiving…" : "Archive article"}
          </button>
        )}
      </div>
    </form>
  );
}

/** Stored public pages edited in Tina Admin. */

const ALLOWED_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "br",
  "blockquote",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  "login",
  "api",
  "content",
  "settings",
  "auth",
  "pages",
  "account",
  "onboard",
  "inbox",
  "chats",
  "knowledge",
  "sync",
  "sandbox",
  "users",
  "config",
]);

export type ContentPage = {
  id: string;
  slug: string;
  title: string;
  body_html: string;
  published: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string;
};

export function publicPageHref(slug: string): string {
  return slug === "privacy" ? "/privacy" : `/pages/${slug}`;
}

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug) || slug.length > 60) {
    return "Use lowercase letters, numbers, and hyphens.";
  }
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved.";
  return null;
}

export function applyContentTokens(html: string, days: number, email: string): string {
  const safeEmail = email.replace(/[<>"']/g, "");
  return html
    .replaceAll("{retention_days}", String(days))
    .replaceAll("{privacy_contact_email}", safeEmail);
}

/** Keep the tags the editor produces. Drop scripts and unexpected markup. */
export function sanitizeHtml(input: string): string {
  const withoutBlocks = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  return withoutBlocks.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const name = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (match.startsWith("</")) return name === "br" ? "" : `</${name}>`;
    if (name === "br") return "<br>";
    if (name === "a") {
      const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const href = (hrefMatch?.[1] || hrefMatch?.[2] || "").trim();
      const safe =
        /^https?:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("/");
      if (!safe || /javascript:/i.test(href)) return "<a>";
      return `<a href="${href.replace(/"/g, "")}">`;
    }
    return `<${name}>`;
  });
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicArticle } from "@/components/public-article";

export default async function PublicContentPage({ params }: { params: { slug: string } }) {
  if (params.slug === "privacy") redirect("/privacy");
  const supabase = await createClient();
  const [{ data: notice }, { data: page }] = await Promise.all([
    supabase
      .from("privacy_notice_public")
      .select("retention_days, privacy_contact_email")
      .maybeSingle(),
    supabase
      .from("content_pages")
      .select("title, body_html")
      .eq("slug", params.slug)
      .maybeSingle(),
  ]);
  if (!page?.body_html) notFound();
  return (
    <PublicArticle
      title={page.title}
      html={page.body_html}
      days={notice?.retention_days ?? 90}
      email={notice?.privacy_contact_email || "fredrik@insightworks.se"}
    />
  );
}

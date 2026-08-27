import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { InboxList } from "@/components/inbox-list";
import type { UnansweredRow } from "@/lib/types";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("unanswered_interactions")
    .select("*")
    .limit(100);

  return (
    <div>
      <Nav email={user.email || ""} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-2 text-2xl font-semibold text-tis-navy">Unanswered questions</h2>
        <p className="mb-6 text-sm text-slate-600">
          Questions Tina could not answer confidently from official TIS sources. Mark reviewed
          when the school has added knowledge or decided no action is needed.
        </p>
        {error ? (
          <p className="text-red-600">{error.message}</p>
        ) : (
          <InboxList rows={(data || []) as UnansweredRow[]} userEmail={user.email || ""} />
        )}
      </main>
    </div>
  );
}

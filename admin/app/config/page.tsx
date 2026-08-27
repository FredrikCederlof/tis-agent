import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { ConfigForm } from "@/components/config-form";
import type { AgentConfigRow } from "@/lib/types";

export default async function ConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("agent_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return (
      <div>
        <Nav email={user.email || ""} />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <p className="text-red-600">Could not load config: {error?.message}</p>
        </main>
      </div>
    );
  }

  return (
    <div>
      <Nav email={user.email || ""} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-2 text-2xl font-semibold text-tis-navy">Tina config</h2>
        <p className="mb-6 text-sm text-slate-600">
          Edit how Tina behaves on WhatsApp. Changes apply within about a minute in production.
        </p>
        <ConfigForm config={data as AgentConfigRow} userEmail={user.email || ""} />
      </main>
    </div>
  );
}

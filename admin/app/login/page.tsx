"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-fuji" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-soft backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#05513d] to-[#1a191b] p-8 text-white md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              TIS Agent
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight">
              Meet Tina
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
              Your school-information assistant for Tokyo International School parents —
              grounded in official sources.
            </p>
          </div>
          <div className="mt-10 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full bg-white/20 blur-md" />
              <Image
                src="/tina.png"
                alt="Tina"
                width={220}
                height={220}
                className="relative rounded-full object-cover ring-4 ring-white/40"
                priority
              />
            </div>
          </div>
          <p className="mt-8 text-xs text-white/70">Admin access for staff only</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <Image
              src="/tina.png"
              alt="Tina"
              width={48}
              height={48}
              className="rounded-full object-cover ring-2 ring-tis-navy/30"
            />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tis-navy">
                TIS Agent
              </p>
              <p className="text-lg font-bold text-tis-navy">Tina Admin</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-tis-navy">Sign in</h2>
          <p className="mt-2 text-sm text-tis-muted">
            Use your staff email. We’ll send a magic link — no password needed.
          </p>

          {searchParams.get("error") === "not_allowed" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              This email is not authorized for admin access.
            </p>
          )}
          {searchParams.get("error") === "misconfigured" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              Admin is missing Supabase environment variables on this deployment.
            </p>
          )}

          {sent ? (
            <p className="mt-6 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-medium text-tis-success">
              Check your email for a sign-in link.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>
              {error && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
              )}
              <button type="submit" className="primary w-full" disabled={loading}>
                {loading ? "Sending link…" : "Send magic link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

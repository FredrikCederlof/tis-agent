"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onMagicLink(e: React.FormEvent) {
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

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-fuji" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-soft backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b0d15] to-[#182508] p-8 text-white md:flex md:flex-col md:justify-between">
          <div>
            <div className="inline-flex rounded-2xl bg-white px-3 py-2">
              <Image
                src="/nabo-logo.png"
                alt="Nabo"
                width={140}
                height={70}
                className="h-8 w-auto object-contain"
                priority
              />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              Customer
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight">
              Tokyo International School
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
              School information assistant for TIS parents — grounded in official sources.
            </p>
          </div>
          <div className="mt-10 flex justify-center">
            <div className="relative rounded-3xl bg-white/10 p-6 ring-1 ring-white/20">
              <Image
                src="/nabo-mark.png"
                alt=""
                width={160}
                height={160}
                className="h-36 w-36 object-contain"
                priority
              />
            </div>
          </div>
          <p className="mt-8 text-xs text-white/70">Admin access for staff only</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-6 md:hidden">
            <Image
              src="/nabo-logo.png"
              alt="Nabo"
              width={140}
              height={70}
              className="h-9 w-auto object-contain object-left"
            />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-tis-muted">
              Tokyo International School
            </p>
          </div>

          <h2 className="text-2xl font-bold text-tis-navy">Sign in</h2>
          <p className="mt-2 text-sm text-tis-muted">
            Use your staff email with a magic link or the password you set during onboarding.
          </p>

          {searchParams.get("error") === "not_allowed" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              This email is not authorized for admin access.
            </p>
          )}
          {searchParams.get("error") === "deactivated" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              This account has been deactivated. Contact an administrator.
            </p>
          )}
          {searchParams.get("error") === "misconfigured" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              Admin is missing Supabase environment variables on this deployment.
            </p>
          )}

          <div className="mt-5 flex gap-2 rounded-xl bg-tis-mist/70 p-1">
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "magic" ? "bg-white text-tis-navy shadow-sm" : "text-tis-muted"
              }`}
              onClick={() => {
                setMode("magic");
                setError(null);
                setSent(false);
              }}
            >
              Magic link
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === "password" ? "bg-white text-tis-navy shadow-sm" : "text-tis-muted"
              }`}
              onClick={() => {
                setMode("password");
                setError(null);
                setSent(false);
              }}
            >
              Password
            </button>
          </div>

          {mode === "magic" && sent ? (
            <p className="mt-6 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-medium text-tis-success">
              Check your email for a sign-in link.
            </p>
          ) : mode === "magic" ? (
            <form onSubmit={(e) => void onMagicLink(e)} className="mt-6 space-y-4">
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
          ) : (
            <form onSubmit={(e) => void onPassword(e)} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email-password">
                  Email
                </label>
                <input
                  id="email-password"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
              )}
              <button type="submit" className="primary w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
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

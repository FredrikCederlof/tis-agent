"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { roleLabel, type AdminRole } from "@/lib/account";

type InviteState =
  | { kind: "loading" }
  | {
      kind: "pending";
      email: string;
      first_name: string;
      last_name: string;
      role: AdminRole;
      expires_at: string;
    }
  | { kind: "problem"; status: string; detail: string }
  | { kind: "done"; email: string };

function OnboardForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const [state, setState] = useState<InviteState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({
        kind: "problem",
        status: "invalid",
        detail: "This invitation link is missing a token.",
      });
      return;
    }
    let cancelled = false;
    void fetch(`/api/onboard?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (data.status === "pending") {
          setState({
            kind: "pending",
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
            role: data.role,
            expires_at: data.expires_at,
          });
          return;
        }
        setState({
          kind: "problem",
          status: data.status || "invalid",
          detail: data.detail || "This invitation link is not valid.",
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            kind: "problem",
            status: "invalid",
            detail: "Could not validate this invitation.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          confirm_password: confirm,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.detail || "Could not create account.");
        return;
      }
      setState({ kind: "done", email: result.email || "" });
    } catch {
      setError("Could not create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-fuji" />
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-soft backdrop-blur sm:p-8">
        <div className="mb-5 flex items-center gap-3">
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
            <p className="text-lg font-bold text-tis-navy">Create your account</p>
          </div>
        </div>

        {state.kind === "loading" && (
          <p className="text-sm text-tis-muted">Checking invitation…</p>
        )}

        {state.kind === "problem" && (
          <div className="space-y-4">
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{state.detail}</p>
            <p className="text-sm text-tis-muted">
              Ask a Tina Admin administrator to resend your invitation, then use the new link.
            </p>
            <Link href="/login" className="primary inline-flex">
              Back to sign in
            </Link>
          </div>
        )}

        {state.kind === "done" && (
          <div className="space-y-4">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
              Account created for {state.email}. Sign in with your email and password.
            </p>
            <Link href="/login" className="primary inline-flex">
              Sign in
            </Link>
          </div>
        )}

        {state.kind === "pending" && (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <p className="text-sm text-tis-muted">
              You&apos;re joining as <strong>{roleLabel(state.role)}</strong>. Choose a password
              to finish setup.
            </p>
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                readOnly
                disabled
                value={`${state.first_name} ${state.last_name}`.trim()}
                className="cursor-not-allowed bg-tis-mist/60"
              />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                readOnly
                disabled
                value={state.email}
                className="cursor-not-allowed bg-tis-mist/60"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="hint">At least 8 characters with a letter and a number.</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
            )}
            <button type="submit" className="primary w-full" disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardForm />
    </Suspense>
  );
}

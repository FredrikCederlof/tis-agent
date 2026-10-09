"use client";

import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./nabu-login.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

function queryMessage(code: string | null): string | null {
  switch (code) {
    case "not_allowed":
      return "This email is not authorized for admin access.";
    case "deactivated":
      return "This account has been deactivated. Contact an administrator.";
    case "misconfigured":
      return "Admin is missing Supabase environment variables on this deployment.";
    case "auth":
      return "The sign-in link could not be verified. Request a new one.";
    default:
      return null;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(next: "magic" | "password") {
    setMode(next);
    setError(null);
    setSent(false);
    setPassword("");
    setShowPassword(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (mode === "magic") {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      setLoading(false);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setSent(true);
      return;
    }

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

  const banner = error || (sent ? null : queryMessage(searchParams.get("error")));
  const submitLabel = loading
    ? mode === "magic"
      ? "Sending link…"
      : "Signing in…"
    : mode === "magic"
      ? "Send magic link"
      : "Sign in";

  return (
    <div className={`nabu-login ${inter.className}`}>
      <a className="skip" href="#email">
        Skip to sign in
      </a>
      <div className="landscape" aria-hidden="true" />
      <header className="page-header">
        <a className="wordmark" href="/login">
          <span className="wordmark-crop">
            <Image
              src="/nabo-logo.png"
              alt="Nabo"
              width={1774}
              height={887}
              className="wordmark-logo"
              priority
              unoptimized
            />
          </span>
        </a>
        <span className="header-note">Your school. A little more connected.</span>
        <span className="staff-label">Staff workspace</span>
      </header>
      <main className="layout">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="panel-top">
            <span className="product-label">Tina Admin</span>
            <span className="staff-pill">Staff access</span>
          </div>
          <div className="intro">
            <h1 id="login-title">Welcome back.</h1>
            <p>
              A clearer day starts here.
              <br />
              Sign in to your school workspace.
            </p>
          </div>
          <div className="mode-switch" role="group" aria-label="Sign-in method">
            <button
              type="button"
              className={`mode${mode === "magic" ? " active" : ""}`}
              aria-pressed={mode === "magic"}
              onClick={() => selectMode("magic")}
            >
              Magic link
            </button>
            <button
              type="button"
              className={`mode${mode === "password" ? " active" : ""}`}
              aria-pressed={mode === "password"}
              onClick={() => selectMode("password")}
            >
              Password
            </button>
          </div>
          <form id="login-form" onSubmit={(e) => void onSubmit(e)}>
            <label htmlFor="email">Staff email</label>
            <div className="input-shell">
              <span className="field-symbol" aria-hidden="true">
                @
              </span>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="Enter your email address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div id="password-field" hidden={mode !== "password"}>
              <div className="label-row">
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    selectMode("magic");
                    emailRef.current?.focus();
                  }}
                >
                  Use a magic link instead
                </button>
              </div>
              <div className="input-shell">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={mode !== "password"}
                  required={mode === "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="show-button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <p className="form-hint" id="form-hint">
              {mode === "magic"
                ? "We’ll send a sign-in link to your staff email."
                : "Use the password you set during onboarding."}
            </p>
            <button type="submit" className="submit" disabled={loading || sent}>
              <span>{submitLabel}</span>
              <span className="arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            {sent && (
              <p className="feedback" role="status" aria-live="polite">
                Check your email for a sign-in link.
              </p>
            )}
            {banner && (
              <p className="feedback error" role="alert">
                {banner}
              </p>
            )}
          </form>
        </section>
        <aside className="school-panel" aria-label="Your school workspace">
          <div className="school-top">
            <span className="school-caption">Your workspace</span>
            <span className="school-monogram" aria-hidden="true">
              TIS
            </span>
          </div>
          <div className="school-heading">
            <h2>
              <span>Tokyo</span> <span>International</span>{" "}
              <span>
                School<span className="lime-period">.</span>
              </span>
            </h2>
            <p>School information assistant for TIS parents, grounded in official sources.</p>
          </div>
        </aside>
        <div className="bottom-note">
          <span>
            Less searching.
            <br />
            More time for your school.
          </span>
          <span className="note-arrow" aria-hidden="true">
            ↗
          </span>
        </div>
        <p className="privacy-cue">
          <Link href="/privacy">Privacy notice</Link>
        </p>
      </main>
      <footer className="page-footer">
        <span>Nabo · School information, thoughtfully connected.</span>
        <span>Staff sign-in</span>
      </footer>
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

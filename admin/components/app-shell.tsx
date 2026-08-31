"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Inbox,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Unanswered", icon: Inbox },
  { href: "/knowledge", label: "Knowledge Hub", icon: BookOpen },
  { href: "/sync", label: "Knowledge sync", icon: RefreshCw },
  { href: "/config", label: "Tina config", icon: Settings2 },
];

export function AppShell({
  email,
  unansweredCount = 0,
  children,
}: {
  email: string;
  unansweredCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Image
            src="/tina.png"
            alt="Tina"
            width={36}
            height={36}
            className="rounded-full object-cover ring-2 ring-tis-sky/30"
          />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-tis-gold">
              TIS Agent
            </p>
            <p className="text-sm font-bold text-tis-navy">Tina Admin</p>
          </div>
        </div>
        <button
          type="button"
          className="secondary !px-3 !py-2"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-tis-ink/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200/80 bg-white/95 p-4 shadow-soft backdrop-blur transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden items-center gap-3 px-2 pb-6 pt-2 lg:flex">
          <Image
            src="/tina.png"
            alt="Tina"
            width={44}
            height={44}
            className="rounded-full object-cover ring-2 ring-tis-sky/30"
            priority
          />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tis-gold">
              TIS Agent
            </p>
            <p className="text-lg font-bold leading-tight text-tis-navy">Tina Admin</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 pt-2 lg:pt-0">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-tis-mist text-tis-navy shadow-sm"
                    : "text-tis-muted hover:bg-slate-50 hover:text-tis-navy"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 ${active ? "text-tis-sky" : "text-slate-400 group-hover:text-tis-sky"}`}
                  />
                  {link.label}
                </span>
                {link.href === "/inbox" && unansweredCount > 0 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-tis-navy">
                    {unansweredCount}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="my-3 border-t border-slate-100" />
          <div className="rounded-xl px-3 py-2 text-xs text-tis-muted">
            <p className="flex items-center gap-2 font-semibold text-slate-500">
              <BarChart3 className="h-3.5 w-3.5" />
              Parent WhatsApp insights
            </p>
            <p className="mt-1 leading-relaxed">
              Grounded answers from official TIS documents only.
            </p>
          </div>
        </nav>

        <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 rounded-2xl bg-tis-mist/70 px-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tis-navy text-sm font-bold text-white">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-tis-navy">{email}</p>
              <p className="text-xs text-tis-muted">Admin</p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="secondary w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="relative min-w-0">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-fuji" />
        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

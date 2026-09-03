"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeft,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV_COLLAPSED_KEY = "tis-admin-nav-collapsed";

const sections = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/chats", label: "Chats", icon: MessageCircle, badge: "chats" as const },
      { href: "/inbox", label: "Needs attention", icon: Inbox, badge: "inbox" as const },
    ],
  },
  {
    label: "Knowledge",
    links: [
      { href: "/knowledge", label: "Knowledge Hub", icon: BookOpen },
      { href: "/sync", label: "Knowledge sync", icon: RefreshCw },
    ],
  },
  {
    label: "Settings",
    links: [{ href: "/config", label: "Tina config", icon: Settings2 }],
  },
];

export function AppShell({
  email,
  unansweredCount = 0,
  chatsUnreadCount,
  children,
}: {
  email: string;
  unansweredCount?: number;
  chatsUnreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fetchedUnread, setFetchedUnread] = useState(0);
  const unreadChats = chatsUnreadCount ?? fetchedUnread;

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (chatsUnreadCount != null) return;
    const supabase = createClient();
    supabase
      .from("admin_session_list")
      .select("id", { count: "exact", head: true })
      .eq("unread", true)
      .then(({ count }) => setFetchedUnread(count ?? 0));
  }, [chatsUnreadCount, pathname]);

  // The mobile drawer is always full width, so labels stay visible there.
  const iconsOnly = collapsed && !open;

  function badgeFor(kind?: "chats" | "inbox"): number {
    if (kind === "chats") return unreadChats;
    if (kind === "inbox") return unansweredCount;
    return 0;
  }

  return (
    <div className="admin-shell">
      {/* Mobile top bar */}
      <div className="z-30 flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <Image
            src="/tina.png"
            alt="Tina"
            width={36}
            height={36}
            className="rounded-full object-cover ring-2 ring-tis-navy/20"
          />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-tis-navy">
              TIS Agent
            </p>
            <p className="text-sm font-bold text-tis-ink">Tina Admin</p>
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

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-tis-ink/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-black/[0.06] bg-white p-3 shadow-soft transition-transform lg:static lg:h-full lg:shrink-0 lg:shadow-none ${
          collapsed ? "lg:w-[76px]" : "lg:w-[248px]"
        } ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className={`hidden items-center gap-2 px-1 pb-4 pt-1 lg:flex ${
            iconsOnly ? "justify-center" : "justify-between"
          }`}
        >
          {!iconsOnly && (
            <div className="flex min-w-0 items-center gap-2.5">
              <Image
                src="/tina.png"
                alt="Tina"
                width={36}
                height={36}
                className="shrink-0 rounded-full object-cover ring-2 ring-tis-navy/20"
                priority
              />
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-tis-navy">
                  TIS Agent
                </p>
                <p className="truncate text-[15px] font-bold leading-tight text-tis-ink">
                  Tina Admin
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-tis-muted transition hover:bg-tis-mist hover:text-tis-navy"
            aria-label={iconsOnly ? "Expand navigation" : "Collapse navigation"}
            aria-pressed={collapsed}
            title={iconsOnly ? "Expand navigation" : "Collapse navigation"}
            onClick={toggleCollapsed}
          >
            {iconsOnly ? <Menu className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pt-2 lg:pt-0">
          {sections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              {iconsOnly ? (
                <div className="mx-auto mb-1 h-px w-6 bg-slate-200" aria-hidden />
              ) : (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-tis-muted">
                  {section.label}
                </p>
              )}
              {section.links.map((link) => {
                const active =
                  link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                const Icon = link.icon;
                const count = badgeFor(link.badge);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    title={iconsOnly ? link.label : undefined}
                    aria-label={iconsOnly ? link.label : undefined}
                    className={`group relative flex items-center rounded-xl text-sm font-semibold transition ${
                      iconsOnly ? "justify-center px-0 py-2.5" : "justify-between px-3 py-2.5"
                    } ${
                      active
                        ? "bg-tis-acid text-tis-ink shadow-sm"
                        : "text-tis-muted hover:bg-tis-mist hover:text-tis-navy"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="relative">
                        <Icon
                          className={`h-[18px] w-[18px] ${
                            active ? "text-tis-navy" : "text-tis-muted group-hover:text-tis-navy"
                          }`}
                        />
                        {iconsOnly && count > 0 && (
                          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-tis-acid px-1 text-[9px] font-bold text-tis-ink">
                            {count}
                          </span>
                        )}
                      </span>
                      {!iconsOnly && link.label}
                    </span>
                    {!iconsOnly && count > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          link.badge === "inbox"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-tis-acid text-tis-ink"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {!iconsOnly && (
            <div className="mt-auto rounded-xl bg-tis-mist/60 px-3 py-3 text-xs text-tis-muted">
              <p className="flex items-center gap-2 font-bold text-tis-navy">
                <BarChart3 className="h-3.5 w-3.5" />
                Parent WhatsApp insights
              </p>
              <p className="mt-1 leading-relaxed">
                Grounded answers from official TIS documents only.
              </p>
            </div>
          )}
        </nav>

        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div
            className={`flex items-center gap-2.5 rounded-xl bg-tis-mist/70 py-2.5 ${
              iconsOnly ? "justify-center px-0" : "px-2.5"
            }`}
            title={iconsOnly ? email : undefined}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tis-navy text-sm font-bold text-white">
              {(email || "?").slice(0, 1).toUpperCase()}
            </span>
            {!iconsOnly && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-tis-navy">{email}</p>
                <p className="text-[11px] text-tis-muted">Admin</p>
              </div>
            )}
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className={`secondary w-full ${iconsOnly ? "!px-0" : ""}`}
              title={iconsOnly ? "Sign out" : undefined}
              aria-label={iconsOnly ? "Sign out" : undefined}
            >
              <LogOut className="h-4 w-4" />
              {!iconsOnly && "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <main className="admin-main bg-tis-cream">
        <div className="admin-canvas">{children}</div>
      </main>
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
    <div className="mb-6 flex shrink-0 flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

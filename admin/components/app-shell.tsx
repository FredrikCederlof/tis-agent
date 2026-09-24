"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeft,
  RefreshCw,
  Settings,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  avatarInitial,
  avatarPublicUrl,
  displayFirstName,
  isAdminRole,
  roleLabel,
  type AdminProfile,
} from "@/lib/account";

const NAV_COLLAPSED_KEY = "tis-admin-nav-collapsed";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: "chats" | "inbox";
  adminOnly?: boolean;
};

const sections: { label: string; links: NavLink[] }[] = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/chats", label: "Chats", icon: MessageCircle, badge: "chats" },
      { href: "/inbox", label: "Needs attention", icon: Inbox, badge: "inbox" },
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
    links: [
      { href: "/users", label: "Users", icon: Users, adminOnly: true },
      { href: "/config", label: "Tina config", icon: Settings2, adminOnly: true },
    ],
  },
];

export function AppShell({
  email,
  unansweredCount = 0,
  chatsUnreadCount,
  profile: profileProp,
  children,
}: {
  email: string;
  unansweredCount?: number;
  chatsUnreadCount?: number;
  profile?: AdminProfile | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fetchedUnread, setFetchedUnread] = useState(0);
  const [liveUnanswered, setLiveUnanswered] = useState<number | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(profileProp || null);
  const unreadChats = chatsUnreadCount ?? fetchedUnread;
  const inboxCount = liveUnanswered ?? unansweredCount;
  const fillCanvas = pathname.startsWith("/chats");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const firstName = displayFirstName(profile || { first_name: "", email });
  const roleText = roleLabel(profile?.role);
  const avatarUrl = avatarPublicUrl(supabaseUrl, profile?.avatar_path);
  const showAdminLinks = isAdminRole(profile?.role);
  const visibleSections = sections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => !link.adminOnly || showAdminLinks),
    }))
    .filter((section) => section.links.length > 0);

  useEffect(() => {
    setProfile(profileProp || null);
  }, [profileProp]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (profileProp) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("admin_profiles")
        .select("user_id, email, first_name, last_name, avatar_path, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setProfile(data as AdminProfile);
    });
  }, [profileProp, pathname]);

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

  useEffect(() => {
    const supabase = createClient();
    function poll() {
      void supabase
        .from("unanswered_interactions")
        .select("id", { count: "exact", head: true })
        .then(({ count, error }) => {
          if (!error) setLiveUnanswered(count ?? 0);
        });
    }
    poll();
    const timer = window.setInterval(poll, 45_000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  // The mobile drawer is always full width, so labels stay visible there.
  const iconsOnly = collapsed && !open;

  function badgeFor(kind?: "chats" | "inbox"): number {
    if (kind === "chats") return unreadChats;
    if (kind === "inbox") return inboxCount;
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
            className="rounded-full object-cover ring-2 ring-tis-ink"
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-tis-navy/40 bg-tis-navy p-3 text-white shadow-soft transition-transform lg:static lg:h-full lg:shrink-0 lg:shadow-none ${
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
                className="shrink-0 rounded-full object-cover ring-2 ring-tis-ink"
                priority
              />
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-tis-acid">
                  TIS Agent
                </p>
                <p className="truncate text-[15px] font-bold leading-tight text-white">
                  Tina Admin
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={iconsOnly ? "Expand navigation" : "Collapse navigation"}
            aria-pressed={collapsed}
            title={iconsOnly ? "Expand navigation" : "Collapse navigation"}
            onClick={toggleCollapsed}
          >
            {iconsOnly ? <Menu className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pt-2 lg:pt-0">
          {visibleSections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              {iconsOnly ? (
                <div className="mx-auto mb-1 h-px w-6 bg-white/20" aria-hidden />
              ) : (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
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
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="relative">
                        <Icon
                          className={`h-[18px] w-[18px] ${
                            active ? "text-tis-ink" : "text-white/70 group-hover:text-white"
                          }`}
                        />
                        {iconsOnly && count > 0 && (
                          <span
                            className={`absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                              link.badge === "chats"
                                ? "bg-tis-unread text-white"
                                : "bg-tis-amber text-tis-ink"
                            }`}
                          >
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
                            ? "bg-tis-amber text-tis-ink"
                            : "bg-tis-unread text-white"
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
        </nav>

        <div className="mt-3 space-y-2 border-t border-white/15 pt-3">
          {iconsOnly ? (
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className={`rounded-xl p-2.5 text-white/75 transition hover:bg-white/10 hover:text-white ${
                  pathname.startsWith("/account") ? "bg-white/15 text-white" : ""
                }`}
                title="Account settings"
                aria-label="Account settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <form action="/auth/signout" method="post" className="w-full">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-transparent py-2.5 text-white transition hover:bg-white/10"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-2 py-2">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-white object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white bg-tis-acid text-sm font-bold text-tis-ink">
                    {avatarInitial(profile || { first_name: firstName, email })}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{firstName}</p>
                  <p className="text-[11px] text-white/60">{roleText}</p>
                </div>
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className={`rounded-lg p-2 text-white/75 transition hover:bg-white/10 hover:text-white ${
                    pathname.startsWith("/account") ? "bg-white/15 text-white" : ""
                  }`}
                  title="Account settings"
                  aria-label="Account settings"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      </aside>

      <main className="admin-main">
        <div className={`admin-canvas${fillCanvas ? " admin-canvas-fill" : ""}`}>{children}</div>
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
  const pathname = usePathname();
  const compact = pathname.startsWith("/chats");
  return (
    <div
      className={`flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${
        compact ? "mb-3" : "mb-6 sm:mb-8"
      }`}
    >
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

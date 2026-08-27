import Link from "next/link";

const links = [
  { href: "/", label: "Analytics" },
  { href: "/config", label: "Tina config" },
  { href: "/inbox", label: "Unanswered" },
];

export function Nav({ email }: { email: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-tis-gold">
            TIS Agent
          </p>
          <h1 className="text-lg font-semibold text-tis-navy">Tina Admin</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium text-slate-600 hover:text-tis-navy"
            >
              {link.label}
            </Link>
          ))}
          <span className="text-slate-400">{email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

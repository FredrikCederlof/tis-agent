"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { roleLabel, type AdminRole } from "@/lib/account";
import {
  buildUserList,
  roleDescription,
  userListStatusLabel,
  type AdminInvitationRow,
  type AdminProfileManaged,
  type UserListItem,
} from "@/lib/users";

export function UsersManagement({
  initialProfiles,
  initialInvitations,
  currentUserId,
}: {
  initialProfiles: AdminProfileManaged[];
  initialInvitations: AdminInvitationRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [showInvite, setShowInvite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () => buildUserList({ profiles, invitations }),
    [invitations, profiles],
  );

  async function refreshFromServer() {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setProfiles(data.profiles || []);
    setInvitations(data.invitations || []);
    router.refresh();
  }

  async function changeRole(item: UserListItem, role: AdminRole) {
    if (item.kind !== "profile") return;
    if (item.role === role) return;
    const confirmed = window.confirm(
      `Change ${item.first_name}'s role to ${roleLabel(role)}?\n\n${roleDescription(role)}`,
    );
    if (!confirmed) return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: item.id, role }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.detail || "Could not update role.");
        return;
      }
      setMessage(result.message || "Role updated.");
      await refreshFromServer();
    } catch {
      setError("Could not update role.");
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(item: UserListItem, action: "deactivate" | "reactivate") {
    if (item.kind !== "profile") return;
    if (action === "deactivate") {
      const confirmed = window.confirm(
        `Deactivate ${item.first_name} ${item.last_name}? They will lose access immediately. Historical records are kept.`,
      );
      if (!confirmed) return;
    }
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/users/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.detail || "Could not update user.");
        return;
      }
      setMessage(result.message || "Updated.");
      await refreshFromServer();
    } catch {
      setError("Could not update user.");
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvite(item: UserListItem) {
    if (item.kind !== "invitation") return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/users/invitations/${item.id}/resend`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.detail || "Could not resend invitation.");
        return;
      }
      setMessage(result.message || "Invitation resent.");
      await refreshFromServer();
    } catch {
      setError("Could not resend invitation.");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvite(item: UserListItem) {
    if (item.kind !== "invitation") return;
    if (!window.confirm(`Revoke the invitation for ${item.email}?`)) return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/users/invitations/${item.id}/revoke`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.detail || "Could not revoke invitation.");
        return;
      }
      setMessage(result.message || "Invitation revoked.");
      await refreshFromServer();
    } catch {
      setError("Could not revoke invitation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tis-muted">
          Invite colleagues, assign roles, and deactivate access. Members cannot open this page.
        </p>
        <button
          type="button"
          className="primary inline-flex items-center gap-2"
          onClick={() => setShowInvite(true)}
        >
          <UserPlus className="h-4 w-4" />
          Add user
        </button>
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">{message}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{error}</p>
      )}

      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tis-muted">
            No users yet. Add someone to send a secure invitation.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-black/[0.06] bg-tis-mist/40 text-[11px] uppercase tracking-wide text-tis-muted">
                <tr>
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Email</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {rows.map((row) => {
                  const isSelf = row.kind === "profile" && row.id === currentUserId;
                  const busy = busyId === row.id;
                  return (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td className="px-4 py-3 font-semibold text-tis-ink">
                        {row.first_name} {row.last_name}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-medium text-tis-muted">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-tis-muted">{row.email}</td>
                      <td className="px-4 py-3">
                        {row.kind === "profile" && !isSelf && row.status === "active" ? (
                          <select
                            className="max-w-[140px]"
                            value={row.role}
                            disabled={busy}
                            title={roleDescription(row.role)}
                            onChange={(e) =>
                              void changeRole(row, e.target.value as AdminRole)
                            }
                            aria-label={`Role for ${row.email}`}
                          >
                            <option value="admin">Admin — {roleDescription("admin")}</option>
                            <option value="member">Member — {roleDescription("member")}</option>
                          </select>
                        ) : (
                          <span>{roleLabel(row.role)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.kind === "invitation" && (
                            <>
                              <button
                                type="button"
                                className="secondary !px-2.5 !py-1.5 text-xs"
                                disabled={busy}
                                onClick={() => void resendInvite(row)}
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                className="secondary !px-2.5 !py-1.5 text-xs"
                                disabled={busy}
                                onClick={() => void revokeInvite(row)}
                              >
                                Revoke
                              </button>
                            </>
                          )}
                          {row.kind === "profile" && !isSelf && row.status === "active" && (
                            <button
                              type="button"
                              className="secondary !px-2.5 !py-1.5 text-xs"
                              disabled={busy}
                              onClick={() => void setStatus(row, "deactivate")}
                            >
                              Deactivate
                            </button>
                          )}
                          {row.kind === "profile" && row.status === "deactivated" && (
                            <button
                              type="button"
                              className="secondary !px-2.5 !py-1.5 text-xs"
                              disabled={busy}
                              onClick={() => void setStatus(row, "reactivate")}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showInvite && (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onSent={async (msg) => {
            setShowInvite(false);
            setMessage(msg);
            setError(null);
            await refreshFromServer();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: UserListItem["status"] }) {
  const label = userListStatusLabel(status);
  const tone =
    status === "active"
      ? "bg-emerald-50 text-tis-success"
      : status === "deactivated"
        ? "bg-slate-100 text-slate-600"
        : status === "invitation_expired"
          ? "bg-amber-50 text-amber-800"
          : "bg-sky-50 text-sky-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {label}
    </span>
  );
}

function InviteDialog({
  onClose,
  onSent,
  onError,
}: {
  onClose: () => void;
  onSent: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("member");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          role,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result.detail || "Could not send invitation.";
        setLocalError(detail);
        onError(detail);
        return;
      }
      await onSent(result.message || "Invitation sent.");
    } catch {
      setLocalError("Could not send invitation.");
      onError("Could not send invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tis-ink/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close invite dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft"
      >
        <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5">
          <div>
            <h2 id="invite-title" className="text-lg font-bold text-tis-navy">
              Add user
            </h2>
            <p className="mt-1 text-sm text-tis-muted">
              Send a secure invitation. They create their own password — you never see it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="invite-first">
                First name
              </label>
              <input
                id="invite-first"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="invite-last">
                Last name
              </label>
              <input
                id="invite-last"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
            >
              <option value="member">Member — {roleDescription("member")}</option>
              <option value="admin">Admin — {roleDescription("admin")}</option>
            </select>
          </div>
          {localError && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{localError}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

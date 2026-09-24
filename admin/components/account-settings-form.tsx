"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  avatarInitial,
  avatarPublicUrl,
  displayFirstName,
  roleLabel,
  validateAvatarFile,
  type AdminProfile,
  type AdminRole,
} from "@/lib/account";

type TeamMember = Pick<
  AdminProfile,
  "user_id" | "email" | "first_name" | "last_name" | "role"
>;

export function AccountSettingsForm({
  profile,
  teamMembers,
  supabaseUrl,
}: {
  profile: AdminProfile;
  teamMembers: TeamMember[];
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(profile.first_name || "");
  const [lastName, setLastName] = useState(profile.last_name || "");
  const [email, setEmail] = useState(profile.email || "");
  const [avatarPath, setAvatarPath] = useState(profile.avatar_path);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const [roleErr, setRoleErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [members, setMembers] = useState(teamMembers);

  const avatarSrc = useMemo(() => {
    if (previewUrl) return previewUrl;
    return avatarPublicUrl(supabaseUrl, avatarPath);
  }, [avatarPath, previewUrl, supabaseUrl]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileErr(result.detail || "Could not save profile.");
        return;
      }
      setProfileMsg(result.message || "Profile saved.");
      router.refresh();
    } catch {
      setProfileErr("Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onAvatarSelected(file: File | null) {
    setAvatarMsg(null);
    setAvatarErr(null);
    if (!file) return;
    const validated = validateAvatarFile(file);
    if (!validated.ok) {
      setAvatarErr(validated.error);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setSavingAvatar(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAvatarErr(result.detail || "Could not upload image.");
        return;
      }
      setAvatarPath(result.avatar_path || avatarPath);
      setAvatarMsg(result.message || "Profile image saved.");
      router.refresh();
    } catch {
      setAvatarErr("Could not upload image.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg(null);
    setPasswordErr(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
          require_current: Boolean(currentPassword),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPasswordErr(result.detail || "Could not update password.");
        return;
      }
      setPasswordMsg(result.message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordErr("Could not update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function changeMemberRole(userId: string, role: AdminRole) {
    setSavingRoleId(userId);
    setRoleMsg(null);
    setRoleErr(null);
    try {
      const response = await fetch("/api/account/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRoleErr(result.detail || "Could not update role.");
        return;
      }
      setMembers((rows) =>
        rows.map((row) => (row.user_id === userId ? { ...row, role } : row)),
      );
      setRoleMsg(result.message || "Role updated.");
    } catch {
      setRoleErr("Could not update role.");
    } finally {
      setSavingRoleId(null);
    }
  }

  const isAdmin = profile.role === "admin";
  const others = members.filter((row) => row.user_id !== profile.user_id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="card space-y-5">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Profile</h2>
          <p className="mt-1 text-sm text-tis-muted">
            Update how you appear in Tina Admin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="h-[72px] w-[72px] rounded-full border border-white object-cover ring-1 ring-black/10"
            />
          ) : (
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-white bg-tis-acid text-xl font-bold text-tis-ink ring-1 ring-black/10">
              {avatarInitial({ first_name: firstName, email })}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="avatar">
              Profile image
            </label>
            <input
              id="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={savingAvatar}
              onChange={(e) => void onAvatarSelected(e.target.files?.[0] || null)}
            />
            <p className="hint">JPEG, PNG, WebP, or GIF · max 10 MB</p>
            {savingAvatar && <p className="hint">Uploading…</p>}
            {avatarMsg && (
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
                {avatarMsg}
              </p>
            )}
            {avatarErr && (
              <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
                {avatarErr}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="first_name">
                First name
              </label>
              <input
                id="first_name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="last_name">
                Last name
              </label>
              <input
                id="last_name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
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
            />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Role
            </label>
            <input
              id="role"
              type="text"
              value={roleLabel(profile.role)}
              readOnly
              disabled
              className="cursor-not-allowed bg-tis-mist/60"
            />
            <p className="hint">Only an administrator can change roles for other people.</p>
          </div>
          {profileMsg && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
              {profileMsg}
            </p>
          )}
          {profileErr && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              {profileErr}
            </p>
          )}
          <button type="submit" className="primary" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold text-tis-navy">Password</h2>
          <p className="mt-1 text-sm text-tis-muted">
            Change your password separately from profile details. Use at least 8 characters
            with a letter and a number.
          </p>
        </div>
        <form onSubmit={(e) => void savePassword(e)} className="space-y-4">
          <div>
            <label className="label" htmlFor="current_password">
              Current password
            </label>
            <input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <p className="hint">
              If you only use magic-link sign-in and have never set a password, leave this
              blank to create one.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="new_password">
              New password
            </label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm_password">
              Confirm new password
            </label>
            <input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordMsg && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
              {passwordMsg}
            </p>
          )}
          {passwordErr && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              {passwordErr}
            </p>
          )}
          <button type="submit" className="primary" disabled={savingPassword}>
            {savingPassword ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      {isAdmin && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold text-tis-navy">Team roles</h2>
            <p className="mt-1 text-sm text-tis-muted">
              Assign Admin or Member for other Tina Admin users. You cannot change your own
              role.
            </p>
          </div>
          {others.length === 0 ? (
            <p className="text-sm text-tis-muted">No other team members yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {others.map((member) => (
                <li
                  key={member.user_id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-tis-ink">
                      {displayFirstName(member)}
                      {member.last_name ? ` ${member.last_name}` : ""}
                    </p>
                    <p className="truncate text-xs text-tis-muted">{member.email}</p>
                  </div>
                  <select
                    className="sm:max-w-[160px]"
                    value={member.role}
                    disabled={savingRoleId === member.user_id}
                    onChange={(e) =>
                      void changeMemberRole(member.user_id, e.target.value as AdminRole)
                    }
                    aria-label={`Role for ${member.email}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          {roleMsg && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
              {roleMsg}
            </p>
          )}
          {roleErr && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
              {roleErr}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

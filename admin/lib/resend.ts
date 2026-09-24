import type { AdminRole } from "@/lib/account";
import { roleLabel } from "@/lib/account";

function resendConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    ""
  ).trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function resendConfigured(): boolean {
  return resendConfig() !== null;
}

export async function sendInvitationEmail(args: {
  to: string;
  firstName: string;
  role: AdminRole;
  invitedByName: string;
  onboardUrl: string;
  expiresAt: Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = resendConfig();
  if (!config) {
    return {
      ok: false,
      error: "Invitation email is not configured (RESEND_API_KEY / RESEND_FROM).",
    };
  }

  const expiresLabel = args.expiresAt.toLocaleString("en-GB", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const roleName = roleLabel(args.role);
  const subject = "You're invited to Tina Admin";
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a191b; line-height: 1.5;">
  <p>Hi ${escapeHtml(args.firstName)},</p>
  <p><strong>${escapeHtml(args.invitedByName)}</strong> invited you to Tina Admin
  (Tokyo International School) as a <strong>${escapeHtml(roleName)}</strong>.</p>
  <p>Create your account and choose your own password to get started.
  This invitation expires on <strong>${escapeHtml(expiresLabel)} (JST)</strong>.</p>
  <p style="margin: 28px 0;">
    <a href="${escapeAttr(args.onboardUrl)}"
       style="background:#05513d;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">
      Create account
    </a>
  </p>
  <p style="font-size:13px;color:#5b5a58;">If the button does not work, open this link:<br/>
    <a href="${escapeAttr(args.onboardUrl)}">${escapeHtml(args.onboardUrl)}</a>
  </p>
  <p style="font-size:12px;color:#8a8884;">If you were not expecting this email, you can ignore it.</p>
</body>
</html>`.trim();

  const text = [
    `Hi ${args.firstName},`,
    "",
    `${args.invitedByName} invited you to Tina Admin as a ${roleName}.`,
    "Create your account and choose your own password:",
    args.onboardUrl,
    "",
    `This invitation expires on ${expiresLabel} (JST).`,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [args.to],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        JSON.stringify({
          scope: "resend",
          stage: "invite_failed",
          status: response.status,
          body: body.slice(0, 400),
        }),
      );
      return {
        ok: false,
        error: "Could not send the invitation email. Try again or check Resend configuration.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not reach the email service. Try again shortly.",
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

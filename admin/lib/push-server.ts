import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import {
  deliveryIdempotencyKey,
  isNeedsAttentionUnanswered,
  notificationPayloadForInteraction,
} from "@/lib/notifications";

export type NotifyResult = {
  notified: number;
  skipped: number;
  failed: number;
  reason?: string;
};

function configureVapid(): { ok: true } | { ok: false; reason: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@tokyois.com";
  if (!publicKey || !privateKey) {
    return { ok: false, reason: "vapid_not_configured" };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { ok: true };
}

function logStage(stage: string, meta: Record<string, unknown> = {}) {
  // Never log parent question text — previews may contain sensitive content.
  console.info(JSON.stringify({ scope: "push", stage, ...meta }));
}

/**
 * Send Web Push to all subscribed admins when an interaction enters Needs attention.
 * Failures never throw — callers must not break message processing.
 */
export async function notifyNeedsAttention(interactionId: string): Promise<NotifyResult> {
  const empty: NotifyResult = { notified: 0, skipped: 0, failed: 0 };
  if (!interactionId) {
    logStage("skip", { reason: "missing_interaction_id" });
    return { ...empty, reason: "missing_interaction_id" };
  }

  const vapid = configureVapid();
  if (!vapid.ok) {
    logStage("skip", { reason: vapid.reason, interactionId });
    return { ...empty, reason: vapid.reason };
  }

  let sb;
  try {
    sb = createServiceClient();
  } catch (error) {
    logStage("error", {
      stage: "service_client",
      interactionId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ...empty, reason: "service_client_missing" };
  }

  const { data: row, error: rowError } = await sb
    .from("interactions")
    .select(
      "id, reviewed_at, human_replied_at, manual_attention_at, outcome, session_id, question",
    )
    .eq("id", interactionId)
    .maybeSingle();

  if (rowError) {
    logStage("error", { stage: "load_interaction", interactionId, code: rowError.code });
    return { ...empty, reason: "load_failed" };
  }

  if (!isNeedsAttentionUnanswered(row)) {
    logStage("skip", { reason: "not_needs_attention", interactionId });
    return { ...empty, reason: "not_needs_attention" };
  }

  const sessionId = (row?.session_id as string | null | undefined) || null;
  const question = (row?.question as string | null | undefined) || null;

  const { data: subs, error: subError } = await sb
    .from("admin_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");

  if (subError) {
    logStage("error", { stage: "load_subscriptions", interactionId, code: subError.code });
    return { ...empty, reason: "subscriptions_failed" };
  }

  const subscriptions = subs || [];
  if (subscriptions.length === 0) {
    logStage("skip", { reason: "no_subscriptions", interactionId });
    return { ...empty, reason: "no_subscriptions" };
  }

  const byUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    const list = byUser.get(sub.user_id) || [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  const userIds = [...byUser.keys()];
  const { data: profiles } = await sb
    .from("admin_profiles")
    .select("user_id, notify_message_previews")
    .in("user_id", userIds);

  const previewByUser = new Map<string, boolean>();
  for (const profile of profiles || []) {
    previewByUser.set(
      profile.user_id as string,
      Boolean(profile.notify_message_previews),
    );
  }

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  for (const [userId, userSubs] of byUser) {
    const key = deliveryIdempotencyKey(userId, interactionId);
    const { error: claimError } = await sb.from("admin_push_deliveries").insert({
      interaction_id: interactionId,
      user_id: userId,
      idempotency_key: key,
      status: "sent",
    });

    if (claimError) {
      // Unique violation → already notified this user for this message.
      if (claimError.code === "23505") {
        skipped += 1;
        logStage("dedupe", { interactionId, userId });
        continue;
      }
      failed += 1;
      logStage("error", { stage: "claim_delivery", interactionId, code: claimError.code });
      continue;
    }

    const showPreview = previewByUser.get(userId) === true;
    const payload = notificationPayloadForInteraction({
      interactionId,
      sessionId,
      question: showPreview ? question : null,
      showPreview,
    });
    const body = JSON.stringify(payload);

    let anySent = false;
    let lastError: string | null = null;

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60, urgency: "high" },
        );
        anySent = true;
        logStage("sent", {
          interactionId,
          userId,
          subscriptionId: sub.id,
          preview: showPreview,
        });
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
        lastError = statusCode ? `http_${statusCode}` : "send_failed";
        logStage("send_error", {
          interactionId,
          userId,
          subscriptionId: sub.id,
          statusCode: statusCode || null,
        });
        if (statusCode === 404 || statusCode === 410) {
          await sb.from("admin_push_subscriptions").delete().eq("id", sub.id);
          logStage("subscription_removed", { subscriptionId: sub.id, statusCode });
        }
      }
    }

    if (!anySent) {
      failed += 1;
      await sb
        .from("admin_push_deliveries")
        .update({ status: "failed", error: lastError || "send_failed" })
        .eq("idempotency_key", key);
    } else {
      notified += 1;
    }
  }

  logStage("done", { interactionId, notified, skipped, failed, hasSession: Boolean(sessionId) });
  return { notified, skipped, failed };
}

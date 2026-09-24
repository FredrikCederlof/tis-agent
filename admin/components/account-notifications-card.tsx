"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  PUSH_SW_PATH,
  notificationsSupported,
  readNotifyChoice,
  resolveNotifyUiState,
  urlBase64ToUint8Array,
  writeNotifyChoice,
  type NotifyChoice,
  type NotifyUiState,
} from "@/lib/notifications";

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(PUSH_SW_PATH, { scope: "/" });
}

async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch("/api/push/vapid", { cache: "no-store" });
  if (!response.ok) throw new Error("vapid_fetch_failed");
  const data = (await response.json()) as { publicKey?: string };
  if (!data.publicKey) throw new Error("vapid_missing");
  return data.publicKey;
}

async function persistSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("subscribe_failed");
}

async function removeSubscription(endpoint: string): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/** Account settings: Needs attention alerts + optional message previews (INS-18). */
export function AccountNotificationsCard({
  initialShowPreviews = false,
}: {
  initialShowPreviews?: boolean;
}) {
  const [choice, setChoice] = useState<NotifyChoice | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [showPreviews, setShowPreviews] = useState(initialShowPreviews);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const uiState: NotifyUiState = resolveNotifyUiState({ supported, choice, permission });

  useEffect(() => {
    const ok = notificationsSupported();
    setSupported(ok);
    setChoice(readNotifyChoice());
    setPermission(ok ? Notification.permission : null);
  }, []);

  useEffect(() => {
    setShowPreviews(initialShowPreviews);
  }, [initialShowPreviews]);

  async function enableNotifications() {
    if (!notificationsSupported()) {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setStatusNote("This browser does not support notifications.");
      return;
    }
    setBusy(true);
    setStatusNote(null);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        writeNotifyChoice("dismissed");
        setChoice("dismissed");
        setStatusNote(
          permissionResult === "denied"
            ? "Notifications are blocked in this browser. Enable them in your browser site settings for Tina Admin, then try again."
            : "Notifications were not enabled.",
        );
        return;
      }

      const registration = await registerServiceWorker();
      await navigator.serviceWorker.ready;
      const publicKey = await fetchVapidPublicKey();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      await persistSubscription(subscription);
      writeNotifyChoice("enabled");
      setChoice("enabled");
    } catch {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setStatusNote("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    try {
      if (notificationsSupported()) {
        const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          try {
            await subscription.unsubscribe();
          } catch {
            /* ignore */
          }
          await removeSubscription(endpoint);
        }
      }
    } finally {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setBusy(false);
      setStatusNote(null);
    }
  }

  async function savePreviewPreference(next: boolean) {
    setPreviewBusy(true);
    setPreviewMsg(null);
    setPreviewErr(null);
    const previous = showPreviews;
    setShowPreviews(next);
    try {
      const response = await fetch("/api/account/notify-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_message_previews: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setShowPreviews(previous);
        setPreviewErr(result.detail || "Could not save preference.");
        return;
      }
      setPreviewMsg(result.message || "Preference saved.");
    } catch {
      setShowPreviews(previous);
      setPreviewErr("Could not save preference.");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-bold text-tis-navy">Alerts for Needs attention</h2>
        <p className="mt-1 text-sm text-tis-muted">
          Get a browser notification when a new message needs attention — even if Tina Admin is
          closed.
        </p>
      </div>

      {!supported && (
        <p className="text-sm text-tis-muted">This browser does not support web notifications.</p>
      )}

      {supported && uiState === "enabled" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-tis-success">
            <Bell className="h-4 w-4" />
            Alerts are on
          </p>
          <button
            type="button"
            className="secondary !px-3 !py-1.5 text-xs"
            disabled={busy}
            onClick={() => void disableNotifications()}
          >
            Turn off
          </button>
        </div>
      )}

      {supported && uiState === "blocked" && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          Notifications are blocked in this browser. Open your browser site settings for Tina Admin
          and allow notifications, then enable alerts here.
        </p>
      )}

      {supported &&
        (uiState === "prompt" || uiState === "not_enabled" || uiState === "unsupported") && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-tis-muted">
              <BellOff className="h-4 w-4" />
              Alerts are off
            </p>
            <button
              type="button"
              className="primary inline-flex items-center gap-2"
              disabled={busy}
              onClick={() => void enableNotifications()}
            >
              <Bell className="h-4 w-4" />
              {busy ? "Enabling…" : "Enable alerts"}
            </button>
            {statusNote && <p className="text-sm text-tis-muted">{statusNote}</p>}
          </div>
        )}

      <div className="border-t border-black/[0.06] pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-tis-navy">
              Show message previews in notifications
            </h3>
            <p className="mt-1 text-sm text-tis-muted">
              When enabled, notifications include a short preview of the parent&apos;s question.
              Preview text can be visible on a lock screen or to people near your device. Off by
              default.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-tis-navy">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showPreviews}
              disabled={previewBusy}
              onChange={(e) => void savePreviewPreference(e.target.checked)}
            />
            {showPreviews ? "On" : "Off"}
          </label>
        </div>
        {previewMsg && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">
            {previewMsg}
          </p>
        )}
        {previewErr && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">
            {previewErr}
          </p>
        )}
      </div>
    </section>
  );
}

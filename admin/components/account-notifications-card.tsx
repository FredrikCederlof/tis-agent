"use client";

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { GlassToggle } from "@/components/glass-toggle";
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

/** Account settings: Needs attention alerts + message previews. */
export function AccountNotificationsCard({
  initialShowPreviews = true,
}: {
  initialShowPreviews?: boolean;
}) {
  const [choice, setChoice] = useState<NotifyChoice | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [showPreviews, setShowPreviews] = useState(initialShowPreviews);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const uiState: NotifyUiState = resolveNotifyUiState({ supported, choice, permission });
  const alertsOn = uiState === "enabled";
  const alertsBlocked = uiState === "blocked";

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

  async function onAlertsToggle(next: boolean) {
    if (next) {
      await enableNotifications();
    } else {
      await disableNotifications();
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
        <h2 className="text-lg font-bold text-tis-navy">Notifications</h2>
        <p className="mt-1 text-sm text-tis-muted">
          Chrome alerts for Needs attention. The site address is shown by the browser; the parent
          question appears in the notification body when previews are on.
        </p>
      </div>

      {!supported && (
        <p className="text-sm text-tis-muted">This browser does not support web notifications.</p>
      )}

      {supported && alertsBlocked && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          Notifications are blocked in this browser. Open your browser site settings for Tina Admin
          and allow notifications, then enable alerts here.
        </p>
      )}

      {supported && (
        <div className="divide-y divide-black/[0.05] overflow-hidden rounded-[22px] border border-white/70 bg-white/35 shadow-[0_8px_28px_rgba(26,25,27,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150">
          <SettingRow
            title="Alerts for Needs attention"
            description={
              alertsOn
                ? "You will get a Chrome notification for new items."
                : "Turn on to subscribe this browser for Needs attention alerts."
            }
          >
            <GlassToggle
              checked={alertsOn}
              disabled={busy || alertsBlocked}
              aria-label="Alerts for Needs attention"
              onCheckedChange={(next) => void onAlertsToggle(next)}
            />
          </SettingRow>
          <SettingRow
            title="Show message previews"
            description="Include a short preview of the parent’s question in the notification. Preview text can be visible on a lock screen."
          >
            <GlassToggle
              checked={showPreviews}
              disabled={previewBusy}
              aria-label="Show message previews in notifications"
              onCheckedChange={(next) => void savePreviewPreference(next)}
            />
          </SettingRow>
        </div>
      )}

      {statusNote && <p className="text-sm text-tis-muted">{statusNote}</p>}
      {previewMsg && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-tis-success">{previewMsg}</p>
      )}
      {previewErr && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-tis-danger">{previewErr}</p>
      )}
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tis-navy">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-tis-muted">{description}</p>
      </div>
      <div className="shrink-0 rounded-[18px] border border-white/75 bg-white/40 p-2.5 shadow-[0_4px_18px_rgba(26,25,27,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}

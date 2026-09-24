"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  NOTIFY_CHOICE_KEY,
  PUSH_SW_PATH,
  notificationsSupported,
  readNotifyChoice,
  resolveNotifyUiState,
  urlBase64ToUint8Array,
  writeNotifyChoice,
  type NotifyChoice,
  type NotifyUiState,
} from "@/lib/notifications";

const POLL_MS = 45_000;

type Props = {
  iconsOnly?: boolean;
  onCountChange?: (count: number) => void;
};

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

export function NeedsAttentionNotifications({ iconsOnly = false, onCountChange }: Props) {
  const [choice, setChoice] = useState<NotifyChoice | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const uiState: NotifyUiState = resolveNotifyUiState({ supported, choice, permission });

  useEffect(() => {
    const ok = notificationsSupported();
    setSupported(ok);
    setChoice(readNotifyChoice());
    setPermission(ok ? Notification.permission : null);
  }, []);

  const pollCount = useCallback(async () => {
    const supabase = createClient();
    const { count, error } = await supabase
      .from("unanswered_interactions")
      .select("id", { count: "exact", head: true });
    if (!error) onCountChangeRef.current?.(count ?? 0);
  }, []);

  useEffect(() => {
    void pollCount();
    const timer = window.setInterval(() => void pollCount(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollCount]);

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
            ? "Notifications are blocked. Enable them in Chrome site settings."
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
      console.info(JSON.stringify({ scope: "push", stage: "client_enabled" }));
    } catch (error) {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setStatusNote("Could not enable notifications.");
      console.info(
        JSON.stringify({
          scope: "push",
          stage: "client_enable_error",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
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

  function dismissPrompt() {
    writeNotifyChoice("dismissed");
    setChoice("dismissed");
    // Clear any stale enabled flag key usage without re-prompting.
    try {
      window.localStorage.setItem(NOTIFY_CHOICE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
  }

  if (uiState === "unsupported" && choice === null) {
    return null;
  }

  return (
    <div className="space-y-2">
      {uiState === "prompt" && !iconsOnly && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold">Browser notifications</p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/70">
                Get alerted when a new message needs attention — even if Tina Admin is closed.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification prompt"
              onClick={dismissPrompt}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-tis-acid px-2 py-1.5 text-[11px] font-bold text-tis-ink disabled:opacity-60"
              onClick={() => void enableNotifications()}
            >
              <Bell className="h-3.5 w-3.5" />
              Enable
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-white/25 px-2 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
              onClick={dismissPrompt}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {uiState === "prompt" && iconsOnly && (
        <button
          type="button"
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/10 py-2.5 text-white hover:bg-white/15 disabled:opacity-60"
          title="Enable browser notifications"
          aria-label="Enable browser notifications"
          onClick={() => void enableNotifications()}
        >
          <Bell className="h-4 w-4" />
        </button>
      )}

      {uiState === "enabled" && !iconsOnly && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-white/55">
            <Bell className="h-3 w-3" />
            Alerts on for Needs attention
          </p>
          <button
            type="button"
            disabled={busy}
            className="text-[10px] font-semibold text-white/50 hover:text-white/80 disabled:opacity-60"
            onClick={() => void disableNotifications()}
          >
            Turn off
          </button>
        </div>
      )}

      {uiState === "enabled" && iconsOnly && (
        <p className="text-center text-[9px] font-medium text-white/45" title="Alerts enabled">
          <Bell className="mx-auto h-3.5 w-3.5" />
        </p>
      )}

      {uiState === "blocked" && !iconsOnly && (
        <p className="flex items-start gap-1.5 px-1 text-[10px] leading-snug text-white/50">
          <BellOff className="mt-0.5 h-3 w-3 shrink-0" />
          Blocked in browser — enable notifications in Chrome site settings for this site.
        </p>
      )}

      {(uiState === "not_enabled" || uiState === "unsupported") && statusNote && !iconsOnly && (
        <p className="flex items-start gap-1.5 px-1 text-[10px] leading-snug text-white/50">
          <BellOff className="mt-0.5 h-3 w-3 shrink-0" />
          {statusNote}
        </p>
      )}

      {uiState === "not_enabled" && !statusNote && !iconsOnly && (
        <button
          type="button"
          disabled={busy}
          className="flex w-full items-center gap-1.5 px-1 text-left text-[10px] font-medium text-white/55 hover:text-white/80 disabled:opacity-60"
          onClick={() => void enableNotifications()}
        >
          <BellOff className="h-3 w-3" />
          Notifications off — enable
        </button>
      )}
    </div>
  );
}

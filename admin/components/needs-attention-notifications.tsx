"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  NEEDS_ATTENTION_INBOX_PATH,
  diffAttentionNotifications,
  notificationBodyForCount,
  notificationsSupported,
  readNotifyChoice,
  readSeenIds,
  seedSeenIds,
  writeNotifyChoice,
  writeSeenIds,
  type NotifyChoice,
} from "@/lib/notifications";

const POLL_MS = 45_000;

type Props = {
  iconsOnly?: boolean;
  onCountChange?: (count: number) => void;
};

export function NeedsAttentionNotifications({ iconsOnly = false, onCountChange }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [choice, setChoice] = useState<NotifyChoice | null>(null);
  const [supported, setSupported] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const seededRef = useRef(false);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  useEffect(() => {
    const ok = notificationsSupported();
    setSupported(ok);
    const saved = readNotifyChoice();
    setChoice(saved);
    setBannerVisible(ok && saved === null);
  }, []);

  const showBrowserNotification = useCallback(
    (notifyIds: string[]) => {
      if (!notificationsSupported() || Notification.permission !== "granted") return;
      if (notifyIds.length === 0) return;

      // Avoid noise while already looking at the queue with the tab focused.
      if (pathname.startsWith(NEEDS_ATTENTION_INBOX_PATH) && document.visibilityState === "visible") {
        return;
      }

      const title = "Tina Admin";
      const body = notificationBodyForCount(notifyIds.length);
      const tag =
        notifyIds.length === 1
          ? `needs-attention-${notifyIds[0]}`
          : `needs-attention-batch-${notifyIds[0]}`;

      try {
        const n = new Notification(title, {
          body,
          tag,
        });
        n.onclick = () => {
          try {
            window.focus();
          } catch {
            /* ignore */
          }
          router.push(NEEDS_ATTENTION_INBOX_PATH);
          n.close();
        };
      } catch {
        /* Unsupported or blocked mid-flight — admin keeps working. */
      }
    },
    [pathname, router],
  );

  const poll = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("unanswered_interactions")
      .select("id")
      .limit(100);
    if (error) return;

    const currentIds = (data || []).map((row) => String(row.id)).filter(Boolean);
    onCountChangeRef.current?.(currentIds.length);

    const savedChoice = readNotifyChoice();
    if (savedChoice !== "enabled") return;
    if (!notificationsSupported() || Notification.permission !== "granted") return;

    if (!seededRef.current) {
      const next = seedSeenIds(currentIds, readSeenIds());
      writeSeenIds(next);
      seededRef.current = true;
      return;
    }

    const { notifyIds, nextSeen } = diffAttentionNotifications(currentIds, readSeenIds());
    writeSeenIds(nextSeen);
    if (notifyIds.length > 0) {
      showBrowserNotification(notifyIds);
    }
  }, [showBrowserNotification]);

  useEffect(() => {
    seededRef.current = false;
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [choice, poll]);

  async function enableNotifications() {
    if (!notificationsSupported()) {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setBannerVisible(false);
      setStatusNote("This browser does not support notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        writeNotifyChoice("enabled");
        setChoice("enabled");
        setBannerVisible(false);
        setStatusNote(null);
        seededRef.current = false;
        void poll();
      } else {
        writeNotifyChoice("dismissed");
        setChoice("dismissed");
        setBannerVisible(false);
        setStatusNote(
          permission === "denied"
            ? "Notifications are blocked in Chrome settings."
            : "Notifications were not enabled.",
        );
      }
    } catch {
      writeNotifyChoice("dismissed");
      setChoice("dismissed");
      setBannerVisible(false);
      setStatusNote("Could not enable notifications.");
    }
  }

  function dismissPrompt() {
    writeNotifyChoice("dismissed");
    setChoice("dismissed");
    setBannerVisible(false);
  }

  if (!supported && choice === null) {
    return null;
  }

  return (
    <div className="space-y-2">
      {bannerVisible && !iconsOnly && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-2.5 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold">Browser notifications</p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/70">
                Get alerted when a new message needs attention.
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
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-tis-acid px-2 py-1.5 text-[11px] font-bold text-tis-ink"
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

      {bannerVisible && iconsOnly && (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/10 py-2.5 text-white hover:bg-white/15"
          title="Enable browser notifications"
          aria-label="Enable browser notifications"
          onClick={() => void enableNotifications()}
        >
          <Bell className="h-4 w-4" />
        </button>
      )}

      {choice === "enabled" && !iconsOnly && (
        <p className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-white/55">
          <Bell className="h-3 w-3" />
          Alerts on for Needs attention
        </p>
      )}

      {choice === "dismissed" && statusNote && !iconsOnly && (
        <p className="flex items-start gap-1.5 px-1 text-[10px] leading-snug text-white/50">
          <BellOff className="mt-0.5 h-3 w-3 shrink-0" />
          {statusNote}
        </p>
      )}
    </div>
  );
}

/* Tina Admin Web Push service worker (INS-16 / INS-18 / INS-21). */
/* Version: 2026-09-30 — unique tags + renotify so each Needs attention alert surfaces. */
/* eslint-disable no-restricted-globals */

self.addEventListener("push", (event) => {
  let payload = {
    title: "New message needs attention",
    body: "Open Tina Admin to review and reply.",
    tag: `needs-attention-${Date.now()}`,
    data: { url: "/inbox" },
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    /* keep defaults */
  }

  const options = {
    body: payload.body,
    // Unique per interaction (set by server). Avoid a shared tag that Chrome collapses.
    tag: payload.tag || `needs-attention-${Date.now()}`,
    icon: "/tina.png",
    badge: "/tina.png",
    data: payload.data || { url: "/inbox" },
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.title || "New message needs attention",
      options,
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/inbox";
  const absolute =
    targetUrl.startsWith("http") ? targetUrl : new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(absolute);
            } catch {
              /* older browsers */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(absolute);
      }
    })(),
  );
});

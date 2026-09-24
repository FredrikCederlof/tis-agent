/* Tina Admin Web Push service worker (INS-16). */
/* eslint-disable no-restricted-globals */

self.addEventListener("push", (event) => {
  let payload = {
    title: "Tina Admin",
    body: "A parent message needs attention.",
    tag: "needs-attention",
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
    tag: payload.tag || "needs-attention",
    icon: "/tina.png",
    badge: "/tina.png",
    data: payload.data || { url: "/inbox" },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Tina Admin", options));
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

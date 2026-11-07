self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { /* Show a visible fallback for malformed pushes. */ }
  event.waitUntil(self.registration.showNotification(payload?.title || "Black Turtle", {
    body: payload?.body || "새 알림이 도착했습니다.",
    icon: "/push-icon.png",
    tag: payload?.tag,
    data: { url: payload?.url === "/market" ? "/market" : "/macro" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url === "/market" ? "/market" : "/macro";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

// Firebase Cloud Messaging delivers notification payloads in the background.
// The worker handles notification clicks and opens EdgeTerminal.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const raw = event.notification.data?.FCM_MSG?.data?.url || event.notification.data?.url || "/";
  const target = new URL(raw, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) { if ("focus" in client) { await client.focus(); if ("navigate" in client) await client.navigate(target); return; } }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});

self.addEventListener("push", event => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "EdgeTerminal update" }; }
  const title = data.title || "EdgeTerminal alert";
  event.waitUntil(self.registration.showNotification(title, { body: data.body || "A market alert is available.", icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag || "edge-market-alert", data: { url: data.url || "/" }, renotify: false }));
});
self.addEventListener("notificationclick", event => { event.notification.close(); const target = new URL(event.notification.data?.url || "/", self.location.origin).href; event.waitUntil((async()=>{ const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true}); for(const client of clientsList){ if("focus" in client){ await client.focus(); if("navigate" in client) await client.navigate(target); return; } } if(clients.openWindow) await clients.openWindow(target); })()); });

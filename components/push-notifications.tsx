"use client";
import { useState } from "react";
import { auth, getIdToken } from "@/lib/auth-client";
import { BellRing, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushNotifications() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function enable() {
    setBusy(true); setMessage("");
    try {
      if (!auth.currentUser) throw new Error("Sign in before enabling device notifications.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support web push.");
      if (!window.isSecureContext) throw new Error("Push notifications require HTTPS (localhost is supported for development).");
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches) {
        throw new Error("On iPhone/iPad, add EdgeTerminal to the Home Screen and open it there before enabling push.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");

      const token = await getIdToken(auth.currentUser);
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const keyRes = await fetch("/api/push/key", { headers });
      const keyData = await keyRes.json();
      if (!keyRes.ok) throw new Error(keyData.error || "Push configuration unavailable");

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription())
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as BufferSource });

      const save = await fetch("/api/push/subscribe", { method: "POST", headers, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      const saved = await save.json();
      if (!save.ok) throw new Error(saved.error || "Could not register this device");

      const test = await fetch("/api/push/test", { method: "POST", headers });
      const result = await test.json();
      if (!test.ok) throw new Error(result.error || "Device registered, but test delivery failed");
      setMessage("This device is registered. A test notification has been sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable push notifications.");
    } finally { setBusy(false); }
  }

  return (
    <div className="msc-push-control">
      <button type="button" onClick={() => void enable()} disabled={busy}><Smartphone size={13} /><BellRing size={13} />{busy ? "Connecting…" : "Enable device push"}</button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}

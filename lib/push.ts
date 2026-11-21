import webpush, { type PushSubscription } from "web-push";
import { deletePushSubscriptionById, listPushSubscriptions } from "@/lib/server/store";

export { endpointId } from "@/lib/server/store";

/** Standard Web Push (VAPID). Generate keys once with:  npx web-push generate-vapid-keys */
export function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@localhost";
  if (!publicKey || !privateKey) {
    throw new Error("Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate them with: npx web-push generate-vapid-keys).");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}

export async function sendPushToUser(uid: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  const subscriptions = await listPushSubscriptions(uid);
  let sent = 0, expired = 0, failed = 0;
  const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || "/", tag: payload.tag || "edge-market-alert" });
  await Promise.all(subscriptions.map(async ({ endpointId, subscription }) => {
    try {
      await webpush.sendNotification(subscription as PushSubscription, message, { TTL: 60 * 60 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) { await deletePushSubscriptionById(uid, endpointId); expired++; }
      else failed++;
    }
  }));
  return { sent, expired, failed };
}

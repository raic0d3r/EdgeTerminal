import { createHash } from "node:crypto";
import { getMessaging } from "firebase-admin/messaging";
import { getAdminServices } from "@/lib/firebase-admin";

export function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error("Push is not configured. Set VAPID_PUBLIC_KEY to the Firebase Cloud Messaging Web Push certificate key.");
  return { publicKey };
}
export function endpointId(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function sendPushToUser(uid: string, payload: {title:string;body:string;url?:string;tag?:string}) {
  const { adminDb } = getAdminServices();
  const snap = await adminDb.collection("users").doc(uid).collection("pushSubscriptions").get();
  let sent=0, expired=0, failed=0;
  const messaging=getMessaging();
  await Promise.all(snap.docs.map(async doc => {
    const token=String(doc.data().token||""); if(!token){await doc.ref.delete();expired++;return;}
    try { await messaging.send({token,notification:{title:payload.title,body:payload.body},data:{url:payload.url||"/",tag:payload.tag||"edge-market-alert"},webpush:{notification:{icon:"/icon-192.png",badge:"/icon-192.png",tag:payload.tag||"edge-market-alert"}}}); sent++; }
    catch(error:any){ const code=String(error?.code||""); if(code.includes("registration-token-not-registered")||code.includes("invalid-registration-token")){await doc.ref.delete();expired++;}else failed++; }
  }));
  return {sent,expired,failed};
}

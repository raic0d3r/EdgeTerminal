import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAdminServices } from "@/lib/firebase-admin";

export const CTRADER_STATE_COOKIE = "edge_ctrader_oauth_state";
export function clearCTraderCookies(response: import("next/server").NextResponse) {
  response.cookies.set("edge_ctrader_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(CTRADER_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/ctrader", maxAge: 0 });
}

export type CTraderTokenSession = { accessToken: string; refreshToken: string; expiresAt: number };
export type CTraderSessionResult = { session: CTraderTokenSession | null; refreshed: boolean; uid: string | null };

export function getCTraderConfig() {
  const clientId = process.env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CTRADER_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("cTrader is not configured.");
  const parsed = new URL(redirectUri);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("The cTrader redirect URI must use HTTPS in production.");
  return { clientId, clientSecret, redirectUri };
}

function encryptionKey() {
  const secret = process.env.CTRADER_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) throw new Error("Set CTRADER_TOKEN_ENCRYPTION_KEY to a dedicated random secret of at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}
export function encryptSession(session: CTraderTokenSession) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
function decryptSession(value?: string): CTraderTokenSession | null {
  if (!value) return null;
  try {
    const packed = Buffer.from(value, "base64url"); if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as CTraderTokenSession;
    return parsed.accessToken && parsed.refreshToken && Number.isFinite(parsed.expiresAt) ? parsed : null;
  } catch { return null; }
}

export async function requireFirebaseUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  try { const { adminAuth } = getAdminServices(); return (await adminAuth.verifyIdToken(header.slice(7), true)).uid; }
  catch { return null; }
}

export async function createOAuthTransaction(uid: string, state: string) {
  const { adminDb } = getAdminServices();
  const stateHash = createHash("sha256").update(state).digest("hex");
  await adminDb.collection("ctraderOAuthStates").doc(stateHash).create({ uid, createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });
}
export async function consumeOAuthTransaction(state: string): Promise<string | null> {
  const { adminDb } = getAdminServices(); const ref = adminDb.collection("ctraderOAuthStates").doc(createHash("sha256").update(state).digest("hex"));
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) return null;
    const data = snap.data()!; tx.delete(ref);
    if (typeof data.uid !== "string" || Number(data.expiresAt) < Date.now()) return null;
    return data.uid;
  });
}
export async function saveCTraderSession(uid: string, session: CTraderTokenSession) {
  const { adminDb } = getAdminServices();
  await adminDb.collection("ctraderSessions").doc(uid).set({ encryptedSession: encryptSession(session), expiresAt: session.expiresAt, updatedAt: Date.now(), provider: "ctrader" });
}
export async function deleteCTraderSession(uid: string) {
  const { adminDb } = getAdminServices(); await adminDb.collection("ctraderSessions").doc(uid).delete();
}

export async function getFreshCTraderSession(request: NextRequest): Promise<CTraderSessionResult> {
  const uid = await requireFirebaseUid(request); if (!uid) return { session: null, refreshed: false, uid: null };
  const { adminDb } = getAdminServices(); const snap = await adminDb.collection("ctraderSessions").doc(uid).get();
  const current = decryptSession(snap.data()?.encryptedSession);
  if (!current) return { session: null, refreshed: false, uid };
  if (current.expiresAt > Date.now() + 5 * 60 * 1000) return { session: current, refreshed: false, uid };
  try {
    const { clientId, clientSecret } = getCTraderConfig(); const url = new URL("https://openapi.ctrader.com/apps/token");
    url.searchParams.set("grant_type", "refresh_token"); url.searchParams.set("refresh_token", current.refreshToken); url.searchParams.set("client_id", clientId); url.searchParams.set("client_secret", clientSecret);
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    const body = await response.json().catch(() => null); const expiresIn = Number(body?.expiresIn);
    if (!response.ok || !body?.accessToken || !body?.refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) return { session: null, refreshed: false, uid };
    const session = { accessToken: String(body.accessToken), refreshToken: String(body.refreshToken), expiresAt: Date.now() + expiresIn * 1000 };
    await saveCTraderSession(uid, session); return { session, refreshed: true, uid };
  } catch { return { session: null, refreshed: false, uid }; }
}

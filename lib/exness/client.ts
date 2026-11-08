import { createHash, createPrivateKey, sign, randomUUID } from "node:crypto";

export type ExnessCredentials = { apiKey: string; privateKey: string; accountId: string; gatewayUrl: string; accessPoint?: string };
const EMPTY_BODY_HASH = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

function base64url(value: Buffer) { return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function loadKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) return createPrivateKey(trimmed);
  if (!/^[a-fA-F0-9]{128}$/.test(trimmed)) throw new Error("Private signing key must be the 128-character hex key from Exness or an Ed25519 PKCS#8 PEM.");
  const seed = Buffer.from(trimmed.slice(0, 64), "hex");
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}
function safeBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !(url.hostname === "exness.com" || url.hostname.endsWith(".exness.com"))) throw new Error("Enter the official HTTPS Exness Gateway URL shown in Key Management.");
  return url.origin;
}
export function signedHeaders(credentials: ExnessCredentials, method: string, path: string, body = "", idempotencyKey = "") {
  const timestamp = Date.now();
  const payload = { api_key: credentials.apiKey, idempotency_key: idempotencyKey, timestamp, sign_version: 1, method, path, body_hash: base64url(createHash("sha256").update(body).digest()) };
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const data = base64url(bytes);
  const signature = base64url(sign(null, bytes, loadKey(credentials.privateKey)));
  return { "EXN-API-KEY": credentials.apiKey, "EXN-IDEMPOTENCY-KEY": idempotencyKey, "EXN-TIMESTAMP": String(timestamp), "EXN-SIGN-VERSION": "1", "EXN-DATA": data, "EXN-SIGN": signature, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) };
}
export async function exnessGet<T = Record<string, unknown>>(credentials: ExnessCredentials, baseUrl: string, path: string): Promise<T> {
  const response = await fetch(safeBaseUrl(baseUrl) + path, { method: "GET", headers: signedHeaders(credentials, "GET", path), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String(json?.error_message || json?.message || `Exness API returned HTTP ${response.status}`);
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  return json as T;
}
export async function verifyExnessConnection(input: ExnessCredentials) {
  if (!/^\d+$/.test(input.accountId) || BigInt(input.accountId) <= 0n) throw new Error("Enter the numeric Exness trading account ID.");
  if (!input.apiKey.trim()) throw new Error("Enter your Exness API key identifier.");
  loadKey(input.privateKey);
  const gateway = safeBaseUrl(input.gatewayUrl);
  const discovery = await exnessGet<{ access_point?: string }>(input, gateway, `/v1/trading/access-point?account_id=${encodeURIComponent(input.accountId)}`);
  if (!discovery.access_point) throw new Error("Exness discovery did not return an account access point.");
  const accessPoint = safeBaseUrl(discovery.access_point);
  const account = await exnessGet<Record<string, unknown>>(input, accessPoint, `/v1/configuration/accounts/${input.accountId}/account`);
  return { accessPoint, account };
}
export function newExnessIdempotencyKey(prefix = "edge") { return `${prefix}-${Date.now()}-${randomUUID()}`.slice(0, 120); }

export async function exnessRequest<T = Record<string, unknown>>(credentials: ExnessCredentials, baseUrl: string, method: "POST" | "PATCH" | "DELETE", path: string, body?: Record<string, unknown>, idempotencyKey = newExnessIdempotencyKey()): Promise<T> {
  const serialized = body ? JSON.stringify(body) : "";
  const response = await fetch(safeBaseUrl(baseUrl) + path, { method, headers: signedHeaders(credentials, method, path, serialized, idempotencyKey), body: serialized || undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  const json = await response.json().catch(() => null);
  if (!response.ok) { const message = String(json?.error_message || json?.message || `Exness API returned HTTP ${response.status}`); throw new Error(`${message} (HTTP ${response.status})`); }
  return json as T;
}

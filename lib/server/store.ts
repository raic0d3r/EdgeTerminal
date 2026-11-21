import { createHash } from "node:crypto";
import { query } from "@/lib/server/db";
import { rowToUser, USER_COLUMNS, type AccessFlags, type AuthUser, type Role, type UserRow } from "@/lib/server/auth";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ================= Users ================= */

export async function getUserById(id: string): Promise<AuthUser | null> {
  if (!UUID_RE.test(id)) return null;
  const r = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
  return r.rows[0] ? rowToUser(r.rows[0]) : null;
}

export async function listUsers(limit = 1000): Promise<AuthUser[]> {
  const r = await query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u ORDER BY u.created_at DESC LIMIT $1`, [limit]);
  return r.rows.map(rowToUser);
}

export async function updateUserAdmin(
  id: string,
  actorId: string,
  patch: { role?: Role; status?: "active" | "disabled"; access?: Partial<AccessFlags> },
) {
  const sets: string[] = ["updated_at = now()", "updated_by = $2"];
  const params: unknown[] = [id, actorId];
  const add = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
  if (patch.role !== undefined) add("role", patch.role);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.access?.generalSilver !== undefined) add("access_general_silver", patch.access.generalSilver);
  if (patch.access?.generalGold !== undefined) add("access_general_gold", patch.access.generalGold);
  if (patch.access?.vipLounge !== undefined) add("access_vip_lounge", patch.access.vipLounge);
  if (patch.access?.importantVip !== undefined) add("access_important_vip", patch.access.importantVip);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, params);
  // Disabling an account immediately kills every active session (Firebase did this via token revocation).
  if (patch.status === "disabled") await query("DELETE FROM sessions WHERE user_id = $1", [id]);
}

export async function updateOwnProfile(id: string, patch: { displayName?: string; photoURL?: string | null }) {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [id];
  if (patch.displayName !== undefined) { params.push(patch.displayName); sets.push(`display_name = $${params.length}`); }
  if (patch.photoURL !== undefined) { params.push(patch.photoURL); sets.push(`photo_url = $${params.length}`); }
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, params);
}

/* ================= Platform settings (feature access, chart display) ================= */

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const r = await query<{ value: T }>("SELECT value FROM platform_settings WHERE key = $1", [key]);
  return r.rows[0]?.value;
}

export async function setSetting(key: string, value: unknown, updatedBy: string) {
  await query(
    `INSERT INTO platform_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy],
  );
}

/* ================= Broker connections (Exness) ================= */

export async function getBrokerCredentials(userId: string, provider: string): Promise<string | null> {
  const r = await query<{ encrypted_credentials: string }>(
    "SELECT encrypted_credentials FROM broker_connections WHERE user_id = $1 AND provider = $2", [userId, provider]);
  return r.rows[0]?.encrypted_credentials || null;
}

export async function saveBrokerConnection(userId: string, provider: string, data: {
  encryptedCredentials: string; accountId: string; accessPoint?: string; accountSummary: Record<string, string>;
}) {
  await query(
    `INSERT INTO broker_connections (user_id, provider, encrypted_credentials, account_id, access_point, account_summary, connected)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
     ON CONFLICT (user_id, provider) DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials,
       account_id = EXCLUDED.account_id, access_point = EXCLUDED.access_point,
       account_summary = EXCLUDED.account_summary, connected = true, updated_at = now()`,
    [userId, provider, data.encryptedCredentials, data.accountId, data.accessPoint ?? null, JSON.stringify(data.accountSummary)],
  );
}

export async function deleteBrokerConnection(userId: string, provider: string) {
  await query("DELETE FROM broker_connections WHERE user_id = $1 AND provider = $2", [userId, provider]);
}

/* ================= Push subscriptions + price alerts ================= */

export const endpointId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

export async function savePushSubscription(userId: string, subscription: unknown, endpoint: string, userAgent: string) {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint_id, subscription, user_agent)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (user_id, endpoint_id) DO UPDATE SET subscription = EXCLUDED.subscription,
       user_agent = EXCLUDED.user_agent, updated_at = now()`,
    [userId, endpointId(endpoint), JSON.stringify(subscription), userAgent.slice(0, 300)],
  );
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint_id = $2", [userId, endpointId(endpoint)]);
}

export async function listPushSubscriptions(userId: string): Promise<Array<{ endpointId: string; subscription: unknown }>> {
  const r = await query<{ endpoint_id: string; subscription: unknown }>(
    "SELECT endpoint_id, subscription FROM push_subscriptions WHERE user_id = $1", [userId]);
  return r.rows.map(row => ({ endpointId: row.endpoint_id, subscription: row.subscription }));
}

export async function deletePushSubscriptionById(userId: string, id: string) {
  await query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint_id = $2", [userId, id]);
}

export async function savePriceAlert(userId: string, asset: string, config: unknown) {
  await query(
    `INSERT INTO price_alerts (user_id, asset, config) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, asset) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [userId, asset, JSON.stringify(config)],
  );
}

export async function deletePriceAlert(userId: string, asset: string) {
  await query("DELETE FROM price_alerts WHERE user_id = $1 AND asset = $2", [userId, asset]);
}

export async function pushStats() {
  const r = await query<{ subscriptions: string; alerts: string }>(
    `SELECT (SELECT count(*) FROM push_subscriptions) AS subscriptions, (SELECT count(*) FROM price_alerts) AS alerts`);
  return { subscriptions: Number(r.rows[0].subscriptions), armedAlerts: Number(r.rows[0].alerts) };
}

/* ================= cTrader OAuth + sessions ================= */

export async function insertOAuthState(stateHash: string, userId: string, ttlMs: number) {
  await query(
    "INSERT INTO ctrader_oauth_states (state_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))",
    [stateHash, userId, ttlMs]);
  if (Math.random() < 0.05) void query("DELETE FROM ctrader_oauth_states WHERE expires_at < now()").catch(() => undefined);
}

/** Atomically consumes a state (single use). Returns the user id when valid and unexpired. */
export async function consumeOAuthState(stateHash: string): Promise<string | null> {
  const r = await query<{ user_id: string; valid: boolean }>(
    "DELETE FROM ctrader_oauth_states WHERE state_hash = $1 RETURNING user_id, (expires_at > now()) AS valid", [stateHash]);
  return r.rows[0]?.valid ? r.rows[0].user_id : null;
}

export async function upsertCTraderSession(userId: string, encryptedSession: string, expiresAt: number) {
  await query(
    `INSERT INTO ctrader_sessions (user_id, encrypted_session, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET encrypted_session = EXCLUDED.encrypted_session,
       expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [userId, encryptedSession, expiresAt]);
}

export async function getCTraderSessionBlob(userId: string): Promise<string | null> {
  const r = await query<{ encrypted_session: string }>("SELECT encrypted_session FROM ctrader_sessions WHERE user_id = $1", [userId]);
  return r.rows[0]?.encrypted_session ?? null;
}

export async function removeCTraderSession(userId: string) {
  await query("DELETE FROM ctrader_sessions WHERE user_id = $1", [userId]);
}

/* ================= Feature suggestions ================= */

export type FeatureSuggestion = { id: string; author: string; title: string; description: string; createdAt: string };
type SuggestionRow = { id: number; author: string; title: string; description: string; created_at: Date };
const toSuggestion = (r: SuggestionRow): FeatureSuggestion => ({ id: String(r.id), author: r.author, title: r.title, description: r.description, createdAt: r.created_at.toISOString() });

export async function listFeatureSuggestions(limit = 200): Promise<FeatureSuggestion[]> {
  const r = await query<SuggestionRow>("SELECT id, author, title, description, created_at FROM feature_suggestions ORDER BY created_at DESC LIMIT $1", [limit]);
  return r.rows.map(toSuggestion);
}

export async function createFeatureSuggestion(userId: string, author: string, title: string, description: string): Promise<FeatureSuggestion> {
  const r = await query<SuggestionRow>(
    "INSERT INTO feature_suggestions (user_id, author, title, description) VALUES ($1,$2,$3,$4) RETURNING id, author, title, description, created_at",
    [userId, author, title, description]);
  return toSuggestion(r.rows[0]);
}

/* ================= Group chat ================= */

export type StoredChatMessage = { id: number; group_key: string; author: string; body: string; created_at: string };
export const validGroups = new Set(["general-silver", "general-gold", "vip-lounge", "important-vip"]);
type ChatRow = { id: number; group_key: string; author: string; body: string; created_at: Date };
const toChat = (r: ChatRow): StoredChatMessage => ({ ...r, created_at: r.created_at.toISOString() });

export async function listMessages(groupKey: string): Promise<StoredChatMessage[]> {
  // Last 300 messages, returned oldest-first.
  const r = await query<ChatRow>(
    `SELECT * FROM (SELECT id, group_key, author, body, created_at FROM chat_messages WHERE group_key = $1 ORDER BY id DESC LIMIT 300) t ORDER BY id ASC`,
    [groupKey]);
  return r.rows.map(toChat);
}

export async function addMessage(groupKey: string, author: string, body: string): Promise<StoredChatMessage> {
  const r = await query<ChatRow>(
    "INSERT INTO chat_messages (group_key, author, body) VALUES ($1,$2,$3) RETURNING id, group_key, author, body, created_at",
    [groupKey, author, body]);
  return toChat(r.rows[0]);
}

/* ================= Support threads ================= */

export type SupportMessage = { id: number; user_uid: string; sender_uid: string; sender_role: "user" | "admin"; body: string; created_at: string };
type SupportRow = { id: number; user_uid: string; sender_uid: string | null; sender_role: "user" | "admin"; body: string; created_at: Date };
const toSupport = (r: SupportRow): SupportMessage => ({ ...r, sender_uid: r.sender_uid ?? "", created_at: r.created_at.toISOString() });
const SUPPORT_COLS = "id, user_id AS user_uid, sender_id AS sender_uid, sender_role, body, created_at";

export async function listSupportMessages(userId: string): Promise<SupportMessage[]> {
  if (!UUID_RE.test(userId)) return [];
  const r = await query<SupportRow>(
    `SELECT * FROM (SELECT ${SUPPORT_COLS} FROM support_messages WHERE user_id = $1 ORDER BY id DESC LIMIT 500) t ORDER BY id ASC`, [userId]);
  return r.rows.map(toSupport);
}

export async function listAllSupportMessages(): Promise<SupportMessage[]> {
  const r = await query<SupportRow>(
    `SELECT DISTINCT ON (user_id) ${SUPPORT_COLS} FROM support_messages ORDER BY user_id, id DESC`);
  return r.rows.map(toSupport).sort((a, b) => b.id - a.id).slice(0, 300);
}

export async function addSupportMessage(userId: string, senderId: string, role: "user" | "admin", body: string): Promise<SupportMessage> {
  const r = await query<SupportRow>(
    `INSERT INTO support_messages (user_id, sender_id, sender_role, body) VALUES ($1,$2,$3,$4) RETURNING ${SUPPORT_COLS}`,
    [userId, senderId, role, body]);
  return toSupport(r.rows[0]);
}

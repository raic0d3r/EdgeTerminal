import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { query } from "@/lib/server/db";

/* ---------- Types ---------- */

export type Role = "member" | "vip" | "admin";
export type AccessFlags = { generalSilver: boolean; generalGold: boolean; vipLounge: boolean; importantVip: boolean };

export type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: Role;
  status: "active" | "disabled";
  access: AccessFlags;
  createdAt: string;
};

/** Mirrors the error shape Firebase used (`code: "auth/..."`) so existing route error handling keeps working. */
export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type UserRow = {
  id: string; email: string; password_hash?: string; display_name: string; photo_url: string | null;
  role: Role; status: "active" | "disabled";
  access_general_silver: boolean; access_general_gold: boolean; access_vip_lounge: boolean; access_important_vip: boolean;
  created_at: Date;
};

export const USER_COLUMNS = `u.id, u.email, u.display_name, u.photo_url, u.role, u.status,
  u.access_general_silver, u.access_general_gold, u.access_vip_lounge, u.access_important_vip, u.created_at`;

export function rowToUser(row: UserRow): AuthUser {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url,
    role: row.role,
    status: row.status,
    access: {
      generalSilver: row.access_general_silver,
      generalGold: row.access_general_gold,
      vipLounge: row.access_vip_lounge,
      importantVip: row.access_important_vip,
    },
    createdAt: row.created_at.toISOString(),
  };
}

/* ---------- Admin allow-list (unchanged behaviour: ADMIN_EMAILS env var) ---------- */

export function isAllowlistedAdmin(email?: string | null) {
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

/* ---------- Password hashing (scrypt, built into Node: no native modules to compile) ---------- */

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (error, key) => {
      if (error) reject(error); else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used so that "unknown email" and "wrong password" take the same time (prevents account enumeration by timing).
let dummyHashPromise: Promise<string> | null = null;
function dummyHash() { return (dummyHashPromise ??= hashPassword("not-a-real-password")); }

/* ---------- Input validation ---------- */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/* ---------- Sessions ---------- */

const SESSION_DAYS = 30;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [sha256(token), userId, SESSION_DAYS, userAgent ? userAgent.slice(0, 300) : null],
  );
  if (Math.random() < 0.05) void query("DELETE FROM sessions WHERE expires_at < now()").catch(() => undefined);
  return token;
}

export async function revokeSession(token: string) {
  await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

/**
 * Drop-in replacement for Firebase `verifyIdToken(token, true)`.
 * Throws AuthError("auth/...") when the token is unknown, expired, revoked, or the account is disabled.
 */
export async function verifyToken(token: string): Promise<AuthUser> {
  if (!token || token.length > 200) throw new AuthError("auth/invalid-token", "Invalid session token.");
  const hash = sha256(token);
  const result = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hash],
  );
  const row = result.rows[0];
  if (!row) throw new AuthError("auth/id-token-revoked", "Session expired or revoked. Sign in again.");
  if (row.status === "disabled") throw new AuthError("auth/user-disabled", "This account has been disabled.");
  // Sliding expiry, written at most once an hour per session.
  void query(
    `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(days => $2)
     WHERE token_hash = $1 AND last_used_at < now() - interval '1 hour'`,
    [hash, SESSION_DAYS],
  ).catch(() => undefined);
  return rowToUser(row);
}

export function getBearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
}

/** Returns the signed-in user, or null (never throws). */
export async function requireUser(request: NextRequest | Request): Promise<AuthUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  try { return await verifyToken(token); } catch { return null; }
}

/** Convenience: user id or null (replacement for the old requireFirebaseUid). */
export async function requireUid(request: NextRequest | Request): Promise<string | null> {
  return (await requireUser(request))?.uid ?? null;
}

/* ---------- Register / login ---------- */

export async function registerUser(input: { email: string; password: string; displayName: string }): Promise<AuthUser> {
  const hash = await hashPassword(input.password);
  try {
    const result = await query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, photo_url, role, status,
         access_general_silver, access_general_gold, access_vip_lounge, access_important_vip, created_at`,
      [input.email, hash, input.displayName],
    );
    return rowToUser(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AuthError("auth/email-already-in-use", "An account with this email already exists.");
    throw error;
  }
}

export async function authenticate(email: string, password: string): Promise<AuthUser> {
  const result = await query<UserRow>(
    `SELECT ${USER_COLUMNS}, u.password_hash FROM users u WHERE lower(u.email) = $1`,
    [email],
  );
  const row = result.rows[0];
  const valid = await verifyPassword(password, row?.password_hash ?? await dummyHash());
  if (!row || !valid) throw new AuthError("auth/invalid-credential", "Incorrect email or password.");
  if (row.status === "disabled") throw new AuthError("auth/user-disabled", "This account has been disabled. Please contact an administrator.");
  return rowToUser(row);
}

"use client";

/**
 * Browser-side auth client backed by the PostgreSQL API (/api/auth/*).
 *
 * It intentionally mirrors the small part of the Firebase Auth SDK that this app used
 * (auth.currentUser, onAuthStateChanged, getIdToken, signOut, updateProfile ...), so the
 * rest of the UI keeps working with only its import line changed.
 * The "ID token" is now an opaque session token; every API route still receives it as
 * `Authorization: Bearer <token>` and verifies it against the `sessions` table.
 */

export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};
export type Auth = { readonly currentUser: User | null };

type ServerUser = { uid: string; email: string; displayName: string; photoURL: string | null; role: string };
type Listener = (user: User | null) => void;

const TOKEN_KEY = "edge-terminal-session";
const isBrowser = typeof window !== "undefined";

let token: string | null = null;
let current: User | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;
let lastCheck = 0;
const listeners = new Set<Listener>();

function readStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function storeToken(value: string | null) {
  try { if (value) localStorage.setItem(TOKEN_KEY, value); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

function makeUser(data: ServerUser): User {
  return {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    role: data.role,
    getIdToken: async () => {
      if (!token) throw new Error("Not signed in.");
      return token;
    },
  };
}

function emit() { for (const listener of Array.from(listeners)) listener(current); }

function setSession(nextToken: string | null, user: ServerUser | null) {
  token = nextToken;
  storeToken(nextToken);
  current = user && nextToken ? makeUser(user) : null;
  ready = true;
  emit();
}

async function validate(): Promise<void> {
  token = readStoredToken();
  lastCheck = Date.now();
  if (!token) { current = null; ready = true; emit(); return; }
  try {
    const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { user: ServerUser };
      current = makeUser(data.user);
    } else if (response.status === 401) {
      token = null; storeToken(null); current = null;
    } // Other statuses (server down): keep the token and try again later.
  } catch { /* offline: keep the stored token */ }
  ready = true;
  emit();
}

function init() { return (initPromise ??= validate()); }

if (isBrowser) {
  void init();
  window.addEventListener("storage", (event) => { if (event.key === TOKEN_KEY) void validate(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && token && Date.now() - lastCheck > 60_000) void validate();
  });
}

export const auth: Auth = { get currentUser() { return current; } };
export const isAuthConfigured = true;

export function onAuthStateChanged(_auth: Auth, listener: Listener): () => void {
  listeners.add(listener);
  if (isBrowser) void init().then(() => { if (ready && listeners.has(listener)) listener(current); });
  return () => { listeners.delete(listener); };
}

export async function getIdToken(user: User, forceRefresh = false): Promise<string> {
  return user.getIdToken(forceRefresh);
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { token?: string; user?: ServerUser; error?: string };
  if (!response.ok || !data.token || !data.user) throw new Error(data.error || "Authentication failed. Please try again.");
  setSession(data.token, data.user);
}

export function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  return authRequest("/api/auth/login", { email, password });
}

export function createUserWithEmailAndPassword(_auth: Auth, email: string, password: string, displayName?: string) {
  return authRequest("/api/auth/register", { email, password, displayName });
}

export async function signOut(_auth?: Auth): Promise<void> {
  const previous = token;
  setSession(null, null);
  if (previous) await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${previous}` } }).catch(() => undefined);
}

export async function updateProfile(user: User, profile: { displayName?: string | null; photoURL?: string | null }): Promise<void> {
  const body: Record<string, unknown> = {};
  if (profile.displayName != null) body.displayName = profile.displayName;
  if (profile.photoURL !== undefined) body.photoURL = profile.photoURL;
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { user?: ServerUser; error?: string };
  if (!response.ok || !data.user) throw new Error(data.error || "Could not update your profile.");
  user.displayName = data.user.displayName;
  user.photoURL = data.user.photoURL;
}

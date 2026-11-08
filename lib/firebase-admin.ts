import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

function loadServiceAccount(): ServiceAccount {
  // Preferred for Vercel/production: paste the JSON into a server-only env var.
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64?.trim();
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  try {
    let raw = "";
    if (rawJson) {
      raw = rawJson;
    } else if (rawBase64) {
      raw = Buffer.from(rawBase64, "base64").toString("utf8");
    } else if (credentialsPath) {
      raw = readFileSync(resolve(process.cwd(), credentialsPath), "utf8");
    } else {
      // Convenient local development fallback. This file must never be committed.
      try {
        raw = readFileSync(resolve(process.cwd(), "firebase-service-account.json"), "utf8");
      } catch {
        throw new Error("Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON), FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, or GOOGLE_APPLICATION_CREDENTIALS.");
      }
    }

    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error("Firebase service-account JSON must include project_id, client_email, and private_key.");
    }
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Firebase")) throw error;
    throw new Error("Firebase Admin credentials could not be parsed. Check that the service-account JSON or Base64 value is complete.");
  }
}

export function getAdminServices() {
  const existing = getApps()[0];
  const app = existing || initializeApp({ credential: cert(loadServiceAccount() as Parameters<typeof cert>[0]) });
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) };
}

export function isAllowlistedAdmin(email?: string | null) {
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

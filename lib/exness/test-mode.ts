import type { ExnessCredentials } from "./client";

/** Server-only admin test credentials. Never import this module from client components. */
export function isExnessTestModeEnabled() {
  return process.env.EXNESS_TEST_MODE?.trim().toLowerCase() === "true";
}

export function getExnessTestCredentials(): ExnessCredentials {
  const credentials: ExnessCredentials = {
    apiKey: process.env.EXNESS_TEST_API_KEY?.trim() || process.env.EXN_API_KEY?.trim() || "",
    privateKey: process.env.EXNESS_TEST_PRIVATE_KEY?.trim() || process.env.EXN_PRIVATE_KEY?.trim() || "",
    accountId: process.env.EXNESS_TEST_ACCOUNT_ID?.trim() || process.env.EXN_ACCOUNT_ID?.trim() || "",
    gatewayUrl: process.env.EXNESS_TEST_GATEWAY_URL?.trim() || process.env.EXN_DISCOVERY_BASE_URL?.trim() || "",
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Exness admin test mode is enabled, but these server environment values are missing: ${missing.join(", ")}.`);
  }
  return credentials;
}

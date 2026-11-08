/** Minimal structured security event logger. Never pass tokens, passwords,
 * broker credentials, request bodies, or full URLs as metadata. */
export function logSecurityEvent(
  event: string,
  outcome: "allowed" | "denied" | "error",
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const safeMetadata: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/token|secret|password|credential|authorization|cookie|email|account/i.test(key)) continue;
    if (typeof value === "string") safeMetadata[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safeMetadata[key] = value;
  }
  const record = {
    type: "edge_terminal_security_event",
    event: event.slice(0, 80),
    outcome,
    timestamp: new Date().toISOString(),
    metadata: safeMetadata,
  };
  if (outcome === "error" || outcome === "denied") console.warn(JSON.stringify(record));
  else console.info(JSON.stringify(record));
}

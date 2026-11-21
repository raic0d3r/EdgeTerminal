import { NextRequest, NextResponse } from "next/server";

/** Reject cross-origin browser mutations. Bearer-token authentication remains mandatory separately. */
export function enforceSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // Non-browser clients may omit Origin; auth still applies.
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Cross-origin request rejected." }, {
        status: 403,
        headers: { "Cache-Control": "no-store", "Vary": "Origin" },
      });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}

/** Read bounded JSON bodies and reject wrong content types / malformed JSON. */
export async function readJsonBody<T = Record<string, unknown>>(
  request: NextRequest,
  maxBytes = 16 * 1024,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 }) };
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: "Request body is too large." }, { status: 413 }) };
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return { ok: false, response: NextResponse.json({ error: "Request body is too large." }, { status: 413 }) };
    }
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, response: NextResponse.json({ error: "JSON body must be an object." }, { status: 400 }) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 }) };
  }
}

export function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
}

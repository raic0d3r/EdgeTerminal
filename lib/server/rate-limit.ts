import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])

if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

local ttl = redis.call("TTL", KEYS[1])

return { current, ttl }
`;

function unavailableResponse() {
  return NextResponse.json(
    { error: "Request protection is temporarily unavailable." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function enforceRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (
    !key ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1
  ) {
    console.error("Invalid rate-limit configuration.");
    return unavailableResponse();
  }

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      return unavailableResponse();
    }

    return null;
  }

  try {
    const redisKey = `edge-terminal:rate:${key}`;

	const response = await fetch(
	  url.replace(/\/$/, ""),
	  {
		method: "POST",
		headers: {
		  Authorization: `Bearer ${token}`,
		  "Content-Type": "application/json",
		},
		body: JSON.stringify([
		  "EVAL",
		  RATE_LIMIT_SCRIPT,
		  "1",
		  redisKey,
		  String(windowSeconds),
		]),
		cache: "no-store",
		signal: AbortSignal.timeout(4000),
	  }
	);

    if (!response.ok) {
      throw new Error(`Redis returned HTTP ${response.status}`);
    }

    const data = await response.json() as {
      result?: number[];
      error?: string;
    };

    if (data.error || !Array.isArray(data.result)) {
      throw new Error("Invalid Redis rate-limit response.");
    }

    const count = Number(data.result[0]);
    const ttl = Number(data.result[1]);

    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      !Number.isFinite(ttl)
    ) {
      throw new Error("Invalid Redis counter.");
    }

    if (count > limit) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, ttl)),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return null;

  } catch (error) {
    console.error("Rate limiter unavailable:", error);
    return unavailableResponse();
  }
}

export function getClientIpKey(request: Request): string {
  // Only configure this header if your hosting infrastructure
  // guarantees that clients cannot spoof it.
  const trustedHeader =
    process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();

  const rawIp = trustedHeader
    ? request.headers.get(trustedHeader)?.split(",")[0]?.trim()
    : null;

  if (!rawIp) {
    return "unknown";
  }

  return rawIp
    .replace(/[^a-zA-Z0-9:._-]/g, "")
    .slice(0, 80) || "unknown";
}

export async function enforceIpRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number
) {
  return enforceRateLimit({
    key: `ip:${getClientIpKey(request)}:${scope}`,
    limit,
    windowSeconds,
  });
}
import { NextRequest, NextResponse } from "next/server";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
import {
  CTRADER_STATE_COOKIE,
  clearCTraderCookies,
  getCTraderConfig,
  consumeOAuthTransaction,
  saveCTraderSession,
  type CTraderTokenSession,
} from "@/lib/ctrader/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "ctrader-callback", 10, 600);
  if (limited) return limited;
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(CTRADER_STATE_COOKIE)?.value;
  const providerError = request.nextUrl.searchParams.get("error_description") || request.nextUrl.searchParams.get("error");

  if (providerError) {
    const response = NextResponse.redirect(new URL(`/?ctrader=error&reason=${encodeURIComponent(providerError.slice(0, 180))}`, request.url));
    clearCTraderCookies(response);
    return response;
  }
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    const response = NextResponse.redirect(new URL("/?ctrader=error&reason=oauth_state_or_code_invalid", request.url));
    clearCTraderCookies(response);
    return response;
  }

  try {
    const uid = await consumeOAuthTransaction(returnedState);
    if (!uid) throw new Error("OAuth transaction expired or already used. Please reconnect.");
    const { clientId, clientSecret, redirectUri } = getCTraderConfig();
    const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
    tokenUrl.searchParams.set("grant_type", "authorization_code");
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);

    const tokenResponse = await fetch(tokenUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const tokenJson = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenJson?.accessToken || !tokenJson?.refreshToken) {
      const reason = String(tokenJson?.description || tokenJson?.errorCode || `token_exchange_http_${tokenResponse.status}`).slice(0, 180);
      const response = NextResponse.redirect(new URL(`/?ctrader=error&reason=${encodeURIComponent(reason)}`, request.url));
      clearCTraderCookies(response);
      return response;
    }

    const session: CTraderTokenSession = {
      accessToken: String(tokenJson.accessToken),
      refreshToken: String(tokenJson.refreshToken),
      expiresAt: Date.now() + Number(tokenJson.expiresIn || 2628000) * 1000,
    };
    await saveCTraderSession(uid, session);
    const response = NextResponse.redirect(new URL("/?ctrader=connected", request.url));
    response.cookies.set(CTRADER_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/ctrader",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "token_exchange_failed";
    const response = NextResponse.redirect(new URL(`/?ctrader=error&reason=${encodeURIComponent(reason.slice(0, 180))}`, request.url));
    clearCTraderCookies(response);
    return response;
  }
}

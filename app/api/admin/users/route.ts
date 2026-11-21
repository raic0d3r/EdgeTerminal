import { NextRequest, NextResponse } from "next/server";
import { isAllowlistedAdmin, requireUser, type Role } from "@/lib/server/auth";
import { enforceIpRateLimit } from "@/lib/server/rate-limit";
import { UUID_RE, getUserById, listUsers, updateUserAdmin } from "@/lib/server/store";

export const runtime = "nodejs";

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireAdmin(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return { actor: null, failure: jsonError("Missing or expired sign-in session. Sign out and sign in again.", 401, "MISSING_TOKEN") };
  if (!isAllowlistedAdmin(user.email)) {
    return { actor: null, failure: jsonError("This signed-in email is not listed in the server-side ADMIN_EMAILS variable.", 403, "ADMIN_EMAIL_NOT_ALLOWLISTED") };
  }
  return { actor: user, failure: null };
}

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-users-read", 30, 60);
  if (limited) return limited;
  const access = await requireAdmin(request);
  if (access.failure) return access.failure;
  try {
    const users = (await listUsers(1000)).map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0] || "Member",
      role: user.role,
      status: user.status,
      disabled: user.status === "disabled",
      createdAt: user.createdAt,
      access: user.access,
    }));
    return NextResponse.json({ users, nextPageToken: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin user list failed:", error);
    return jsonError("Could not load users from the database.", 500, "USER_LIST_FAILED");
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, "admin-users-write", 15, 60);
  if (limited) return limited;
  const access = await requireAdmin(request);
  if (access.failure) return access.failure;
  const actor = access.actor!;
  try {
    const body = await request.json();
    const uid = String(body.uid || "");
    if (!uid || uid === actor.uid || !UUID_RE.test(uid)) return jsonError("A valid target user is required. You cannot change your own access here.", 400, "INVALID_TARGET_USER");
    const target = await getUserById(uid);
    if (!target) return jsonError("User not found.", 404, "USER_NOT_FOUND");

    const patch: { role?: Role; status?: "active" | "disabled"; access?: Partial<typeof target.access> } = {};
    if (body.role !== undefined) {
      if (!["member", "vip", "admin"].includes(body.role)) return jsonError("Role must be member, vip, or admin.", 400, "INVALID_ROLE");
      if (body.role === "admin") return jsonError("Admin promotion must be performed by a trusted operator.", 403, "ADMIN_PROMOTION_BLOCKED");
      patch.role = body.role;
    }
    if (body.status !== undefined) {
      if (!["active", "disabled"].includes(body.status)) return jsonError("Invalid account status.", 400, "INVALID_STATUS");
      patch.status = body.status;
    }
    if (body.access !== undefined) {
      const p = body.access || {};
      patch.access = {};
      for (const key of ["generalSilver", "generalGold", "vipLounge", "importantVip"] as const) {
        if (typeof p[key] === "boolean") patch.access[key] = p[key];
      }
    }
    await updateUserAdmin(uid, actor.uid, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin user update failed:", error);
    return jsonError("Could not update this account.", 500, "USER_UPDATE_FAILED");
  }
}

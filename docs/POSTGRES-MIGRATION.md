# Firebase → PostgreSQL migration (EdgeTerminal)

Firebase Auth, Firestore, Firebase Cloud Messaging and the local SQLite chat/support tables were replaced by **one PostgreSQL database** plus a small built-in auth system.

| Was | Now |
|---|---|
| Firebase Auth (email + password) | `users` + `sessions` tables, `/api/auth/*` routes, scrypt password hashes |
| Firestore `users/{uid}` profile, roles, VIP flags | columns on `users` |
| Firestore `platformSettings`, `featureSuggestions`, broker/push/cTrader collections | `platform_settings`, `feature_suggestions`, `broker_connections`, `push_subscriptions`, `price_alerts`, `ctrader_*` |
| SQLite chat + support messages | `chat_messages`, `support_messages` |
| Firebase Cloud Messaging push | standard Web Push (VAPID) via `web-push` |
| Upstash Redis rate limit (required in production) | optional; falls back to the `rate_limits` table |

The browser keeps sending `Authorization: Bearer <token>`; the token is now an opaque session token (only its SHA-256 hash is stored, 30-day sliding expiry, revoked on sign-out, on password reset and when an admin disables the account).

## 1. Create the database (on the VPS)

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE edge_user WITH LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE edge_terminal OWNER edge_user;
SQL

cd /path/to/project
export DATABASE_URL='postgresql://edge_user:CHANGE_ME_STRONG@127.0.0.1:5432/edge_terminal'
psql "$DATABASE_URL" -f db/schema.sql        # safe to re-run
```
(URL-encode special characters in the password, e.g. `@` → `%40`.)

## 2. Configure and build

```bash
cp .env.example .env.local     # fill DATABASE_URL, ADMIN_EMAILS, existing secrets
npm install                    # NOT `npm ci` - package-lock.json must be regenerated once
npm run build
node --env-file=.env.local scripts/db/user-admin.mjs create you@example.com "Your Name"
npm start                      # or run it with systemd / pm2
```
Node 24.x is required (`engines` in package.json, `.nvmrc`).

## 3. nginx (important for rate limiting and the same-origin check)

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;          # overwrites anything the client sent
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
and keep `TRUSTED_CLIENT_IP_HEADER=x-real-ip` in `.env.local`. Without it every visitor shares one IP rate-limit bucket.

## 4. What does NOT carry over automatically

* **Existing Firebase accounts.** Firebase password hashes are not copied. Create the accounts again (self-registration, or `user-admin.mjs create`), or tell users to re-register.
  Admin panel rights still come from `ADMIN_EMAILS`.
* **Firestore data** (feature-access rules, chart-display mode, suggestions) - re-enter the two settings in the admin panel.
* **Old SQLite chat/support history** in `data/edge-terminal.sqlite` stays in that file (messages were keyed by Firebase UIDs that no longer exist).
  `lib/orderflow/storage.ts` still uses SQLite for order-flow ticks; that is unrelated to users and unchanged.
* **Private notes** are stored in each browser's localStorage under the user id, so they will not show up under the new ids.
* **Device push subscriptions** must be re-enabled once per device (FCM tokens are not valid for Web Push). Set `VAPID_*` first.

## 5. Behaviour changes to know about

* Minimum password length is now 8 (was 6).
* There is no "forgot password" e-mail flow (there was none in the UI before either). Reset with `scripts/db/user-admin.mjs set-password <email>`.
* Login is throttled per IP and per e-mail address.

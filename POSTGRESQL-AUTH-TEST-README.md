# EdgeTerminal PostgreSQL authentication test

This build replaces the login/register gate with PostgreSQL accounts, scrypt password hashes,
and HttpOnly database-backed sessions. `ADMIN_EMAILS` is server-only; the listed address gets
the admin role when registering.

## Apply migration
Upload `database/auth-test-migration.sql` to `/home/ubuntu/edgeterminal-db/`, then run:
```bash
sudo docker exec -i edgeterminal-postgres psql -U edgeterminal_user -d edgeterminal_db < /home/ubuntu/edgeterminal-db/auth-test-migration.sql
```

## Test deployment (do not replace live)
Build and run this ZIP as a separate test container on a private Docker network shared with
`edgeterminal-postgres`. Set server env vars:
- `DATABASE_URL=postgresql://edgeterminal_user:YOUR_PRIVATE_PASSWORD@edgeterminal-postgres:5432/edgeterminal_db`
- `ADMIN_EMAILS=r41.forex.trader@gmail.com`
- `NODE_ENV=production`

Do not expose PostgreSQL port 5432. Do not change the live Nginx upstream. Use a separate
test port/hostname and test with a new non-admin email first.

## Test
Register, verify the row in `app_users`, log out, log in again, and verify `user_sessions`.
Use `SELECT id,email,display_name,role,is_active FROM app_users ORDER BY created_at DESC LIMIT 10;`
and `SELECT user_id,expires_at FROM user_sessions ORDER BY created_at DESC LIMIT 10;`.

## Scope warning
This is only an authentication test build. Other dashboard components and API routes still
depend on Firebase (broker sessions, chat, admin tools, feature access, push, etc.). A successful
login/register test does not mean the whole app is Firebase-free. The old Firebase users are
not imported; the first admin must register again using the allowlisted email.

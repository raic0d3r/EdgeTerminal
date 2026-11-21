# EdgeTerminal PostgreSQL migration — Version 1

This is the **database foundation only**, not yet a Firebase-free application release.
The existing app continues to use its current Firebase and SQLite code paths. Do not remove Firebase credentials or deploy an app build expecting PostgreSQL until a later migration version replaces those callers.

## What's included
- PostgreSQL 16 standalone Portainer Compose file (`compose.postgres.yaml`).
- Initial relational schema for accounts, sessions, entitlements, chat, support, suggestions, push subscriptions, trading connections, preferences, and order-flow records.
- Dedicated persistent Docker volume `edgeterminal_postgres_data`.
- PostgreSQL is not published on a host port; it is intentionally private.

## Deploy database foundation
1. Keep the currently running `edgeterminal` stack unchanged.
2. In Portainer, create a separate stack named `edgeterminal-db` using this repository/archive's `compose.postgres.yaml` as the Compose file (or upload the file contents in Web editor).
3. Set `POSTGRES_DB=edgeterminal_db`, `POSTGRES_USER=edgeterminal_user`, and a long random `POSTGRES_PASSWORD` in Portainer stack environment variables. Do not commit the password.
4. Deploy and confirm the container is healthy.

## Important migration notes
- The schema is an initial target schema. Existing Firebase user IDs are not assumed to be UUIDs; a later migration layer must map legacy identifiers safely or, per the agreed fresh start, create new UUID users.
- `credentials_ciphertext`, `credentials_iv`, and `credentials_tag` are intended for application-side authenticated encryption. Never store broker credentials as plaintext.
- PostgreSQL's init scripts run only when the data volume is first initialized. Changes later require explicit versioned migrations.
- ElivaMart will use its own database and DB role in a later step; do not point it at this database.
- This version does not yet replace Firebase API routes, client auth, push delivery, or SQLite access. Those are subsequent versions and must be completed before calling the app fully migrated.

-- EdgeTerminal PostgreSQL schema (replaces Firebase Auth + Firestore + local SQLite chat/support tables).
-- Run once:  psql "$DATABASE_URL" -f db/schema.sql      (safe to re-run)
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in; no extensions needed).

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  password_hash         text NOT NULL,
  display_name          text NOT NULL,
  photo_url             text,
  role                  text NOT NULL DEFAULT 'member' CHECK (role IN ('member','vip','admin')),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  access_general_silver boolean NOT NULL DEFAULT true,
  access_general_gold   boolean NOT NULL DEFAULT true,
  access_vip_lounge     boolean NOT NULL DEFAULT false,
  access_important_vip  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- Opaque, revocable session tokens (only a SHA-256 hash is stored).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- Was Firestore platformSettings/{featureAccess|chartDisplay}
CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Was Firestore featureSuggestions
CREATE TABLE IF NOT EXISTS feature_suggestions (
  id          serial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  author      text NOT NULL,
  title       text NOT NULL CHECK (char_length(title) <= 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feature_suggestions_created_idx ON feature_suggestions (created_at DESC);

-- Was Firestore users/{uid}/brokerConnections/exness
CREATE TABLE IF NOT EXISTS broker_connections (
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  encrypted_credentials text NOT NULL,
  account_id            text,
  access_point          text,
  account_summary       jsonb,
  connected             boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

-- Was Firestore users/{uid}/pushSubscriptions (now standard Web Push subscriptions)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_id text NOT NULL,
  subscription jsonb NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint_id)
);

-- Was Firestore users/{uid}/priceAlerts
CREATE TABLE IF NOT EXISTS price_alerts (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset      text NOT NULL,
  config     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset)
);

-- Was Firestore ctraderOAuthStates / ctraderSessions
CREATE TABLE IF NOT EXISTS ctrader_oauth_states (
  state_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ctrader_sessions (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_session text NOT NULL,
  expires_at        bigint NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Was SQLite chat_messages / support_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id         serial PRIMARY KEY,
  group_key  text NOT NULL,
  author     text NOT NULL,
  body       text NOT NULL CHECK (char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_group_idx ON chat_messages (group_key, id);

CREATE TABLE IF NOT EXISTS support_messages (
  id          serial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('user','admin')),
  body        text NOT NULL CHECK (char_length(body) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_user_idx ON support_messages (user_id, id);

-- Welcome messages (only inserted into empty rooms)
INSERT INTO chat_messages (group_key, author, body)
SELECT v.g, v.a, v.b FROM (VALUES
  ('general-silver','Edge Moderator','Welcome to General Silver! Use this room to discuss silver market structure, levels, and learning resources.'),
  ('general-silver','Edge Moderator','Please share your reasoning and remember that market discussion is educational, not a guaranteed signal.'),
  ('general-gold','Edge Moderator','Welcome to General Gold! Keep gold-market discussion constructive and include context when sharing a chart or idea.')
) AS v(g,a,b)
WHERE NOT EXISTS (SELECT 1 FROM chat_messages c WHERE c.group_key = v.g);

COMMIT;

-- Rate limiting without Redis (used automatically when UPSTASH_* variables are not set)
CREATE TABLE IF NOT EXISTS rate_limits (
  key      text PRIMARY KEY,
  count    integer NOT NULL,
  reset_at timestamptz NOT NULL
);

-- API keys for systems (not people) that call our API, e.g. Team 11.
-- We store only a SHA-256 hash of each key, never the key itself.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name varchar NOT NULL,                          -- who the key is for, e.g. 'Team 11 sync service'
  key_prefix varchar(16) NOT NULL,                -- first characters, safe to show (lfk_live_AbCdEfG)
  key_hash char(64) NOT NULL UNIQUE,              -- sha256(full key) in hex
  scopes text[] NOT NULL DEFAULT ARRAY['items:read']::text[],
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                         -- NULL = never expires
  revoked_at timestamptz,                         -- NULL = active
  last_used_at timestamptz,
  usage_count bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix);

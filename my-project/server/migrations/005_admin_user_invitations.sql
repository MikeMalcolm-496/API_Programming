CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name varchar NOT NULL,
  email varchar NOT NULL,
  role varchar NOT NULL CHECK (role IN ('student', 'security', 'admin')),
  student_id varchar,
  strathbites_user_id integer,
  token_hash char(64) NOT NULL UNIQUE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_email_idx
  ON user_invitations (lower(email)) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS user_invitation_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'email_failed', 'emailed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invitation_id uuid REFERENCES user_invitations(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitation_requests_open_email_idx
  ON user_invitation_requests (lower(email)) WHERE status IN ('pending', 'email_failed');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

DROP TABLE IF EXISTS user_invitation_requests;
DROP TABLE IF EXISTS user_invitations;

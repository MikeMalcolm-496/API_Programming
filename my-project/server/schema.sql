CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name varchar NOT NULL,
  email varchar NOT NULL UNIQUE,
  hashed_password varchar NOT NULL,
  role varchar NOT NULL DEFAULT 'student',
  student_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS found_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  posted_by_user_id uuid NOT NULL REFERENCES users(id),
  title varchar NOT NULL,
  description varchar NOT NULL,
  category varchar NOT NULL,
  location_found varchar NOT NULL,
  date_found date NOT NULL,
  status varchar NOT NULL DEFAULT 'unclaimed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flagged_checks (
  check_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  found_item_id uuid NOT NULL REFERENCES found_items(id),
  inventory_item_id varchar NOT NULL,
  checked_by varchar NOT NULL,
  outcome varchar NOT NULL CHECK (outcome IN ('match', 'no_match', 'needs_review')),
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS found_item_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  found_item_id uuid NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  storage_key varchar NOT NULL,
  url varchar NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  found_item_id uuid NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  claimant_user_id uuid NOT NULL REFERENCES users(id),
  status varchar NOT NULL DEFAULT 'pending',
  claim_description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inquiry_messages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS found_items_category_idx ON found_items(category);
CREATE INDEX IF NOT EXISTS found_items_status_idx ON found_items(status);
CREATE INDEX IF NOT EXISTS found_items_updated_at_idx ON found_items(updated_at);
CREATE INDEX IF NOT EXISTS inquiries_found_item_id_idx ON inquiries(found_item_id);
CREATE INDEX IF NOT EXISTS inquiry_messages_inquiry_id_idx ON inquiry_messages(inquiry_id);

-- Strathbites integration: the claimant's user ID in the Strathbites system.
ALTER TABLE users ADD COLUMN IF NOT EXISTS strathbites_user_id integer;

-- API keys (see migrations/003_api_keys.sql)
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name varchar NOT NULL,
  key_prefix varchar(16) NOT NULL,
  key_hash char(64) NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['items:read']::text[],
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  usage_count bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix);

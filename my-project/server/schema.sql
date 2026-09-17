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

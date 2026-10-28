ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id);

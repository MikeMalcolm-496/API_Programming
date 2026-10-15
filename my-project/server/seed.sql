-- Run once in the Supabase SQL editor so the API (and the tests) have data to find.
WITH u AS (
  INSERT INTO users (full_name, email, hashed_password, role)
  VALUES ('Seed Admin', 'seed.admin@example.com', 'not-a-real-hash', 'admin')
  ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
  RETURNING id
)
INSERT INTO found_items (posted_by_user_id, title, description, category, location_found, date_found, status)
SELECT u.id, v.title, v.description, v.category, v.location_found, v.date_found::date, v.status
FROM u, (VALUES
  ('Umbrella',   'Black umbrella with wooden handle', 'personal-items', 'Library, 2nd Floor Front Desk', '2026-08-13', 'unclaimed'),
  ('Earphones',  'Silver wired earphones',            'electronics',    'Cafeteria Lost & Found Box',    '2026-08-11', 'claimed'),
  ('Student ID', 'Strathmore student ID card',        'documents',      'Admin Block Reception',         '2026-08-12', 'pending-verification'),
  ('Keys',       'Car key with blue keychain',        'keys',           'Parking Lot B',                 '2026-08-10', 'unclaimed')
) AS v(title, description, category, location_found, date_found, status);

-- Links a Lost & Found account to the person's Strathbites user ID, so a claim
-- can be checked against that person's cafeteria orders.
-- Safe to run more than once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS strathbites_user_id integer;

-- Seed students (from the seed data) get Strathbites IDs so the demo works.
-- Strathbites user 3 is the one in their examples; change these if they give you others.
UPDATE users SET strathbites_user_id = 3 WHERE email = 'brian.kioko@strathmore.edu';
UPDATE users SET strathbites_user_id = 1 WHERE email = 'wanjiru.moraa@strathmore.edu';
UPDATE users SET strathbites_user_id = 2 WHERE email = 'kevin.langat@strathmore.edu';

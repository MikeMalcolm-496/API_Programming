# Seed Data (admins, security staff, 15 found items)

## What this zip gives you

| File | What it is |
|---|---|
| `my-project/server/data/users.json` | 2 admins, 5 security staff and 3 students, with names, emails, passwords and school ID numbers |
| `my-project/server/data/found-items.json` | 15 found items, each with title, category, exact location, date found, status, who logged it and a full description (colour, brand, marks, contents, where it is stored) |
| `my-project/server/data/inquiries.json` | 3 sample claims (2 pending, 1 approved) with messages, so the staff dashboard is not empty |
| `my-project/server/data/ACCOUNTS.md` | Demo logins for the seed accounts. |
| `my-project/server/data/seed_data.sql` | The same data as plain SQL, for pasting into the Supabase SQL editor |
| `my-project/server/scripts/seed-data.js` | Node script that loads the JSON into the database (hashes the passwords with bcrypt) |
| `my-project/server/package.json` | Adds `seed`, `seed:reset`, `seed:sql` scripts and `jest` + `supertest` as dev dependencies so `npm test` runs from the server folder |
| `my-project/server/.env.example` | The variables this zip needs |

The seed data goes into the existing tables (`users`, `found_items`, `inquiries`, `inquiry_messages`). Applying the current schema also creates the admin invitation table.

## Creating new accounts

Public self-registration and the shared staff sign-up code have been disabled. Seed accounts are loaded by the database seeder; all subsequent accounts must be invited by an existing administrator from the dashboard. Invitation links are single-use, expire after 24 hours, and must be shared privately.

## The accounts

| Role | Email | Password | School ID |
|---|---|---|---|
| admin | grace.njoroge@strathmore.edu | Admin@LF2026 | ADM-0001 |
| admin | daniel.ouma@strathmore.edu | Admin@LF2026 | ADM-0002 |
| security | peter.mwangi@strathmore.edu | Security@LF2026 | SEC-1001 |
| security | faith.odhiambo@strathmore.edu | Security@LF2026 | SEC-1002 |
| security | joseph.rotich@strathmore.edu | Security@LF2026 | SEC-1003 |
| security | mercy.kariuki@strathmore.edu | Security@LF2026 | SEC-1004 |
| security | hassan.mohamed@strathmore.edu | Security@LF2026 | SEC-1005 |
| student | brian.kioko@strathmore.edu | Student@LF2026 | 182341 |
| student | wanjiru.moraa@strathmore.edu | Student@LF2026 | 190877 |
| student | kevin.langat@strathmore.edu | Student@LF2026 | 201455 |

The School ID goes into the existing `users.student_id` column (staff number for staff, admission number for students).

## The 15 items

| # | Item | Category | Location | Date | Status |
|---|---|---|---|---|---|
| 1 | Samsung Galaxy A54 phone | electronics | cafe-3 (Student Centre Cafeteria) | 2026-10-20 | pending-verification |
| 2 | HP EliteBook laptop charger | electronics | Library, 2nd Floor Front Desk | 2026-10-18 | unclaimed |
| 3 | Strathmore student ID card | documents | cafe-1 (Main Cafeteria) | 2026-10-21 | pending-verification |
| 4 | Black JanSport backpack | personal-items | Sports Complex changing rooms | 2026-10-15 | unclaimed |
| 5 | Toyota car key, blue keychain | keys | Parking Lot B | 2026-10-12 | unclaimed |
| 6 | Navy Strathmore hoodie | clothing | Auditorium, row F | 2026-10-09 | unclaimed |
| 7 | AirPods Pro case | electronics | cafe-2 (Business School Cafe) | 2026-10-19 | unclaimed |
| 8 | Brown leather wallet | personal-items | STMB 3rd Floor washrooms | 2026-10-17 | claimed |
| 9 | Casio fx-991EX calculator | electronics | Library, Ground Floor room 3 | 2026-10-14 | unclaimed |
| 10 | Prescription glasses, red case | personal-items | cafe-3 outdoor seating | 2026-10-22 | unclaimed |
| 11 | National ID card | documents | Admin Block Reception | 2026-10-11 | claimed |
| 12 | Silver Hydro Flask | other | Sports Complex basketball court | 2026-10-16 | unclaimed |
| 13 | Three keys on red ring | keys | Phase 1 Lecture Room 12 | 2026-10-13 | unclaimed |
| 14 | Beige trench coat | clothing | cafe-1 coat hooks | 2026-10-10 | unclaimed |
| 15 | Kindle Paperwhite | electronics | Library, 3rd Floor quiet zone | 2026-10-21 | unclaimed |

Why some locations start with `cafe-1`, `cafe-2`, `cafe-3`: those are the location IDs Strathbites uses. An item found at a cafeteria can then be checked against the claimant's Strathbites orders (that is Zip 2).

Categories and statuses only use the values your `openapi.yaml` allows, so the Team 11 contract tests still pass. Items have fixed IDs (`c0000000-0000-4000-8000-0000000000NN`) so you can paste them into Postman or a URL and they stay the same every time you reseed.

## How to install it

1. Unzip into the root of your project (the folder that contains `frontend/` and `my-project/`). Say **yes** to replacing `package.json`. The folders line up, so the files land in `my-project/server/data/` and `my-project/server/scripts/`.
   - If your `package.json` has changed since you sent me the project, do not replace it; just add these lines inside `"scripts"`:
     ```json
     "seed": "node scripts/seed-data.js",
     "seed:reset": "node scripts/seed-data.js --reset",
     "seed:sql": "node scripts/seed-data.js --sql"
     ```
2. In `my-project/server/.env`, make sure `DATABASE_URL` and `JWT_SECRET` are configured. `STAFF_SIGNUP_CODE` is no longer used.
3. Install dependencies:
   ```powershell
   cd my-project/server
   npm install
   ```
4. Load the data. Pick **one** way:

   **A. From the command line (recommended)**
   ```powershell
   npm run seed
   ```
   **B. From Supabase**: open the SQL editor, paste the contents of `data/seed_data.sql`, run it.

   **C. With psql**
   ```powershell
   psql "$env:DATABASE_URL" -f data/seed_data.sql
   ```

## Intended outcome

Running `npm run seed` prints a table of all 10 accounts and ends with:

```
Items seeded: 15. Claims seeded: 3.
Totals now in the database: { admins: '2', security: '5', students: '3', items: '15', claims: '3' }
```

(The totals include any rows you already had, so your numbers may be higher.)

Then check it works:

```powershell
npm start
curl.exe http://localhost:5000/found-items
curl.exe "http://localhost:5000/found-items?category=electronics"
curl.exe -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{\"email\":\"peter.mwangi@strathmore.edu\",\"password\":\"Security@LF2026\"}'
```

- `/found-items` returns 15 items (plus any you had before).
- `?category=electronics` returns 5.
- The login returns `{"token":"eyJ...","user":{"role":"security",...}}`.
- In the browser, log in on `login.html` as `peter.mwangi@strathmore.edu`. The dashboard shows the items Peter logged and the claim queue with Brian's and Wanjiru's pending claims.

## Other commands

| Command | What it does |
|---|---|
| `npm run seed` | Insert or update the seed data. Safe to run as often as you like; it never creates duplicates. |
| `npm run seed:reset` | Delete only the seed rows (by their fixed IDs and emails). Your real data is not touched. |
| `npm run seed:sql` | Rebuild `seed_data.sql` after you edit the JSON files. |

To change or add items, edit `data/found-items.json` and run `npm run seed` again. The script checks categories, statuses and that `postedBy` is a staff email before it writes anything.

## Why it was done this way

- **JSON files** so the data is easy to read, show to the lecturer and edit without touching SQL.
- **Passwords hashed by the script** with the same `bcryptjs` your login uses, so the seed accounts log in exactly like real ones. The plain passwords only exist in the JSON and credentials file.
- **Upserts (`ON CONFLICT ... DO UPDATE`)** so running it twice does not fail or duplicate.
- **A SQL version too**, because on Supabase it is often quicker to paste SQL than to run Node against the remote database.

## Note on your current .env files

`Lost_Found_System-main/.env` in the zip you sent contains your real Supabase database password and the `service_role` key. Your `.gitignore` excludes `.env`, which is good, but the file was inside the zip. If that zip has been shared with anyone, reset the database password and rotate the service key in the Supabase dashboard.

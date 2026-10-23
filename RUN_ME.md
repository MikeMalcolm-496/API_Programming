# Run order (PowerShell, from this folder)

1. **.env** in `my-project/server/` (compare with `.env.example`). Keep ONE `DATABASE_URL` line (the real Supabase one),
   set `STAFF_SIGNUP_CODE=STRATH-LF-STAFF-2026`, set `PARTNER_URL` to Strathbites' current tunnel (ending `/api`),
   and `PARTNER_API_KEY` to the key they issued you.
2. **Install:** `cd my-project/server` then `npm install`
3. **Tables:** run `schema.sql`, then `migrations/002_strathbites_link.sql`, then `migrations/003_api_keys.sql`
   in the Supabase SQL editor (all are safe to re-run).
4. **Load the data:** `npm run seed`  (or paste `data/seed_data.sql` into the Supabase SQL editor)
   Logins and the staff code are listed in `data/ACCOUNTS.md`.
5. **Start the API:** `npm start`  (it must print "Server running on port 5000" and stay open)
6. **Check locally:** `curl.exe -i http://localhost:5000/health`  then  `curl.exe http://localhost:5000/found-items`
7. **Only now start the tunnel (second terminal):** `cloudflared tunnel --url http://localhost:5000`
8. **Give Team 11 a key:** `npm run apikey -- create --name "Team 11 sync service"` (shown once, send privately)
9. **Strathbites check:** `npm run strathbites -- 3 cafe-3 --date 2026-10-20`
10. **Tests (need the database):** `npm test`

Other commands: `npm run seed:reset` removes only the seeded rows, `npm run seed:sql` rebuilds `seed_data.sql`.

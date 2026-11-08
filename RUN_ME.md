# Run order (PowerShell, from this folder)

1. **.env** in `my-project/server/` (compare with `.env.example`). Keep ONE `DATABASE_URL` line (the real Supabase one),
   set `PARTNER_URL` to Strathbites' current tunnel (ending `/api`),
   and `PARTNER_API_KEY` to the key they issued you.
2. **Install:** `cd my-project/server` then `npm install`
3. **Tables:** run `schema.sql`, then migrations `002_strathbites_link.sql` through `007_admin_created_accounts.sql`
   in the Supabase SQL editor (all are safe to re-run).
4. **Load the data:** `npm run seed`  (or paste `data/seed_data.sql` into the Supabase SQL editor)
   Seed logins are listed in `data/ACCOUNTS.md`. For a fresh installation without a seeded admin, bootstrap the first admin with `node scripts/create-first-admin.js` from the server directory. Existing admins create later accounts from the dashboard and give each user's temporary password to them in person; users must change it when they first log in.
5. **Start the API:** `npm start`  (it should print "Server running on http://localhost:5000" and stay open)
6. **Create an API key for the local checks:** `npm run apikey -- create --name "Demo and Team 11 sync service"`. Copy the key from the terminal output and keep it private; it is shown only once. In the same PowerShell window, set it for the next commands: `$env:DEMO_API_KEY = '<paste the key here>'`.
7. **Check locally:** `curl.exe -i -H "X-API-Key: $env:DEMO_API_KEY" http://localhost:5000/health` then `curl.exe -H "X-API-Key: $env:DEMO_API_KEY" http://localhost:5000/found-items`. Both should return 200 when the database and schema are ready.
8. **Tests (need the database):** `npm test`
9. **Only now start the tunnel (second terminal):** `cloudflared tunnel --url http://localhost:5000`
10. **Give Team 11 the key privately:** use the key created in step 6; do not paste it into source files, chat, or a public channel.
11. **Strathbites check:** `npm run strathbites -- 3 cafe-3 --date 2026-10-20`

Other commands: `npm run seed:reset` removes only the seeded rows, `npm run seed:sql` rebuilds `seed_data.sql`.

## Local Strathbites demo

To run the application against the bundled mock partner API instead of the live partner:

1. Make sure your local database is configured and the schema, migrations, and seed data are loaded.
2. From `my-project/server`, run `npm run demo`.
3. Open `http://localhost:5000` and sign in with a seeded staff account.
4. Verify the seeded Brian claim: user `3`, cafeteria `cafe-3`, date `2026-10-20`. The mock API has a matching order.

The demo launcher starts both servers on localhost and overrides `PARTNER_URL` for that process only. It does not change `.env`, use the configured partner API key, or send requests to Strathbites. Press Ctrl+C to stop both servers. To use different ports, set `PORT` and/or `STRATHBITES_STUB_PORT` before running the command.

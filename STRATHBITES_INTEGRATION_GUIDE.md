# Zip 2: Consuming the Strathbites API (claim verification)

**Apply Zip 1 first** (the seed claims and students are used here).

## The goal

When a student claims an item that was found at a cafeteria, security staff need evidence that the claimant was really there. Strathbites knows who ordered food where and when. So our server asks Strathbites three questions about the claimant and turns the answers into a verdict:

| Strathbites endpoint (from their `openapi.yaml`) | What we learn |
|---|---|
| `GET /api/users/{id}/order-frequency?locationId=cafe-3` | How many times they ordered at that cafeteria, whether they are a first-time visitor, their last order there |
| `GET /api/orders?userId={id}&fields=timestamp` | When each of their orders happened |
| `GET /api/orders?userId={id}&fields=location` | Where each of their orders happened |

Their `fields` parameter only accepts **one** value per request, so we call `timestamp` and `location` separately and join the two lists by order `id`. That gives "order 10291 was at cafe-3 at 12:41 on 20 Oct", which we compare with **the day the item was found**.

Verdict rules (`lib/strathbites.js`, easy to explain):

| Situation | Credibility |
|---|---|
| Ordered at that cafeteria on the day the item was found | **high** |
| 5+ orders there (no date given) | **high** |
| 5+ orders there but not on that day | **medium** |
| 1 to 4 orders there | **medium** |
| Never ordered there | **low** |

Every result also has a `reasons` list in plain English, so staff can see *why*.

## Where we call their API in the code (show the lecturer this)

**One file does every call:** `my-project/server/lib/strathbites.js`

- `callStrathbites(path)` is the **only** function that sends an HTTP request to Strathbites. It builds `PARTNER_URL + path`, adds `X-API-Key` if `PARTNER_API_KEY` is set, applies an 8 second timeout and logs the call.
- `getOrderFrequency()` and `getOrders()` map one to one to their three endpoints.
- `verifyClaimant()` calls all three in parallel (`Promise.all`), checks the responses match their contract, joins them and scores the claim.

Who uses it:

| Caller | File | Route / command |
|---|---|---|
| Manual check | `routes/claimVerification.js` | `GET /claims/verify?userId=3&locationId=cafe-3&lostDate=2026-10-20` |
| Real claim check (new) | `routes/claimVerification.js` | `GET /inquiries/{inquiryId}/verify` (security/admin login needed) |
| Command line tool (new) | `scripts/strathbites-cli.js` | `npm run strathbites -- 3 cafe-3 --date 2026-10-20` |
| Item page (staff) | `frontend/js/strathbites.js` | calls our two routes above, never Strathbites directly |
| Standalone page | `verify.html` | `http://localhost:5000/verify` |

The browser never talks to Strathbites. It calls our server, and our server calls Strathbites. That keeps the partner URL and any partner key off the user's machine, avoids CORS problems with their tunnel, and lets us validate their data before anyone sees it.

## Showing the calls: "the console way" and "the other way"

### 1. Console way (terminal)

**a) Server log.** Start the server and do any check. Every Strathbites request and response is printed:

```
[Strathbites] -> GET https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/users/3/order-frequency?locationId=cafe-3
[Strathbites] -> GET https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/orders?userId=3&fields=timestamp
[Strathbites] -> GET https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/orders?userId=3&fields=location
[Strathbites] <- 200 OK in 184 ms (orderCount: 5)
[Strathbites] <- 200 OK in 151 ms (orders: 7)
[Strathbites] <- 200 OK in 149 ms (orders: 7)
```

If their tunnel is down you see the reason instead: `[Strathbites] x  GET ... failed: ENOTFOUND` (wrong or dead URL), `ECONNREFUSED` (nothing listening) or `timeout after 8000 ms`.

**b) The CLI tool.** Calls Strathbites directly through the same `lib/strathbites.js` code, prints all three raw responses, then the verdict:

```powershell
cd my-project/server
npm run strathbites -- 3 cafe-3 --date 2026-10-20
```

Expected output (numbers are whatever Strathbites really returns):

```
Partner base URL: https://designer-cadillac-curriculum-meetup.trycloudflare.com/api

=== 1. GET /users/{id}/order-frequency ===================================
[Strathbites] -> GET https://.../api/users/3/order-frequency?locationId=cafe-3
[Strathbites] <- 200 OK in 66 ms (orderCount: 5)
HTTP 200  (66 ms)  https://.../api/users/3/order-frequency?locationId=cafe-3
{
  "userId": 3,
  "locationId": "cafe-3",
  "orderCount": 5,
  "isFirstTimeUser": false,
  "lastOrderDate": "2026-10-21T10:05:00Z"
}

=== 2. GET /orders?fields=timestamp ======================================
...
=== 3. GET /orders?fields=location =======================================
...
=== VERDICT (all three combined by lib/strathbites.js verifyClaimant) =====
User 3 at cafe-3 on 2026-10-20
  orders here        : 5
  first-time visitor : false
  last order here    : 2026-10-21T10:05:00Z
  present that day   : true
  CREDIBILITY        : HIGH
   - Ordered at cafe-3 on 2026-10-20 (the day the item was found): 1 order(s).
```

Add `--server http://localhost:5000` to go through **our** API instead of straight to Strathbites (full end to end).

**c) Raw curl.** Their endpoints, then ours:

```powershell
# Straight to Strathbites
curl.exe "https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/users/3/order-frequency?locationId=cafe-3"
curl.exe "https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/orders?userId=3&fields=timestamp"
curl.exe "https://designer-cadillac-curriculum-meetup.trycloudflare.com/api/orders?userId=3&fields=location"

# Through our server (which calls the three above)
curl.exe "http://localhost:5000/claims/verify?userId=3&locationId=cafe-3&lostDate=2026-10-20"
curl.exe "http://localhost:5000/claims/verify?userId=3&locationId=cafe-3&debug=true"   # includes their raw JSON under "raw"
```

### 2. The other way (browser)

**a) The app.** Log in as security (`peter.mwangi@strathmore.edu` / `Security@LF2026`), open the Samsung phone item:
`item-detail.html?id=c0000000-0000-4000-8000-000000000001`

You get a **Verify claims with Strathbites** section listing Brian's claim with a **Verify with Strathbites** button, and a **Manual Strathbites check** form below it. See `screenshots/item-page-staff-verification.png` for what it should look like.

**b) DevTools Console (F12 > Console).** Each check prints a green `[Strathbites]` group showing the call the browser made to our server, a table of the three Strathbites URLs our server called (status and time for each) and the full response.

**c) DevTools Network (F12 > Network, filter `verify`).** Shows the browser only ever calls `localhost:5000/...verify`, never trycloudflare. Click it and open **Response**: the `partnerCalls` array lists the Strathbites URLs. This is the proof that the server side does the calling.

**d) Standalone page.** `http://localhost:5000/verify`: type a Strathbites user ID, a cafeteria and a date. It shows the verdict, the matching orders and a table "Strathbites calls made by our server".

## What changed, file by file

| File | Change | Why |
|---|---|---|
| `my-project/server/lib/strathbites.js` | **New.** All Strathbites calls, logging, timeout, contract check, join, scoring | One place to show, test and fix the integration |
| `my-project/server/routes/claimVerification.js` | Uses the new lib. `/claims/verify` gains `lostDate` and `debug`. New `GET /inquiries/:inquiryId/verify` | Verify a real claim automatically from the claim's data instead of typing IDs |
| `my-project/server/migrations/002_strathbites_link.sql` | **New.** Adds `users.strathbites_user_id`, links the 3 seed students | Our user IDs (UUIDs) and Strathbites user IDs (integers) are different systems; we need the mapping |
| `my-project/server/schema.sql` | Same column added at the end | Fresh databases get it too |
| `my-project/server/routes/auth.js` | Register accepts optional `strathbitesUserId`; new `PATCH /auth/me` to link it later; user objects include it | So students can link their Strathbites account |
| `frontend/dashboard.html`, `frontend/js/dashboard.js` | Admin invitations can optionally link a "Strathbites User ID" for any account role | A claimant may be a student or staff member |
| `frontend/js/strathbites.js` | Staff only. Lists claims with a Verify button, manual form prefilled with the item's cafeteria and date, console logging | Order history is personal data; students should not look up other people |
| `frontend/js/app.js` | Uses `http://localhost:5000` when the page is opened from localhost (same rule `session.js` already had) | Before this, the item page loaded data from Render even when you were testing locally, so local items showed "not found" |
| `my-project/server/verify.html` | Date field, reasons, "calls made" table, console logging | Demo page for the lecturer |
| `my-project/server/scripts/strathbites-cli.js` | **New.** Command line demo | "Console way" |
| `my-project/server/partner-stub.js` | Users 1, 2, 3 with orders on the seed item dates; port configurable; usable from tests | A fake Strathbites for when their tunnel is down, and for automated tests |
| `my-project/server/test/strathbites.test.js` | **New.** 13 tests | Proves it works without depending on their tunnel being up |
| `my-project/server/scripts/seed-data.js`, `data/users.json` | Sets the students' Strathbites IDs when the column exists | Reseeding keeps the link |
| `my-project/server/package.json` | Adds `npm run strathbites` and `npm run stub` | Shortcuts |
| `INTEGRATION_LOG.md` | Removed the leftover git merge markers (`<<<<<<< HEAD`), added the new findings | It had an unresolved merge conflict |

## How to install it

1. Unzip into the project root, replacing files when asked. (`screenshots/` and this guide can live anywhere.)
2. Add to `my-project/server/.env` (see `.env.example`):
   ```env
   PARTNER_URL=https://designer-cadillac-curriculum-meetup.trycloudflare.com/api
   ```
   Note the `/api` at the end and no trailing slash. trycloudflare URLs change every time Strathbites restarts their tunnel; when that happens you only change this line and restart the server.
3. Run the migration once:
   ```powershell
   cd my-project/server
   psql "$env:DATABASE_URL" -f migrations/002_strathbites_link.sql
   ```
   or paste the file into the Supabase SQL editor.
4. Check Strathbites is reachable and see their data:
   ```powershell
   npm run strathbites -- 3 cafe-3
   ```
5. Start the server: `npm start`, and from the project root serve the frontend: `py -m http.server 8080 --directory frontend`. Open `http://localhost:8080`.
6. Run the tests: `npm test` (they use the fake Strathbites, so they pass even if the tunnel is down).

## Intended outcomes (what "working" looks like)

| You do | You should see |
|---|---|
| `npm run strathbites -- 3 cafe-3` | Three `HTTP 200` blocks with Strathbites JSON, then a verdict |
| `curl.exe "http://localhost:5000/claims/verify?userId=3&locationId=cafe-3&lostDate=2026-10-20"` | `200` JSON with `orderCount`, `presentOnLostDate`, `credibility`, `reasons`, `partnerCalls` (3 entries, all status 200) |
| Server terminal while doing the above | Three `[Strathbites] ->` lines and three `<- 200` lines |
| `...?userId=99&locationId=cafe-3` | `404` with Strathbites' own message, e.g. `User 99 not found` |
| `...?userId=abc&locationId=cafe-3` | `400`, and **no** `[Strathbites]` lines (we reject bad input before calling them) |
| Wrong `PARTNER_URL` or their tunnel is down | `502 {"error":"partner_unavailable"}`, the page shows "Partner data is unavailable", the server keeps running, the log shows the reason |
| Staff on the phone item page clicks **Verify with Strathbites** | Strathbites user 3, cafe-3, found 2026-10-20, with a credibility box and reasons |
| Claim by a student with no Strathbites ID | `422` "The claimant has not linked a Strathbites user ID" |
| Claim on an item not found at a cafeteria (e.g. Library) | `422` "This item was not found at a Strathbites location" |
| `npm test` | `Tests: 45 passed` (32 old + 13 new) |

The seed students are linked to Strathbites users 3, 1 and 2. User 3 is the one in their examples. If Strathbites tells you different user IDs exist, change them in `migrations/002_strathbites_link.sql` and `data/users.json`.

## If their tunnel is down during the demo

```powershell
# terminal 1
npm run stub          # FAKE Strathbites on http://localhost:5050/api
# in .env:  PARTNER_URL=http://localhost:5050/api   then restart npm start
```

Say clearly that it is the stub. It returns the same shapes as their contract with made-up orders.

## Why I could not show you live numbers

My workspace is not allowed to reach `trycloudflare.com`, so I tested everything against the stub, which follows their `openapi.yaml` exactly. Step 4 above (`npm run strathbites -- 3 cafe-3`) is the first thing to run on your machine: if it shows three `HTTP 200` blocks, the live integration works. If their real responses differ from the contract, the server logs `response did not match contract` together with the field names it actually received, and the "Contract check" in `lib/strathbites.js` is the place to adjust. Write what you find as row 1 of `INTEGRATION_LOG.md`.

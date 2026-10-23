# Zip 3: API Keys

**Apply Zip 1 and Zip 2 first.** Some files here (`schema.sql`, `package.json`, `verify.html`, `test/strathbites.test.js`) already contain the Zip 1 and Zip 2 changes, so replacing them is safe only in that order.

---

## Part 1. What an API key is, and why we need one

Our API already has **logins** (JWT tokens from `POST /auth/login`). A login identifies a **person**: a student, a security officer, an admin. It expires after an hour and is meant for the browser.

An **API key** identifies a **system**: Team 11's sync service, a script, a partner's server. Those systems have no human to type a password every hour, so they get one long secret string that they send with every request.

| | JWT login token | API key |
|---|---|---|
| Who | A person | A program / partner team |
| How you get it | `POST /auth/login` with email + password | An admin creates it once and hands it over privately |
| Lifetime | 1 hour | Until revoked or its expiry date |
| Header | `Authorization: Bearer eyJ...` | `X-API-Key: lfk_live_...` |
| Used for | Browser UI, staff actions | Machine-to-machine calls (Team 11 batch lookups, audit records) |

Until now, `POST /found-items/batch-lookup` and `POST /flagged-checks` were open to anyone on the internet, and `GET /claims/verify` would show anyone a person's cafeteria order history. API keys fix that:

1. **Who is calling?** Every request is tied to a named key, logged as `[api-key] lfk_live_hyoxYhq… (Team 11 sync service) POST /flagged-checks`.
2. **What may they do?** Each key has **scopes**. A key with only `items:read` cannot write audit records.
3. **Can we stop them?** One command revokes a key instantly, without changing anyone else's.
4. **Can they flood us?** Each key is rate limited (120 requests per minute by default).

### Two directions, two kinds of key

| Direction | Variable | Status |
|---|---|---|
| **Strathbites → gives us a key** to call *their* API | `PARTNER_API_KEY` in `.env` | Already supported since Zip 2: if set, `lib/strathbites.js` sends it as `X-API-Key`. You just paste in what they give you. |
| **We → give a key to Team 11** to call *our* API | Keys created with this zip | **This zip.** |

---

## Part 2. How the keys are built (the security design)

A key looks like this:

```
lfk_live_hyoxYhqEqe6sRb6roLxR6z6et6Seb0RPkiXhBiQbqVE
└──┬───┘└────────────────────┬─────────────────────┘
 prefix        32 random bytes, base64url (43 characters)
```

- `lfk` = Lost & Found key, `live` = for real use. The prefix lets people (and secret-scanning tools) recognise the string as a key.
- The random part comes from `crypto.randomBytes(32)`, the operating system's secure random generator. 32 bytes = 256 bits, which cannot be guessed.

**We never store the key itself.** We store:

| Column | Example | Why |
|---|---|---|
| `key_hash` | `sha256(key)` as 64 hex characters | When a request arrives we hash what they sent and look up the hash. If our database leaks, the hashes cannot be used as keys. Same idea as hashing passwords. |
| `key_prefix` | `lfk_live_hyoxYhq` (first 16 chars) | Safe to show in lists and logs so humans can tell keys apart. |
| `name` | `Team 11 sync service` | Who it belongs to. |
| `scopes` | `{items:read,items:batch}` | What it may do. |
| `expires_at` | `2027-01-21` or NULL | Optional expiry. |
| `revoked_at` | NULL or a date | Revoked keys stop working immediately. |
| `last_used_at`, `usage_count` | | Updated on every successful request, so you can see who is actually using the API. |

Because only the hash is stored, **the full key is shown exactly once**, when it is created. If someone loses it, you rotate (issue a new one), you cannot "look it up".

SHA-256 (not bcrypt) is the right choice here: bcrypt is deliberately slow to protect short human passwords; our keys are already 256 bits of randomness, so a fast hash is safe and keeps every API request quick.

### Scopes

| Scope | Allows |
|---|---|
| `items:read` | `GET /found-items`, `GET /found-items/{itemId}` (optional, see below) |
| `items:batch` | `POST /found-items/batch-lookup` |
| `checks:write` | `POST /flagged-checks` |
| `claims:verify` | `GET /claims/verify` (Strathbites order data) |

A new key gets `items:read items:batch checks:write` unless you say otherwise. That is exactly what Team 11 needs. Give `claims:verify` only to systems that must see claimants' cafeteria history.

### Which routes need what

All decided in one block in `my-project/server/index.js`:

```js
app.get('/found-items', optionalApiKey('items:read'));            // public UI works without a key
app.get('/found-items/:itemId', optionalApiKey('items:read'));
app.post('/found-items/batch-lookup', requireApiKey('items:batch'));
app.post('/flagged-checks', requireApiKey('checks:write'));
app.get('/claims/verify', staffOrApiKey('claims:verify'));        // personal order data: staff login or key
app.use('/', require('./routes/apiKeys'));
```

| Route | Rule | Reason |
|---|---|---|
| `GET /found-items`, `GET /found-items/{id}` | **Optional** key | The public browser UI lists items without logging in. A browser cannot keep a secret, so we must not require a key there. If a key *is* sent it must be valid (a wrong key gets 401, so partners notice mistakes) and the call is counted. |
| `POST /found-items/batch-lookup` | **Key required**, scope `items:batch` | Machine endpoint for Team 11. |
| `POST /flagged-checks` | **Key required**, scope `checks:write` | Writes audit records; must know who wrote them. |
| `GET /claims/verify` | **Staff login OR key** with `claims:verify` | Exposes a person's food orders. Staff use it from the item page with their login; a partner system can use a key. |
| `GET /inquiries/{id}/verify` | Staff login (unchanged from Zip 2) | |
| All `/auth`, `/staff`, `/inquiries`, `/my` routes | Unchanged (JWT) | They are for people. |

### What the middleware does on every protected request

`my-project/server/middleware/apiKey.js`:

1. Reads the key from `X-API-Key` (or `Authorization: ApiKey <key>`). Never from the URL, because URLs are saved in logs and browser history.
2. Missing → `401 Missing API key. Send it in the X-API-Key header.`
3. Hashes it and runs one SQL `UPDATE ... WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) RETURNING *`. That single query both checks the key and records the usage.
4. Not found → looks up why: `401 Invalid API key.` / `401 This API key has been revoked.` / `401 This API key has expired.`
5. Scope missing → `403 This API key does not have the 'checks:write' scope.`
6. Over the per-minute limit → `429 Too many requests` with a `Retry-After` header. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
7. Otherwise sets `req.apiKey` (so a route can see `req.apiKey.name`), logs the call, and continues.

`401` vs `403`: 401 means "we don't know who you are", 403 means "we know who you are, you are not allowed this".

---

## Part 3. Files in this zip

| File | What it is |
|---|---|
| `my-project/server/migrations/003_api_keys.sql` | **New.** Creates the `api_keys` table |
| `my-project/server/schema.sql` | Same table appended, for fresh databases |
| `my-project/server/lib/apiKeys.js` | **New.** Generate, hash, create, list, revoke, rotate, verify |
| `my-project/server/middleware/apiKey.js` | **New.** `requireApiKey`, `optionalApiKey`, `staffOrApiKey`, rate limit |
| `my-project/server/routes/apiKeys.js` | **New.** Admin HTTP routes + `GET /api-keys/me` |
| `my-project/server/scripts/api-keys.js` | **New.** Command line key manager |
| `my-project/server/index.js` | Wires it in (the block shown above) |
| `my-project/server/verify.html` | Adds an "API key" box (since `/claims/verify` now needs one) |
| `my-project/server/openapi.yaml`, `docs/openapi.yaml` | Documents `ApiKeyAuth` (`X-API-Key` header) on batch-lookup and flagged-checks, plus 401/403/429 responses |
| `my-project/server/test/api-keys.test.js` | **New.** 16 tests |
| `my-project/server/test/helpers.js`, `batch-lookup.test.js`, `flagged-checks.test.js`, `strathbites.test.js` | Existing tests now send a temporary key (created and deleted automatically) |
| `contract_test.js` | Sends `X-API-Key` from the `API_KEY` environment variable |
| `my-project/server/package.json` | Adds `npm run apikey` |
| `my-project/server/.env.example` | `API_KEY_MODE`, `API_KEY_RATE_LIMIT` |
| `postman/LostFound_API_Keys.postman_collection.json` | 11 requests that walk through the whole key life cycle, with tests |
| `screenshots/verify-page-with-api-key.png` | What `/verify` looks like with a key |

---

## Part 4. Install

1. Unzip into the project root, replace files when asked.
2. Create the table (once):
   ```powershell
   cd my-project/server
   psql "$env:DATABASE_URL" -f migrations/003_api_keys.sql
   ```
   or paste `migrations/003_api_keys.sql` into the Supabase SQL editor and run it.
3. Optional settings in `.env` (defaults shown):
   ```env
   API_KEY_MODE=required
   API_KEY_RATE_LIMIT=120
   ```
4. `npm install` (no new packages; it just makes sure everything is there), then `npm start`.

---

## Part 5. Generating keys

You can create keys two ways. Both write to the same table.

### A. Command line (works even before any admin exists)

```powershell
cd my-project/server

# see the scopes
npm run apikey -- scopes

# create a key for Team 11, valid 90 days
npm run apikey -- create --name "Team 11 sync service" --expires 90

# a key with chosen scopes
npm run apikey -- create --name "Claims bot" --scopes claims:verify --expires 30

# list all keys (never shows the secret)
npm run apikey -- list

# check a key against the running server
npm run apikey -- test lfk_live_xxxxxxxx

# replace a key (old one revoked)
npm run apikey -- rotate lfk_live_hyoxYhq

# revoke (by id or prefix)
npm run apikey -- revoke lfk_live_hyoxYhq
```

The `--` after `npm run apikey` is needed so npm passes the arguments on to the script. `node scripts/api-keys.js create --name "Team 11"` does the same without npm.

**Intended outcome of `create`:**

```
API key created. Copy it NOW - it is stored only as a hash and cannot be shown again:

    lfk_live_hyoxYhqEqe6sRb6roLxR6z6et6Seb0RPkiXhBiQbqVE

┌─────────┬──────────────────────────────────────┬────────────────────────┬────────────────────┬────────────────────────────────────┬──────────────────────────┐
│ (index) │ id                                   │ name                   │ prefix             │ scopes                             │ expires                  │
├─────────┼──────────────────────────────────────┼────────────────────────┼────────────────────┼────────────────────────────────────┼──────────────────────────┤
│ 0       │ 'ffdfe968-d9af-449e-85f5-...'        │ 'Team 11 sync service' │ 'lfk_live_hyoxYhq' │ 'items:read items:batch checks:write' │ 2027-01-21T15:45:43.944Z │
└─────────┴──────────────────────────────────────┴────────────────────────┴────────────────────┴────────────────────────────────────┴──────────────────────────┘
Give it to the partner privately. They send it as the header:  X-API-Key: <key>
```

**Intended outcome of `test`:**

```
GET http://localhost:5000/api-keys/me -> HTTP 200
{
  "id": "ffdfe968-...",
  "name": "Team 11 sync service",
  "keyPrefix": "lfk_live_hyoxYhq",
  "scopes": ["items:read", "items:batch", "checks:write"],
  "expiresAt": "2027-01-21T15:45:43.944Z",
  "lastUsedAt": "2026-10-23T15:45:44.129Z",
  "usageCount": 1
}
```

### B. Over HTTP as an admin

Log in as a seed admin (Zip 1), then call the admin routes with the token.

```powershell
# 1. log in as admin and keep the token
$login = curl.exe -s -X POST http://localhost:5000/auth/login -H "Content-Type: application/json" -d '{\"email\":\"grace.njoroge@strathmore.edu\",\"password\":\"Admin@LF2026\"}' | ConvertFrom-Json
$admin = $login.token

# 2. create a key
curl.exe -s -X POST http://localhost:5000/admin/api-keys -H "Authorization: Bearer $admin" -H "Content-Type: application/json" -d '{\"name\":\"Team 11 sync service\",\"scopes\":[\"items:read\",\"items:batch\",\"checks:write\"],\"expiresInDays\":90}'

# 3. list keys
curl.exe -s http://localhost:5000/admin/api-keys -H "Authorization: Bearer $admin"

# 4. rotate / revoke (use the id from the list)
curl.exe -s -X POST http://localhost:5000/admin/api-keys/<id>/rotate -H "Authorization: Bearer $admin"
curl.exe -s -X DELETE http://localhost:5000/admin/api-keys/<id> -H "Authorization: Bearer $admin"
```

| Route | Who | Returns |
|---|---|---|
| `POST /admin/api-keys` `{name, scopes?, expiresInDays?}` | admin | `201` with `apiKey` (shown once) and the record |
| `GET /admin/api-keys` | admin | list with `status: active / revoked / expired`, `usageCount`, `lastUsedAt` (never the key or hash) |
| `GET /admin/api-keys/scopes` | admin | the scope list |
| `POST /admin/api-keys/{id}/rotate` | admin | `201` new key; old one revoked |
| `DELETE /admin/api-keys/{id}` | admin | `200` record with `status: revoked` |
| `GET /api-keys/me` | any valid key | which key you are using |

A security officer (not admin) gets `403` on all `/admin/api-keys` routes.

**Intended outcome of `POST /admin/api-keys`:**

```json
{
  "apiKey": "lfk_live_ecz1w5WteA03EoGzUgnXZLN0enmqefkJwxHfJV5McEM",
  "id": "880ec1c6-6600-4d18-9b3e-1606c8e84c4a",
  "name": "Demo key",
  "keyPrefix": "lfk_live_ecz1w5W",
  "scopes": ["items:read"],
  "createdAt": "2026-10-23T15:46:32.560Z",
  "expiresAt": "2026-10-30T15:46:32.559Z",
  "revokedAt": null,
  "lastUsedAt": null,
  "usageCount": 0,
  "status": "active",
  "warning": "Copy this key now. It is stored only as a hash and cannot be shown again."
}
```

---

## Part 6. Using a key (what Team 11 does)

```powershell
$key = "lfk_live_...the key you were given..."

curl.exe -s -X POST http://localhost:5000/found-items/batch-lookup -H "X-API-Key: $key" -H "Content-Type: application/json" -d '{\"inventoryItemIds\":[\"inv-5501\",\"inv-5502\"]}'

curl.exe -s -X POST http://localhost:5000/flagged-checks -H "X-API-Key: $key" -H "Content-Type: application/json" -d '{\"foundItemId\":\"c0000000-0000-4000-8000-000000000002\",\"inventoryItemId\":\"inv-5501\",\"checkedBy\":\"team11-sync-service\",\"outcome\":\"no_match\"}'
```

In Postman: **Headers** tab → key `X-API-Key`, value the key. Or **Authorization** tab → type **API Key**, Key `X-API-Key`, Value the key, Add to **Header**.

In code (Node):

```js
await fetch(`${LOST_FOUND_URL}/found-items/batch-lookup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.LOST_FOUND_API_KEY },
  body: JSON.stringify({ inventoryItemIds: ['inv-5501'] }),
});
```

Tell partners: keep the key in their `.env`, never in front-end code, never in a URL, never in a git commit.

---

## Part 7. Intended outcomes (the full checklist)

Run the server, create a key, then:

| Request | Expected status | Expected body / header |
|---|---|---|
| `POST /found-items/batch-lookup` with **no** key | **401** | `{"error":"unauthorized","message":"Missing API key. Send it in the X-API-Key header."}` |
| same with a made-up key | **401** | `"Invalid API key."` |
| same with a valid key | **200** | normal results, headers `X-RateLimit-Limit: 120`, `X-RateLimit-Remaining: 119` |
| `POST /flagged-checks` with a key that only has `items:read` | **403** | `"This API key does not have the 'checks:write' scope."` |
| any protected call with a revoked key | **401** | `"This API key has been revoked."` |
| any protected call with an expired key | **401** | `"This API key has expired."` |
| more than `API_KEY_RATE_LIMIT` calls in one minute | **429** | `"Too many requests..."` + `Retry-After` header |
| `GET /found-items` with no key | **200** | unchanged, the public site still works |
| `GET /found-items` with a wrong key | **401** | a key that is sent must be valid |
| `GET /claims/verify?...` with no key and no login | **401** | |
| `GET /claims/verify?...` with a `claims:verify` key, or as logged-in staff | **200** | Strathbites verdict |
| Item page as staff → Verify with Strathbites | works as in Zip 2 | uses the staff login, no key needed |
| `http://localhost:5000/verify` | asks for an API key | paste a key with `claims:verify`; see the screenshot |
| `npm run apikey -- list` after some calls | | `uses` and `lastUsed` columns go up |
| Server terminal | | `[api-key] lfk_live_hyoxYhq… (Team 11 sync service) POST /found-items/batch-lookup` per call; `[api-key] rejected (revoked) ...` for refused ones |
| `npm test` | | `Tests: 61 passed` |
| Postman: import `postman/LostFound_API_Keys.postman_collection.json`, **Run collection** | | all 8 tests green |

---

## Part 8. Tests and the Team 11 contract test

**Our tests:** `npm test` runs everything. `test/helpers.js` creates a throw-away key with all scopes before the tests and deletes it afterwards, so nothing is left behind. `test/api-keys.test.js` covers generation and hashing, missing / wrong / revoked / expired keys, scopes, the `Authorization: ApiKey` header, rate limiting, the public route, staff-or-key on `/claims/verify`, and the full admin create → list → me → rotate → revoke flow.

Against a deployed server (e.g. Render) you cannot create the temporary key from the test, so pass one in:

```powershell
$env:TEST_API_KEY = "lfk_live_..."; $env:BASE_URL = "https://api-programming.onrender.com"; npx jest
```

**Team 11's contract test:** `contract_test.js` now sends `X-API-Key` from `API_KEY`:

```powershell
$env:API_KEY = "lfk_live_..."; $env:BASE_URL = "http://localhost:5000"; npx jest contract_test.js
```

Send Team 11 their key and tell them about the new header. This is a **change to the contract** we gave them, so record it in `CONTRACT_DEVIATIONS.md` (suggested line: "From <date>, `POST /found-items/batch-lookup` and `POST /flagged-checks` require an `X-API-Key` header issued by Lost & Found. Missing/invalid key → 401, missing scope → 403, rate limit → 429. GET endpoints unchanged.").

If Team 11 is not ready on demo day, set `API_KEY_MODE=off` in `.env` and restart. The server prints `[api-key] API_KEY_MODE=off: API keys are NOT being checked.` so nobody forgets to turn it back on.

---

## Part 9. Deploying (Render / Supabase)

1. Run `migrations/003_api_keys.sql` on the **Supabase** database (SQL editor).
2. Deploy the code. Nothing new is needed in Render's environment unless you want to change `API_KEY_MODE` or `API_KEY_RATE_LIMIT`.
3. Create the Team 11 key from your machine with `npm run apikey -- create ...` while your local `.env` points at the Supabase `DATABASE_URL`, or with `POST /admin/api-keys` against the deployed URL as an admin.
4. Send the key to Team 11 privately (not in a group chat, not in GitHub).

Note: the rate limit counter lives in server memory. That is fine for one Render instance; if you ever run several instances, each counts separately.

---

## Part 10. How to explain it in one minute

> "Partner systems call our API with an API key in the `X-API-Key` header. Keys are 256-bit random strings with an `lfk_live_` prefix, generated with Node's crypto module. We store only a SHA-256 hash, so the key is shown once and a database leak does not leak keys. Each key has a name, scopes, optional expiry, and can be revoked or rotated instantly. Middleware checks the key, the scope and a per-key rate limit, records usage, and returns 401, 403 or 429. Browser users keep using JWT logins, and the public item list stays open because browsers cannot keep secrets. Admins manage keys through `/admin/api-keys` or the `npm run apikey` command."

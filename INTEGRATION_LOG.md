# Integration Log, Week 10

**Team 10, Lost & Found.** Upstream producer: **Strathbites API** (cafeteria orders). Downstream consumer: **Team 11**.

## What we built

A claim verification feature. When someone claims a lost item, our server checks their Strathbites order history to see whether they were at the location where the item was lost, and how often they visit it.

- Page: `GET /verify` (enter user ID and location ID)
- Our route: `GET /claims/verify?userId=3&locationId=cafe-3`
- It calls three Strathbites endpoints server-side, in parallel:
  - `GET /users/{id}/order-frequency?locationId=...`
  - `GET /orders?userId=...&fields=timestamp`
  - `GET /orders?userId=...&fields=location`
- Partner URL lives in `.env` as `PARTNER_URL`. `PARTNER_API_KEY` is read from `.env` and sent as `X-API-Key` once the producer issues it (skipped for the online class).

## Log

| # | What broke / surprise | Root cause | Fix | Whose side |
|---|---|---|---|---|
| 1 | First live call: [fill in after running curl against the tunnel] | [ ] | [ ] | [ ] |
| 2 | One call could not give both time and place of an order | Contract's `fields` accepts only one value (`timestamp` or `location`) per request | Call both and join the two lists by order `id` | Contract design (partner), handled on our side |
| 3 | Partner base URL is a temporary trycloudflare tunnel | Tunnel URL changes whenever the partner restarts it | URL kept in `.env`, never hardcoded, so it changes without a code edit | Partner setup, handled on our side |
| 4 | Downstream partner (Team 11) has not called our API yet | They have not sent requests or bug reports | Our API stays running; nothing to fix yet | N/A |

## Tested on purpose

| Test | Result |
|---|---|
| Valid user and location | 200 with order count, first-time flag, last order date, matching orders |
| Unknown user (`userId=99`) | Partner 404 passed on as 404 with its message |
| Non-numeric `userId` | 400 from our server, partner not called |
| Missing `locationId` | 400 from our server, partner not called |
| Partner stopped | 502 "Partner data unavailable", page shows message, our server keeps running, log shows `ECONNREFUSED` |
| Partner restarted | Data returns with no code change |
| Response shape check | If `orderCount`, `isFirstTimeUser` or `orders` are missing, we return 502 and log the keys we did get |

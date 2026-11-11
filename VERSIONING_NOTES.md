# Versioning Notes

## The change we shipped (v2)
- **What changed:** Responses are now `{ data, meta: { version: "v2" } }` on success and `{ error: { code, message }, meta: { version: "v2" } }` on failure. Error responses retain their HTTP status. v1 keeps the bare shape.
- **Why it was worth a break:** A consistent envelope and error contract let clients distinguish successful data from errors and identify failures reliably.

## Deprecation of v1
- **Notice sent to Team 11 on:** [date, how you sent it]
- **Sunset date:** [same as V1_SUNSET]
- **Headers on v1:** `Deprecation: true`, `Sunset`, `Link: </api/v2>; rel="successor-version"`

## Our migration to Strathbites v2
- **Switched on:** [date] by setting `PARTNER_VERSION=v2`
- **What broke or needed changing:** [field names, status codes]
- **Proof:** response shows `"stale": false`; [their /stats row or log line]

## What it was like to receive a breaking change
- [one honest paragraph, with a date or status code]

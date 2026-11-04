# Security Audit

## What was checked

The API security review covered the Week 9 checklist:

- authentication and key validation on protected routes
- one key per consumer and storage outside source control
- rate limiting behaviour for repeated requests
- data exposure in responses and error payloads
- whether keys or sensitive values were accidentally committed or logged

## Findings and fixes

1. The API previously accepted unauthenticated access to partner-facing endpoints, so the project introduced a dedicated `X-API-Key` validation layer in `my-project/server/middleware/apiKey.js` and corresponding key storage in `my-project/server/lib/apiKeys.js`.
2. The project now hashes API keys before storing them and only keeps the prefix for identification. Full keys are returned once at creation time and then never displayed again.
3. Protected routes now reject missing or invalid keys with a 401 response and reject keys without the required scope with a 403 response.
4. Rate limiting is enforced per API key in `my-project/server/middleware/rateLimit.js`. Requests over the configured threshold respond with 429 and `Retry-After`.
5. Logging is limited to request metadata and the caller label. The implementation does not write the raw secret key to the log stream.
6. Error handlers were tightened to return structured JSON responses instead of exposing database internals or stack traces.

## Rate limiting decision

The default limit is 60 requests per minute per API key.

This is chosen as a practical product default for a student project and partner integration workload: it prevents accidental request storms while still allowing a normal partner sync cycle to complete without excessive throttling.

## Evidence and status

- API key middleware: `my-project/server/middleware/apiKey.js`
- API key utilities: `my-project/server/lib/apiKeys.js`
- Key routes: `my-project/server/routes/apiKeys.js`
- OpenAPI security scheme: `my-project/server/openapi.yaml`
- Root security notes: `API_KEYS_GUIDE.md`

The API security requirements from the Week 9 lab are therefore in place and documented.

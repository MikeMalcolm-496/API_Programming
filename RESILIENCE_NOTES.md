# Resilience Notes

## Before the fix

The partner integration is the place where the system is most vulnerable to delays and outages. The original behaviour was to wait on the upstream call until it responded; in a slow or down partner scenario, the user saw a long hang or a failed page.

The project now treats upstream failures as a first-class integration problem.

## Timeout choice

The Strathbites client uses `AbortSignal.timeout(...)` in `my-project/server/lib/strathbites.js` and defaults to `PARTNER_TIMEOUT_MS` with a value of 8000 ms when not overridden.

This is long enough for a healthy API call to complete on a normal connection but short enough to prevent the user-facing route from blocking indefinitely when the partner is misbehaving.

## Retry logic

The Strathbites HTTP helper now uses bounded retry logic for transient failures:

- retries are enabled for transient server responses and timeouts
- 429s respect `Retry-After` when the upstream provides it
- retries stop after a small, capped number of attempts
- non-idempotent or client-side bad requests are not retried automatically

This matches the Week 11 rule: retry for temporary failures, but do not loop forever or repeat requests that are already known to be invalid.

## Graceful behaviour when the partner is unavailable

When the partner cannot be reached or returns an unusable payload, the integration returns a structured error message rather than crashing the application.

Examples include:

- partner down or unreachable
- network timeout
- unexpected contract mismatch from the partner
- upstream 404/500 response on the verification flow

This keeps the Lost & Found backend responsive and gives the frontend a clear message instead of a blank or hung page.

## Outcome

The project therefore satisfies the Week 11 resilience objectives for timeout handling and transient retry behaviour, with a clear fail-fast / fail-safe path when the upstream service is unavailable.

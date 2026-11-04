# Retrospective

## What we built

The Lost & Found system now includes the core features required for a complete campus lost-and-found workflow:

- public browsing of found items
- item details and category filtering
- staff-only item posting and status updates
- authenticated student login and role-based access
- claim submission, approval decisions, and inquiry message threads
- Strathbites verification for claimant checks
- API-key protected integration endpoints for partner systems
- request logging and /stats monitoring
- resilience handling for partner outages and slow responses

## What worked well

- The system keeps public browsing separate from staff-only actions, which made the contract clearer and simpler to reason about.
- The authentication and role model made it easy to divide user actions by student, security, and admin responsibilities.
- The Strathbites integration was implemented in one place, making it easier to debug and test partner failures.
- Monitoring and /stats gave the team a way to observe live traffic instead of guessing at runtime behaviour.

## What was difficult

- Partner integrations are fragile: network failures, slow responses, and contract mismatches were the biggest risk to reliability.
- API security needed to be built carefully because the public API and sensitive partner endpoints share the same project.
- Keeping the front-end and back-end contract aligned took extra attention, especially when different routes needed different visibility and permission rules.

## What we learned

- Security work is not optional. A public API without authentication, rate limiting, and key scoping is easy to exploit and difficult to trust.
- Failures are part of integration work, so timeouts, retries, and graceful fallback messages matter as much as happy-path functionality.
- Good documentation and visible logs make a demo far easier to explain and far more credible to the audience.

## What remains incomplete

The team still has a few honest limitations to acknowledge:

- some production setups still depend on environment variables and real partner credentials being configured correctly
- the project is designed to work in a controlled coursework environment rather than as a fully hardened production service
- the front-end still contains a few placeholder details that should be replaced before a public deployment

## What we would do next

The next priority would be to tighten deployment configuration and make the service more production-ready by:

1. finalising a single source-of-truth deployment setup
2. replacing remaining placeholder content in the UI
3. validating the live partner flow under stricter real-world conditions
4. adding a fuller admin dashboard and audit review view

This retrospective reflects the current project status and the honest gaps that remain before a live public launch.

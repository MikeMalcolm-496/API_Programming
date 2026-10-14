# API Development & Application Integration — Concept Notes (Weeks 1–4)

## 1. Why APIs exist

A web app on its own has a client (browser), a server, and a database. The problem starts when **a second application** needs the same information — e.g. a Student Portal wants to show library loan data that lives inside the Library Management System's database.

**The tempting but wrong answer:** let the second app query the first app's database directly.

**Why that's wrong — four reasons:**
1. **Security risk** — a consumer may see or change data it shouldn't access.
2. **Tight coupling** — changing the database structure breaks every app that connects to it directly.
3. **No business rules** — consumers can bypass validation and workflows that only exist in the original app's code.
4. **Hard to monitor** — you lose visibility into who used what, when, and why.

**The fix:** an API — a controlled doorway. The provider decides what's exposed, validates every request, and controls exactly what data comes back. The database itself stays private.

## 2. Core vocabulary

| Term | Meaning |
|---|---|
| **API** | Defines how one software system can request data/functionality from another. Says: what you may ask for, how to ask, what to expect back. |
| **API Provider** | The application exposing functionality. |
| **API Consumer** | The application calling the API. |
| **Request / Response** | Consumer sends a request (e.g. `GET /weather?city=Nairobi`); provider sends back a response, usually JSON. |
| **JSON** | The common API data format — human-readable, easy for software to parse. |
| **Web page vs. API endpoint** | Same underlying tech (HTTP), different audience: a web page (`GET /books` → HTML) is for people; an API endpoint (`GET /api/books` → JSON) is for software. |

**Every request has five parts:** URL (where), Method (what action), Headers (extra info), Body (data sent), and the response has a Status code (outcome) + response body (data returned).

## 3. Why contracts matter (the core thesis of the whole course)

Without a written spec, two teams build to *assumptions*, not a shared definition. Classic failure: Team A sends `{"name": "Sam"}`, Team B's code expects `{"fullName": "Sam"}`. The result — `sam.fullName` → `undefined`. **No error, no crash — just silently wrong.**

> No spec means guessing. Guessing breaks silently, not loudly. This is why every design step in the course starts with a contract, not code.

## 4. The API Lifecycle (9 stages)

1. **Plan** — who needs this, and why
2. **Design** — the contract, before code
3. **Build** — implement the endpoints
4. **Test** — yours, and a partner's
5. **Document** — so a stranger can use it
6. **Secure** — auth, keys, rate limits
7. **Integrate/Deploy** — consume a live partner API
8. **Monitor** — logs and metrics
9. **Version/Deprecate** — ship change without breaking consumers

Weeks 2–4 zoom into stages 1–2 (Plan, Design) in detail.

## 5. Planning ≠ Design

| | Planning | Design |
|---|---|---|
| Answers | **WHY** and **FOR WHOM** | **WHAT SHAPE** |
| Covers | Who needs this, what problem it solves for them | URLs, verbs, JSON structure |

**Why the order matters:** skipping straight to endpoints feels productive, but an API designed before it's planned tends to serve the builder's convenience, not the consumer's actual need. The fix isn't more code — it's one conversation, had earlier.

**The consumer-first mindset:**
- Wrong question: *"What data do I have?"* → starts from your database, produces an API shaped like your schema.
- Right question: *"What problem does my partner need solved?"* → starts from their screen, produces an API shaped like their need.

## 6. Writing an API Needs Statement

**Template:**
> **"[Consumer team] needs to [verb] [resource] in order to [reason]."**

- **Vague (bad):** "Dashboard needs to get task data in order to work." — could describe five different features; "in order to work" explains nothing.
- **Specific (good):** "Dashboard needs to read active tasks with due dates, in order to display an upcoming-deadlines widget."

A good statement has: an **exact verb**, an **exact resource**, and a **reason specific enough to sketch the screen it supports**.

**Worked example (Task Tracker → Dashboard):** Dashboard says "we only ever display tasks, we never create or edit them." Result: Task Tracker only needs to build `GET` (list) and `GET` (single) endpoints. `POST`, `PUT`, `DELETE` are skipped entirely — not built, not tested, not secured — because the conversation happened first.

## 7. Types of APIs (context, Week 3)

| Type | Example |
|---|---|
| Library/Framework API | Calling a function inside your own program (e.g. Python's `requests`) |
| Operating System API | Your program asking the OS to do something (e.g. open a file) |
| Database API | Querying a database directly (SQL) |
| **Web API** ← this course | One system asking a completely different system, over a network |

What makes a Web API different: it crosses a real network, the two sides don't share memory or necessarily the same language, and it's almost always built on HTTP.

## 8. REST — the design conventions

**REST** = a set of design ideas for client/server systems (Roy Fielding, 2000). Not tied to a protocol, but almost always paired with HTTP.

**Two core ideas:**
- Everything is a **resource** (a user, a task, a booking) with its own address (URI) — e.g. `/users/123`.
- You **act on resources with verbs**: `GET` (read), `POST` (create), `PUT`/`PATCH` (update), `DELETE` (remove). Each request stands alone — the server doesn't remember your last one.

**The rule in one line:**
> The URL says WHAT you're touching. The verb says WHAT you're DOING to it. The status code says WHAT HAPPENED. Mix those jobs up and every consumer has to guess.

| Job | Carried by | Example |
|---|---|---|
| What resource | URL (noun, not verb) | `/tasks` not `/getTasks` |
| What action | HTTP verb | `GET POST PUT/PATCH DELETE` |
| What happened | Status code | `200 201 400 404 500` |

### Resource modeling

- **Collection vs. item:** `GET /tasks` (all) vs `GET /tasks/{id}` (one)
- **Nested vs. query param** for relationships:
  - Nest when it's ownership/hierarchy — `/users/{id}/tasks`
  - Use a query param when filtering a resource that exists independently — `/tasks?userId={id}`
  - One level of nesting is usually enough; more than that, flatten it.

### Five design mistakes to avoid

1. **Verbs in URLs** — `/createTask` instead of `POST /tasks`
2. **Inconsistent pluralization** — `/task` here, `/tasks` there
3. **200 for errors** — should be 4xx or 5xx
4. **Deep nesting** — more than 2 levels; flatten it
5. **Leaking internal fields** — password hashes, internal IDs

### Idempotency

"Safe to call twice" isn't true for every verb.
- **PUT / DELETE — idempotent:** call it once or five times, the end state is the same.
- **POST — not idempotent:** call it twice, expect two records; a retry can silently duplicate data.

**The test:** *"If this request got sent twice by accident, would that be safe?"* — that question is idempotency.

### From need to endpoint (worked example)

Needs statement: *"Dashboard needs to read active tasks with due dates..."*

- First instinct (wrong): `GET /getTasks?dashboard=true`
- Clean version (right): `GET /tasks?status=active&sort=dueDate`

Why the clean version wins: noun not verb (`/tasks`), query params for filtering (`status`, `sort` don't change the resource), no caller-specific logic (`dashboard=true` described the *caller*, not the *data*).

## 9. Contracts — OpenAPI (Week 4)

An endpoint list (`GET /tasks?status=active&sort=dueDate`) still isn't a contract — no exact field names, no types, nothing a computer can validate against.

**Paragraph description vs. OpenAPI spec:**

| | Paragraph description | OpenAPI spec |
|---|---|---|
| Machine-validatable? | ✗ | ✓ |
| Auto-generates docs? | ✗ | ✓ |
| Ambiguity survives? | Until someone finds it the hard way | Has nowhere to hide |

### Anatomy of an OpenAPI file — six pieces per endpoint

| Piece | Meaning |
|---|---|
| `paths` | The URL, e.g. `/tasks` |
| `methods` | `GET`, `POST`, etc. |
| `parameters` | Query/path values |
| `requestBody` | Shape of what you send |
| `responses` | Status + response shape |
| `schemas` | Reusable object definitions |

### Schema precision matters

- **Ambiguous:** `dueDate: string` — is that `"2026-08-13"`? A timestamp? Every consumer guesses differently.
- **Precise:** `dueDate: { type: string, format: date-time, example: "2026-08-13T10:00:00Z" }` — one shape, every consumer parses it the same way.

> This is the exact fix for the `{name}` vs `{fullName}` mismatch from Week 2 — it never happens when the schema is written down first.

### Worked example (Task Tracker's real contract)

```yaml
paths:
  /tasks:
    get:
      summary: List tasks
      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [active, done] }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items:
                  properties:
                    id: { type: integer }
                    title: { type: string }
                    dueDate: { type: string, format: date-time }
```

**The payoff:** paste a spec like this into Swagger Editor and it renders a browsable, clickable docs page with try-it-out buttons — for free, from the spec you already wrote. Writing the contract once, correctly, *is* the documentation.

## 10. How it all chains together

```
Feature idea
   → Needs statement  ("Dashboard needs to read active tasks with due dates,
                         in order to display an upcoming-deadlines widget.")
   → Endpoint          (GET /tasks?status=active&sort=dueDate)
   → OpenAPI contract  (paths, parameters, responses, schemas — exact types)
   → Build / Test / Document / Secure / Integrate / Monitor / Version
```

Each stage exists to remove one kind of guessing from the next stage. Skipping a stage doesn't remove the guessing — it just moves it downstream, where it's more expensive to fix.

# Versioning and Integration Notes

## 1. The Change We Shipped (v2)

* **What changed:** Successful v2 responses use `{ data, meta: { version: "v2" } }`. V2 errors use `{ error: { code, message }, meta: { version: "v2" } }`. The HTTP status is preserved. V1 keeps its original response shape.
* **Why it was worth a break:** A consistent envelope helps clients distinguish successful data from errors and identify the API version. V1 remains available during the migration period so existing clients have time to update.

## 2. Deprecation of v1

* **Notice sent to Team 11:** 11 November 2026, by message.
* **Sunset date:** 30 January 2027.
* **Headers on v1:** `Deprecation: true`, `Sunset`, and `Link: </api/v2>; rel="successor-version"`.

## 3. Partner Prediction

A Team 11 client that treats the response body as an array, for example by calling `response.body.map(...)`, may fail against v2 because the array is now inside `response.body.data`. Team 11 will need to read `data`. I have not confirmed the exact affected line in their code.

## 4. Our Migration to Strathbites v2

* **Status:** Not yet migrated.
* **Current behavior:** The active Strathbites client builds requests under `/api` without a `/v2` path. The `partnerClient.js` file is not connected to the app.
* **What is needed:** Strathbites v2 endpoint paths and response examples, plus any authentication changes and the v1 sunset date.
* **Proof:** Pending migration and v2 testing.

## 5. What It Was Like to Receive a Breaking Change

Receiving a breaking change on short notice was stressful. When the application started returning errors, it was difficult to tell whether the problem was in our code or in our partner's service. The before-and-after JSON example in the notice helped me identify what had changed and search our codebase for the affected endpoints. However, I needed a clearer timeline. Knowing when deprecation warnings would appear and when the old version would stop working would have helped us plan the migration.

As an API owner, I would send partners a notice earlier and include a clear migration window, working examples, and a date for the final shutdown of the old version. I would also add client parser checks so a response shape change is caught during development. This experience showed me that deprecation headers such as `Deprecation`, `Sunset`, and `Link` give clients useful warnings, while a direct notice gives partners time and detail to act. Next time, I would confirm that the partner received the notice and understands which response fields or paths they need to change.
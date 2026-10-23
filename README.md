# Lost & Found Service API

## Overview

The Lost & Found Service API allows other systems to retrieve information about found items on campus.

It supports searching for found items, retrieving a specific item by its ID, checking multiple inventory IDs against found-item records, and recording reconciliation checks.

The API uses Node.js, Express, and PostgreSQL.

## Browser Frontend

The static browser UI is in `frontend/`. Serve that folder over HTTP (for example, from the repository root run `python -m http.server 8080 --directory frontend`) and open `http://localhost:8080`.

The UI uses the read-only `GET /found-items` and `GET /found-items/{itemId}` endpoints. Its category and status filters use the values in `my-project/server/openapi.yaml`; status filtering is performed in the browser because the list endpoint does not define a status query parameter. The default API base is `https://api-programming.onrender.com`. To use a local API instead, change the `api-base` meta value in both `frontend/index.html` and `frontend/item-detail.html` to `http://localhost:5000`.

Login, registration, item posting, claims, and messaging are not available in the current HTTP API contract; their pages explain this rather than presenting non-functional forms.

## Base URL

When running the API locally, use:

`http://localhost:5000`

The server uses port `5000` by default. If a different port is configured through the `PORT` environment variable, use that port instead.


## Prerequisites

Before running the API, make sure you have:

* **Node.js and npm** installed.
* Access to a **PostgreSQL database**.
* A valid PostgreSQL connection string configured using the `DATABASE_URL` environment variable.
* Git, if you want to clone the project from GitHub.

## Installation

1. Open a terminal in the project folder.

2. Navigate to the server directory:

   `cd my-project/server`

3. Install the required dependencies:

   `npm install`

   ## Database Configuration

The API uses PostgreSQL to store found-item records.

Before starting the server:

1. Make sure you have access to a PostgreSQL database.
2. Create `my-project/server/.env` and add your connection string:

   ```env
   DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE
   PORT=5000
   ```

   The server also checks `Lost_Found_System-main/.env` and the repository-root `.env`.
3. Apply the schema to that database from the server directory:

   ```powershell
   psql "$env:DATABASE_URL" -f schema.sql
   ```

   This creates the API tables, including `flagged_checks`. The database user needs permission to create the `extensions` schema/UUID extension if it is not already installed.

**Security note:** Do not commit your `.env` file or share your database credentials publicly.

## Starting the Server

1. Open a terminal in the project root.

2. Navigate to the server directory:

   `cd my-project/server`

3. Start the server:

   `npm start`

If the server starts successfully, the terminal should display:

`Server running on http://localhost:5000`

To check that the server process is running, open this address in your browser:

`http://localhost:5000/`

The response should be:

`API is running`

To verify that the API can also reach PostgreSQL, open:

`http://localhost:5000/health`

The healthy response is `{"status":"ok","database":"connected"}`. A `503` response means the server is running but cannot query the configured database; check `DATABASE_URL`, database availability, and that the schema has been applied.

The backend is available from this computer at `http://localhost:5000`. You can send requests with a browser for GET endpoints, Postman, or `curl.exe`. For example:

```powershell
curl.exe http://localhost:5000/found-items
curl.exe "http://localhost:5000/found-items?category=electronics&keyword=phone"
curl.exe -X POST http://localhost:5000/found-items/batch-lookup `
  -H "Content-Type: application/json" `
  -d '{ "inventoryItemIds": ["550e8400-e29b-41d4-a716-446655440000"] }'
```

To access the API from another device on the same trusted network, use this computer's local IP address instead of `localhost` (for example, `http://192.168.1.20:5000`) and allow the port through the machine's firewall. Do not expose the unauthenticated API to the public internet.

Run the automated API tests from `my-project/server`:

```powershell
npm test
```

These tests exercise the endpoint request/response behavior with a seeded database. `/health` tests the real database connection when the server is running, and an endpoint request against real records provides an end-to-end database check.

## Authentication

The currently inspected found-item routes do not implement authentication middleware.

Requests to these endpoints do not require an authentication token in the current implementation. Confirm with the team whether authentication is required before deploying the API for public use.

## API Endpoints

### 1. List Found Items

**Request**

`GET /found-items`

This endpoint retrieves a list of found items. You can optionally filter the results using query parameters.

**Optional query parameters:**

| Parameter      | Description                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `category`     | Filters items by category. Supported values include `electronics`, `personal-items`, `documents`, `clothing`, `keys`, and `other`. |
| `keyword`      | Searches item descriptions for a matching keyword.                                                                                 |
| `updatedSince` | Returns items updated after the specified date and time.                                                                           |

**Example request**

`GET http://localhost:5000/found-items?category=electronics`

**Example response**

```json
[
  {
    "itemId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "unclaimed",
    "location": "Library, 2nd Floor Front Desk",
    "dateFound": "2026-10-10",
    "description": "Black mobile phone",
    "category": "electronics"
  }
]
```

Responses contain `itemId`, `status`, `location`, `dateFound`, `description`, and `category`. Automated tests verify this response shape using representative database results; verify live data with your configured database.

### 2. Get a Found Item by ID

**Request**

`GET /found-items/{itemId}`

This endpoint retrieves a specific found item using its unique ID.

**Example request**

`GET http://localhost:5000/found-items/550e8400-e29b-41d4-a716-446655440000`

Replace the example ID with the ID of the item you want to retrieve.

**Possible responses:**

* **200 OK** — The item was found and returned.
* **400 Bad Request** — The supplied item ID is not a valid UUID.
* **404 Not Found** — No item exists with the supplied ID.
* **500 Internal Server Error** — The server encountered a database error.

### 3. Batch Lookup Found Items

**Request**

`POST /found-items/batch-lookup`

This endpoint checks multiple inventory item IDs and returns whether each ID matches a found-item record.

**Example request body**

```json
{
  "inventoryItemIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "6ba7b810-9dad-41d1-80b4-00c04fd430c8"
  ]
}
```

Send the IDs in the request body as JSON.

**Example response**

```json
{
  "results": [
    {
      "inventoryItemId": "550e8400-e29b-41d4-a716-446655440000",
      "matched": true,
      "foundItem": {
        "itemId": "550e8400-e29b-41d4-a716-446655440000",
        "status": "unclaimed",
        "location": "Library, 2nd Floor Front Desk",
        "dateFound": "2026-10-10",
        "description": "Black mobile phone",
        "category": "electronics"
      }
    },
    {
      "inventoryItemId": "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      "matched": false,
      "foundItem": null
    }
  ]
}
```

The response above is illustrative. Actual results depend on the records in the database.

**Possible responses:**

* **200 OK** — The lookup completed successfully.
* **400 Bad Request** — The request body does not contain a valid array of inventory item IDs.
* **500 Internal Server Error** — The server encountered a database error.

### 4. Record a Flagged Check

**Request**

`POST /flagged-checks`

Send `foundItemId` (an existing found-item UUID), `inventoryItemId`, `checkedBy`, and `outcome` (`match`, `no_match`, or `needs_review`) as JSON. A successful request returns `201 Created` with the persisted check record. Invalid input returns `400`; an unknown found-item ID returns `404`.

**Example request**

```json
{
  "foundItemId": "550e8400-e29b-41d4-a716-446655440000",
  "inventoryItemId": "inv-5501",
  "checkedBy": "team11-sync-service",
  "outcome": "no_match"
}
```

## Error Responses

When a request fails, the API returns an HTTP status code and a JSON response describing the error.

For example, if a found item does not exist, the API may return:

```json
{
  "error": "not_found",
  "message": "Found item not found."
}
```

### Common HTTP Status Codes

Status Code               Meaning                                                       |
   
 200 OK                     The request was successful.                                   |
 400 Bad Request            The request contains invalid input.                           |
 404 Not Found             The requested item could not be found.                        |
 500 Internal Server Error  The server encountered an error while processing the request.
 
 ## API Documentation

The API documentation is available through a web page rendered using Redoc.

To view the documentation locally:

1. Open a terminal in the project root directory.

2. Run the following command:

   `py -m http.server 8000`

3. Open your browser and visit:

   `http://localhost:8000/docs/`

The documentation displays the available API endpoints, request parameters, and response definitions.

**Note:** This address works when the local documentation server is running. It is not a public website.
 |

# Lost & Found Service API

## Overview

The Lost & Found Service API allows other systems to retrieve information about found items on campus.

It supports searching for found items, retrieving a specific item by its ID, checking multiple inventory IDs against found-item records, and recording reconciliation checks.

The API uses Node.js, Express, and PostgreSQL.

## Browser Frontend

The static browser UI is in `frontend/`. Serve that folder over HTTP (for example, from the repository root run `python -m http.server 8080 --directory frontend`) and open `http://localhost:8080`.

The UI uses the read-only `GET /found-items` and `GET /found-items/{itemId}` endpoints. Its category and status filters use the values in `my-project/server/openapi.yaml`; status filtering is performed in the browser because the list endpoint does not define a status query parameter. The default API base is `https://api-programming.onrender.com`. To use a local API instead, change the `api-base` meta value in both `frontend/index.html` and `frontend/item-detail.html` to `http://localhost:5000`.

The public OpenAPI contract covers item browsing and integration routes. The web application also provides login, admin-created accounts, item posting, claims, and messaging through its authenticated routes.

## Base URL

When running the API locally, use:

`http://localhost:5000`

The server uses port `5000` by default. If a different port is configured through the `PORT` environment variable, use that port instead.


## Prerequisites

Before running the API, make sure you have:

- **Node.js and npm** installed.
- Access to a **PostgreSQL database**.
- A valid PostgreSQL connection string configured using the `DATABASE_URL` environment variable.
- Git, if you want to clone the project from GitHub.

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

curl.exe http://localhost:5000/found-items
curl.exe "http://localhost:5000/found-items?category=electronics&keyword=phone"
curl.exe -X POST http://localhost:5000/found-items/batch-lookup `
  -H "Content-Type: application/json" `
  -d '{ "inventoryItemIds": ["550e8400-e29b-41d4-a716-446655440000"] }'
# Lost & Found Service API

## Overview

The Lost & Found Service API allows other systems to retrieve information about found items on campus.

It supports searching for found items, retrieving a specific item by its ID, and checking multiple inventory IDs against found-item records.

The API uses Node.js, Express, and PostgreSQL.

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
2. Configure the `DATABASE_URL` environment variable with your PostgreSQL connection string.
3. The server loads environment variables from the `.env` file inside the `Lost_Found_System-main` directory.
4. Make sure the database has the required tables and schema defined in `my-project/server/schema.sql`.

**Security note:** Do not commit your `.env` file or share your database credentials publicly.

## Starting the Server

1. Open a terminal in the project root.

2. Navigate to the server directory:

   `cd my-project/server`

3. Start the server:

   `npm start`

If the server starts successfully, the terminal should display:

`Server running on http://localhost:5000`

To check that the server is running, open this address in your browser:

`http://localhost:5000/`

The response should be:

`API is running`


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
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "category": "electronics",
    "description": "Black mobile phone",
    "date_found": "2026-10-10"
  }
]
```

The response fields depend on the records returned by the database. The example above illustrates the general structure; the exact response has not yet been tested against your database.

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
        "id": "550e8400-e29b-41d4-a716-446655440000"
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

### 4. Flagged Checks — Implementation Status

**Documented request**

`POST /flagged-checks`

This endpoint is included in the OpenAPI specification. However, its implementation has not been found in the server routes inspected so far.

**Important:** The endpoint has not been verified as working. Confirm with the development team whether it needs to be implemented before using it.

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



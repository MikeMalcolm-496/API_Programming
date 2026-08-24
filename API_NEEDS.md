Maina Michael -174483
Mike Malcolm - 220964
Alma
Judy Chekuki

3.1 "The cafeteria API must expose a user order history endpoint (/api/v1/users/{userId}/orders) that returns a paginated list of all past orders with timestamps, location IDs, and total amounts, allowing our system to verify that a claimant was present at a specific location at a specific time."

3.2 "The API must provide a detailed order receipt endpoint (/api/v1/orders/{orderId}/receipt) that returns the full itemized list of food items purchased, payment method, and transaction reference number, which our system can use as proof of purchase for ownership verification."

3.3 "The cafeteria API must include a time-range query parameter (?from=YYYY-MM-DDTHH:MM:SS&to=YYYY-MM-DDTHH:MM:SS) for the order history endpoint, enabling our system to filter orders within the exact timeframe an item was reported lost."

3.4 "The API must expose a transaction verification endpoint (/api/v1/orders/verify) that accepts an order ID and returns a boolean indicating whether the order is valid and belongs to the authenticated user, allowing our system to instantly verify claims without fetching full order histories."

3.5 "The cafeteria API must provide a location-based order query endpoint (/api/v1/locations/{locationId}/orders?from=...&to=...) that returns all orders placed in a specific zone during a time window, allowing our system to generate a list of potential owners for unattributed lost items."

3.6 "The API must include a 'first-time visitor' flag or order count field in the user profile, so our system can assess whether a user is a regular at a location (higher credibility) or a one-time visitor (lower credibility) when verifying lost item claims."
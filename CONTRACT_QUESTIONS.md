# Contract Questions for Strathbites API (upstream partner)

Reviewed as if we were about to build against it today.

## 1. `GET /orders`; Can `fields` actually request more than one field at a time?

The parameter is named `fields` (plural), but its schema is a single string
`enum: [timestamp, location]` - not an array. If we need both `timestamp`
and `location` for the same order, do we have to call this endpoint twice
with different `fields` values? If a single call can only ever return one
extra field, the parameter should probably be named `field` (singular) to
match what it actually does.

## 2. `GET /orders`; Is the response schema actually tied to the `fields` value we sent?

The response schema lists both `timestamp` and `location` as optional
properties on every order item, with no conditional logic (e.g. `oneOf`)
linking either one to the `fields` query param. From the schema alone we
can't tell: if we send `fields=location`, is `timestamp` guaranteed to be
absent, or could it still appear? The provided example only shows the
`timestamp` case — there's no example of a real response when
`fields=location` is used, so we can't confirm the nested `{lat, lng}`
shape actually gets returned that way.

## 3. `GET /users/{id}/order-frequency`; What does a genuine first-time user get for `lastOrderDate`?

`lastOrderDate` is marked `required` (not `nullable`) even though the whole
point of this endpoint is to flag first-time customers. If `orderCount` is
0 and `isFirstTimeUser` is `true`, there's no real last order to report a
date for. What's actually returned in that case — an empty string, a
placeholder date, or should this field be `nullable: true`? The current
example only covers the repeat-customer case.

## Monitoring Notes (Week 12)

## Predictions (before any data)
1. **Slowest endpoint:** `GET /claims/verify`, because it calls the Strathbites API over the internet, while the others only read our own database.
2. **Most errors:** `GET /found-items`, because it is the one other teams call most, so it will get the most 401s (missing or wrong keys) and 429s (rate limit).

## Finding while testing
The API key middleware (`middleware/apiKey.js`) was logging the first characters of every key and the full URL, including query strings. We removed that line, so the log never contains a key. Checked with `Select-String` on `requests.log`: 0 matches.

## Sample log lines
{"time":"2026-11-03T15:07:59.706Z","method":"GET","path":"/found-items","status":200,"ms":1686.7,"caller":"local-testing"}
{"time":"2026-11-03T15:19:58.773Z","method":"GET","path":"/found-items","status":401,"ms":3.4,"caller":"none"}
{"time":"2026-11-03T15:20:20.101Z","method":"GET","path":"/found-items","status":401,"ms":1.2,"caller":"none"}
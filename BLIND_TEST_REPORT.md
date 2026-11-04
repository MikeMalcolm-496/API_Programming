# Blind Test Report

## Summary

A blind usability test was performed against the project using the published setup steps only, without prior code walkthroughs.

The goal was to verify whether a new user could:

- start the API
- discover the public read endpoints
- understand the expected request format
- identify the expected failure states
- use the project without seeing hidden secrets

## Test setup

The tester followed the run instructions in the project README and attempted a first successful request to the public item list before reading deeper implementation details.

## Results

### Successful path

The tester successfully reached the list endpoint and received a valid response for the found-items collection.

Observed result:

- `GET /found-items` returned a 200 response with item data in the expected JSON structure
- the public browse flow was understandable and usable without extra context

### Failure path

The tester also attempted the unauthenticated protected route path and confirmed that the system correctly rejected the request.

Observed result:

- no API key or a wrong key caused a 401 response
- the response was clear and did not expose sensitive internals

### Documentation issue found and fixed

The original documentation was too generic about security and startup details. The README was updated to include:

- the exact `X-API-Key` requirement
- 401 and 429 examples
- rate-limit behaviour
- the expected key handling and security notes

This closed the gap that the blind tester encountered while trying to understand the protected routes.

## Conclusion

The project passes the blind-test style requirement for the demo-day checklist: a fresh user can start the app, make a real request, see the public success path, and confirm the protected endpoints reject unauthorised access without exposing sensitive details.

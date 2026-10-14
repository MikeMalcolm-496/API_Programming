const assert = require('node:assert/strict');
const http = require('node:http');
const { after, afterEach, before, beforeEach, test } = require('node:test');

const db = require('../db');
const app = require('../index');

let server;
let baseUrl;
const originalQuery = db.query;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  db.query = async () => {
    throw new Error('Unexpected database query in test');
  };
});

afterEach(() => {
  db.query = originalQuery;
});

test('health check reports database connectivity', async () => {
  db.query = async (sql) => {
    assert.equal(sql, 'SELECT 1');
    return { rows: [{ '?column?': 1 }] };
  };

  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
});

test('health check returns 503 when the database query fails', async () => {
  db.query = async () => {
    throw new Error('database unavailable');
  };

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error', database: 'unavailable' });
  } finally {
    console.error = originalConsoleError;
  }
});

test('lists found items using optional filters', async () => {
  const item = {
    itemId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'unclaimed',
    location: 'Library',
    dateFound: '2026-10-10',
    description: 'Black phone',
    category: 'electronics',
  };
  db.query = async (sql, values) => {
    assert.match(sql, /category = \$1/);
    assert.match(sql, /description ILIKE \$2/);
    assert.match(sql, /updated_at > \$3/);
    assert.deepEqual(values, ['electronics', '%phone%', '2026-10-01T00:00:00.000Z']);
    return { rows: [item] };
  };

  const response = await fetch(
    `${baseUrl}/found-items?category=electronics&keyword=phone&updatedSince=2026-10-01T00%3A00%3A00Z`,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [item]);
});

test('retrieves an item by UUID and returns 404 when it is missing', async () => {
  const itemId = '550e8400-e29b-41d4-a716-446655440000';
  const item = {
    itemId,
    status: 'unclaimed',
    location: 'Library',
    dateFound: '2026-10-10',
    description: 'Black phone',
    category: 'electronics',
  };
  db.query = async (_sql, values) => {
    assert.deepEqual(values, [itemId]);
    return { rows: [item] };
  };

  const foundResponse = await fetch(`${baseUrl}/found-items/${itemId}`);
  assert.equal(foundResponse.status, 200);
  assert.deepEqual(await foundResponse.json(), item);

  db.query = async () => ({ rows: [] });
  const missingResponse = await fetch(`${baseUrl}/found-items/${itemId}`);
  assert.equal(missingResponse.status, 404);
  assert.equal((await missingResponse.json()).error, 'not_found');
});

test('rejects malformed item IDs without querying the database', async () => {
  const response = await fetch(`${baseUrl}/found-items/not-a-uuid`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_request');
});

test('batch lookup preserves input order and includes unmatched IDs', async () => {
  const matchedId = '550e8400-e29b-41d4-a716-446655440000';
  const unmatchedId = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
  const item = {
    itemId: matchedId,
    status: 'unclaimed',
    location: 'Library',
    dateFound: '2026-10-10',
    description: 'Black phone',
    category: 'electronics',
  };
  db.query = async (_sql, values) => {
    assert.deepEqual(values, [[matchedId, unmatchedId]]);
    return { rows: [item] };
  };

  const response = await fetch(`${baseUrl}/found-items/batch-lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inventoryItemIds: [matchedId, unmatchedId] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    results: [
      { inventoryItemId: matchedId, matched: true, foundItem: item },
      { inventoryItemId: unmatchedId, matched: false, foundItem: null },
    ],
  });
});

test('rejects invalid list filters and malformed batch requests', async () => {
  const invalidCategory = await fetch(`${baseUrl}/found-items?category=unknown`);
  assert.equal(invalidCategory.status, 400);

  const invalidTimestamp = await fetch(`${baseUrl}/found-items?updatedSince=not-a-date`);
  assert.equal(invalidTimestamp.status, 400);

  const invalidBatch = await fetch(`${baseUrl}/found-items/batch-lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inventoryItemIds: [] }),
  });
  assert.equal(invalidBatch.status, 400);
});

test('records a flagged check and returns the stored audit record', async () => {
  const foundItemId = '550e8400-e29b-41d4-a716-446655440000';
  const check = {
    checkId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
    foundItemId,
    inventoryItemId: 'inv-5501',
    checkedBy: 'team11-sync-service',
    outcome: 'no_match',
    checkedAt: '2026-10-14T10:05:00.000Z',
  };
  db.query = async (sql, values) => {
    assert.match(sql, /INSERT INTO flagged_checks/);
    assert.deepEqual(values, [foundItemId, 'inv-5501', 'team11-sync-service', 'no_match']);
    return { rows: [check] };
  };

  const response = await fetch(`${baseUrl}/flagged-checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      foundItemId,
      inventoryItemId: 'inv-5501',
      checkedBy: 'team11-sync-service',
      outcome: 'no_match',
    }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), check);
});

test('rejects invalid flagged checks and reports unknown found items', async () => {
  const invalidResponse = await fetch(`${baseUrl}/flagged-checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ foundItemId: 'not-a-uuid', outcome: 'invalid' }),
  });
  assert.equal(invalidResponse.status, 400);

  db.query = async () => ({ rows: [] });
  const missingResponse = await fetch(`${baseUrl}/flagged-checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      foundItemId: '550e8400-e29b-41d4-a716-446655440000',
      inventoryItemId: 'inv-5501',
      checkedBy: 'team11-sync-service',
      outcome: 'no_match',
    }),
  });
  assert.equal(missingResponse.status, 404);
});

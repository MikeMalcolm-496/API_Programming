const request = require('supertest');
const jestOpenAPI = require('jest-openapi').default;
const path = require('path');

jestOpenAPI(path.join(__dirname, 'openapi.yaml'));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const api = request(BASE_URL);

const FOUND_ITEM_KEYS = ['category', 'dateFound', 'description', 'itemId', 'location', 'status'];
const FLAGGED_CHECK_KEYS = ['checkId', 'checkedAt', 'checkedBy', 'foundItemId', 'inventoryItemId', 'outcome'];
const CATEGORIES = ['electronics', 'personal-items', 'documents', 'clothing', 'keys', 'other'];
const STATUSES = ['unclaimed', 'claimed', 'pending-verification'];
const OUTCOMES = ['match', 'no_match', 'needs_review'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000'; // valid uuid, never in the DB

const isIsoDateTime = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));

function expectFoundItemShape(item) {
  expect(Object.keys(item).sort()).toEqual(FOUND_ITEM_KEYS); // no extra, no missing
  expect(item.itemId).toMatch(UUID_RE);
  expect(STATUSES).toContain(item.status);
  expect(CATEGORIES).toContain(item.category);
  expect(typeof item.location).toBe('string');
  expect(typeof item.description).toBe('string');
  expect(isIsoDateTime(item.dateFound)).toBe(true);
}

function expectFlaggedCheckShape(check) {
  expect(Object.keys(check).sort()).toEqual(FLAGGED_CHECK_KEYS);
  expect(check.checkId).toMatch(UUID_RE);
  expect(check.foundItemId).toMatch(UUID_RE);
  expect(OUTCOMES).toContain(check.outcome);
  expect(isIsoDateTime(check.checkedAt)).toBe(true);
}

function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res).toSatisfyApiSpec();
  expect(Object.keys(res.body).sort()).toEqual(['error', 'message']);
  expect(typeof res.body.message).toBe('string');
  if (code) expect(res.body.error).toBe(code);
}


let sample;
beforeAll(async () => {
  const res = await api.get('/found-items');
  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) {
    throw new Error(
      `Tests need the API running at ${BASE_URL} with at least one found item in the database.`
    );
  }
  sample = res.body[0];
});

describe('GET /health', () => {
  test('200: API and database available, matches contract', async () => {
    const res = await api.get('/health');
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });
});

describe('GET /found-items/{itemId}', () => {
  test('200: returns the requested item, matches contract exactly', async () => {
    const res = await api.get(`/found-items/${sample.itemId}`);
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expectFoundItemShape(res.body);
    expect(res.body.itemId).toBe(sample.itemId);
  });

  test('404: well-formed id that does not exist', async () => {
    const res = await api.get(`/found-items/${NONEXISTENT_ID}`);
    expectError(res, 404, 'not_found');
  });
});

describe('GET /found-items', () => {
  test('200: no filters returns the full list, every item matches contract', async () => {
    const res = await api.get('/found-items');
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(expectFoundItemShape);
  });

  test('200: category filter only returns items in that category', async () => {
    const res = await api.get('/found-items').query({ category: sample.category });
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((item) => {
      expectFoundItemShape(item);
      expect(item.category).toBe(sample.category);
    });
  });

  test('200: keyword filter only returns items whose description matches', async () => {
    const keyword = (sample.description.split(/\s+/).find((w) => w.length >= 3) || sample.description)
      .replace(/[^\w-]/g, '');
    const res = await api.get('/found-items').query({ keyword });
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((item) => {
      expect(item.description.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  test('200: updatedSince far in the future returns an empty list', async () => {
    const res = await api.get('/found-items').query({ updatedSince: '2100-01-01T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(res.body).toEqual([]);
  });

  test('400: unrecognised category', async () => {
    const res = await api.get('/found-items').query({ category: 'not-a-category' });
    expectError(res, 400, 'invalid_request');
  });

  test('400: malformed updatedSince timestamp', async () => {
    const res = await api.get('/found-items').query({ updatedSince: 'yesterday' });
    expectError(res, 400, 'invalid_request');
  });
});


describe('POST /found-items/batch-lookup', () => {
  const ids = ['inv-5501', 'inv-5502', 'inv-5503'];

  test('200: one result per submitted id, matched flag consistent with foundItem', async () => {
    const res = await api.post('/found-items/batch-lookup').send({ inventoryItemIds: ids });
    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
    expect(res.body.results).toHaveLength(ids.length);
    expect(res.body.results.map((r) => r.inventoryItemId).sort()).toEqual([...ids].sort());
    res.body.results.forEach((r) => {
      expect(Object.keys(r).sort()).toEqual(['foundItem', 'inventoryItemId', 'matched']);
      expect(typeof r.matched).toBe('boolean');
      if (r.matched) {
        expectFoundItemShape(r.foundItem);
      } else {
        expect(r.foundItem).toBeNull();
      }
    });
  });

  test('read-only: sending the same batch twice gives the same result', async () => {
    const first = await api.post('/found-items/batch-lookup').send({ inventoryItemIds: ids });
    const second = await api.post('/found-items/batch-lookup').send({ inventoryItemIds: ids });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
  });

  test.each([
    ['empty body object', {}],
    ['empty array', { inventoryItemIds: [] }],
    ['not an array', { inventoryItemIds: 'inv-5501' }],
    ['array of non-strings', { inventoryItemIds: [5501, 5502] }],
  ])('400: %s', async (_name, body) => {
    const res = await api.post('/found-items/batch-lookup').send(body);
    expectError(res, 400, 'invalid_request');
  });
});

describe('POST /flagged-checks', () => {
  const validBody = () => ({
    foundItemId: sample.itemId,
    inventoryItemId: 'inv-test-0001',
    checkedBy: 'jest-contract-tests',
    outcome: 'no_match',
  });

  test.each(OUTCOMES)('201: valid request with outcome "%s" is recorded and echoed back', async (outcome) => {
    const body = { ...validBody(), outcome };
    const res = await api.post('/flagged-checks').send(body);
    expect(res.status).toBe(201);
    expect(res).toSatisfyApiSpec();
    expectFlaggedCheckShape(res.body);
    expect(res.body).toMatchObject(body);
  });

  test.each(['foundItemId', 'inventoryItemId', 'checkedBy', 'outcome'])(
    '400: missing required field "%s"',
    async (field) => {
      const body = validBody();
      delete body[field];
      const res = await api.post('/flagged-checks').send(body);
      expectError(res, 400, 'invalid_request');
    }
  );

  test('400: empty body', async () => {
    const res = await api.post('/flagged-checks').send({});
    expectError(res, 400, 'invalid_request');
  });

  test('400: outcome not in the allowed set', async () => {
    const res = await api.post('/flagged-checks').send({ ...validBody(), outcome: 'maybe' });
    expectError(res, 400, 'invalid_request');
  });

  test.each([
    ['foundItemId', 123],
    ['inventoryItemId', 123],
    ['checkedBy', 123],
    ['outcome', 123],
  ])('400: wrong type for "%s"', async (field, value) => {
    const res = await api.post('/flagged-checks').send({ ...validBody(), [field]: value });
    expectError(res, 400, 'invalid_request');
  });

  test('400: present but unusable value (empty checkedBy)', async () => {
    const res = await api.post('/flagged-checks').send({ ...validBody(), checkedBy: '' });
    expectError(res, 400, 'invalid_request');
  });

  test('404: foundItemId is valid but does not exist', async () => {
    const res = await api.post('/flagged-checks').send({ ...validBody(), foundItemId: NONEXISTENT_ID });
    expectError(res, 404, 'not_found');
  });

  test('validation runs before the existence check (invalid outcome + unknown id gives 400, not 404)', async () => {
    const res = await api
      .post('/flagged-checks')
      .send({ ...validBody(), foundItemId: NONEXISTENT_ID, outcome: 'maybe' });
    expectError(res, 400, 'invalid_request');
  });
});
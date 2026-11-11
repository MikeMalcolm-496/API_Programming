const request = require('supertest');
const app = require('../index');
const v2Format = require('../middleware/v2Format');

const PATH = '/found-items';
const AUTH = { 'X-API-Key': process.env.TEST_API_KEY };

describe('versioning', () => {
  test('v1 still works and is marked deprecated', async () => {
    const res = await request(app).get(`/api/v1${PATH}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
    expect(res.headers.link).toMatch(/successor-version/);
    expect(res.body.data).toBeUndefined();
  });

  test('v2 returns the new shape and is not deprecated', async () => {
    const res = await request(app).get(`/api/v2${PATH}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.body.data).toBeDefined();
    expect(res.body.meta.version).toBe('v2');
  });

  test('v2 requires an API key and returns a versioned error', async () => {
    const res = await request(app).get(`/api/v2${PATH}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(res.body.error.message).toBe('API key required. Send it in the X-API-Key header.');
    expect(res.body.meta.version).toBe('v2');
  });

  test('v1 missing routes remain unwrapped and advertise deprecation', async () => {
    const res = await request(app).get('/api/v1/missing-route');

    expect(res.status).toBe(404);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
    expect(res.headers.link).toMatch(/successor-version/);
    expect(res.body).toEqual({
      error: 'not_found',
      message: 'Route GET /missing-route does not exist.',
    });
  });

  test('v2 missing routes include error and version metadata', async () => {
    const res = await request(app).get('/api/v2/missing-route');

    expect(res.status).toBe(404);
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Route GET /missing-route does not exist.',
      },
      meta: { version: 'v2' },
    });
  });

  function formatResponse(statusCode, body) {
    const json = jest.fn();
    const res = { statusCode, json };
    v2Format({}, res, jest.fn());
    res.json(body);
    return json.mock.calls[0][0];
  }

  test('v2 wraps successful responses', () => {
    expect(formatResponse(200, { items: [] })).toEqual({
      data: { items: [] },
      meta: { version: 'v2' },
    });
  });

  test('v2 errors preserve machine codes and useful messages', () => {
    expect(formatResponse(404, {
      error: 'not_found',
      message: 'Route GET /missing does not exist.',
    })).toEqual({
      error: {
        code: 'not_found',
        message: 'Route GET /missing does not exist.',
      },
      meta: { version: 'v2' },
    });
  });

  test('v2 errors use a status-based code when only a message is available', () => {
    expect(formatResponse(500, {
      error: 'Something went wrong.',
    })).toEqual({
      error: {
        code: 'http_500',
        message: 'Something went wrong.',
      },
      meta: { version: 'v2' },
    });
  });
});

afterAll(async () => {
  try {
    const db = require('../db');
    if (db && typeof db.end === 'function') await db.end();
    else if (db && db.pool && typeof db.pool.end === 'function') await db.pool.end();
  } catch (e) {
    // Already closed.
  }
});
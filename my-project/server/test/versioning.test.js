const request = require('supertest');
const app = require('../index');
const v2Format = require('../middleware/v2Format');

describe('versioning', () => {
  test('v1 remains unwrapped and advertises deprecation', async () => {
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

  test('v2 errors include metadata and are not deprecated', async () => {
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

  test('v2 errors preserve the machine code and useful message', () => {
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
    expect(formatResponse(500, { error: 'Something went wrong.' })).toEqual({
      error: {
        code: 'http_500',
        message: 'Something went wrong.',
      },
      meta: { version: 'v2' },
    });
  });
});

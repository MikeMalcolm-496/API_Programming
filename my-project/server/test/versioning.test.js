// npm install --save-dev supertest   (jest is already in your project)
// ADAPT: export your Express app from app.js (module.exports = app) and set a real GET path + key header.
const request = require('supertest');
const app = require('../app');

const PATH = '/claims';                                  // any existing GET endpoint
const AUTH = { 'X-API-Key': process.env.TEST_API_KEY };  // ADAPT to how your API checks keys

describe('versioning', () => {
  test('v1 still works and is marked deprecated', async () => {
    const res = await request(app).get(`/api/v1${PATH}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBeDefined();
    expect(res.headers['link']).toMatch(/successor-version/);
    expect(res.body.data).toBeUndefined();               // v1 shape: no wrapper
  });

  test('v2 returns the new shape and is not deprecated', async () => {
    const res = await request(app).get(`/api/v2${PATH}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBeUndefined();
    expect(res.body.data).toBeDefined();
    expect(res.body.meta.version).toBe('v2');
  });

  test('v2 errors use the new error format', async () => {
    const res = await request(app).get(`/api/v2${PATH}`);   // no key
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(401);
  });
});

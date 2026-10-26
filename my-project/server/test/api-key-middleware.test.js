jest.mock('../lib/apiKeys', () => ({
  verifyKey: jest.fn(),
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { verifyKey } = require('../lib/apiKeys');
const { requireApiKey, optionalApiKey, staffOrApiKey } = require('../middleware/apiKey');
const server = require('../index');

function appWith(middleware) {
  const app = express();
  app.get('/resource', middleware, (req, res) => {
    res.json({ apiKey: req.apiKey || null, user: req.user || null });
  });
  return app;
}

describe('API-key middleware', () => {
  beforeEach(() => {
    process.env.API_KEY_MODE = 'required';
    process.env.JWT_SECRET = 'test-secret';
    verifyKey.mockReset();
  });

  it('requires a key for protected routes', async () => {
    const response = await request(appWith(requireApiKey('items:batch'))).get('/resource');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('unauthorized');
    expect(response.body.message).toMatch(/API key required/);
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/health'],
    ['GET', '/found-items'],
    ['GET', '/found-items/00000000-0000-4000-8000-000000000000'],
    ['POST', '/found-items/batch-lookup'],
    ['POST', '/flagged-checks'],
  ])('requires an API key for documented endpoint %s %s', async (method, endpoint) => {
    const response = await request(server)[method.toLowerCase()](endpoint);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('unauthorized');
    expect(response.body.message).toMatch(/API key required/);
  });

  it('allows public routes without a key', async () => {
    const response = await request(appWith(optionalApiKey('items:read'))).get('/resource');
    expect(response.status).toBe(200);
    expect(response.body.apiKey).toBeNull();
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it('verifies modified key strings through the API-key library', async () => {
    verifyKey.mockResolvedValue({
      key: { id: 'key-id', name: 'integration', keyPrefix: 'custom_', scopes: ['items:batch'] },
    });
    const response = await request(appWith(requireApiKey('items:batch')))
      .get('/resource')
      .set('X-API-Key', 'custom-key-value');
    expect(response.status).toBe(200);
    expect(response.body.apiKey.id).toBe('key-id');
    expect(verifyKey).toHaveBeenCalledWith('custom-key-value');
  });

  it('rejects keys without the required scope', async () => {
    verifyKey.mockResolvedValue({
      key: { id: 'key-id', name: 'read-only', keyPrefix: 'custom_', scopes: ['items:read'] },
    });
    const response = await request(appWith(requireApiKey('items:batch')))
      .get('/resource')
      .set('X-API-Key', 'custom-key-value');
    expect(response.status).toBe(403);
  });

  it('allows staff JWTs on staff-or-key routes', async () => {
    const token = jwt.sign({ sub: 'staff-id', role: 'security' }, process.env.JWT_SECRET);
    const response = await request(appWith(staffOrApiKey('claims:verify')))
      .get('/resource')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('security');
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it('skips API-key checks when API_KEY_MODE is off', async () => {
    process.env.API_KEY_MODE = 'off';
    const response = await request(appWith(requireApiKey('items:batch'))).get('/resource');
    expect(response.status).toBe(200);
    expect(verifyKey).not.toHaveBeenCalled();
  });
});

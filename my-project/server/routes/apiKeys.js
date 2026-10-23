// API key management.
//   Admin only (logged-in admin JWT):
//     POST   /admin/api-keys              { name, scopes?, expiresInDays? }  -> 201 { apiKey, ...record }  (apiKey shown ONCE)
//     GET    /admin/api-keys              list (never includes the secret)
//     POST   /admin/api-keys/:id/rotate   new key, old one revoked
//     DELETE /admin/api-keys/:id          revoke
//   Any valid key:
//     GET    /api-keys/me                 "who am I?" check for partners testing their key
const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireApiKey } = require('../middleware/apiKey');
const keys = require('../lib/apiKeys');
const { fail, serverError } = require('../lib/shared');

const router = express.Router();
const adminOnly = [authenticate, requireRole('admin')];

const handle = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    if (err.status) return fail(res, err.status, err.status === 409 ? 'conflict' : 'invalid_request', err.message);
    return serverError(res, err);
  }
};

router.post('/admin/api-keys', adminOnly, handle(async (req, res) => {
  const b = req.body || {};
  const { apiKey, record } = await keys.createKey({
    name: b.name, scopes: b.scopes, expiresInDays: b.expiresInDays, createdBy: req.user.id,
  });
  return res.status(201).json({
    apiKey,
    ...record,
    warning: 'Copy this key now. It is stored only as a hash and cannot be shown again.',
  });
}));

router.get('/admin/api-keys', adminOnly, handle(async (req, res) => res.json(await keys.listKeys())));

router.get('/admin/api-keys/scopes', adminOnly, (req, res) => res.json(keys.SCOPES));

router.post('/admin/api-keys/:id/rotate', adminOnly, handle(async (req, res) => {
  const fresh = await keys.rotateKey(req.params.id, req.user.id);
  if (!fresh) return fail(res, 404, 'not_found', `No API key with id or prefix ${req.params.id}.`);
  return res.status(201).json({ apiKey: fresh.apiKey, ...fresh.record, warning: 'Old key revoked. Copy this new key now.' });
}));

router.delete('/admin/api-keys/:id', adminOnly, handle(async (req, res) => {
  const k = await keys.revokeKey(req.params.id);
  if (!k) return fail(res, 404, 'not_found', `No API key with id or prefix ${req.params.id}.`);
  return res.json(k);
}));

router.get('/api-keys/me', requireApiKey(), (req, res) => {
  if (!req.apiKey) return fail(res, 400, 'invalid_request', 'API key checking is turned off (API_KEY_MODE=off).');
  const { id, name, keyPrefix, scopes, expiresAt, lastUsedAt, usageCount } = req.apiKey;
  return res.json({ id, name, keyPrefix, scopes, expiresAt, lastUsedAt, usageCount });
});

module.exports = router;

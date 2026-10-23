// API key middleware for machine-to-machine callers (partner teams, scripts).
//
//   requireApiKey('items:batch')     key must be present, valid and carry the scope
//   optionalApiKey('items:read')     no key = allowed (public browser UI); a key that IS sent must be valid
//   staffOrApiKey('claims:verify')   a logged-in security/admin (Bearer JWT) OR an API key with the scope
//
// The key is read from the `X-API-Key` header (or `Authorization: ApiKey <key>`).
// Never put keys in the URL: URLs end up in logs and browser history.
//
// API_KEY_MODE in .env:  required (default)  |  off  (turns checking off, e.g. for an old partner test run)
// API_KEY_RATE_LIMIT in .env: requests per minute per key (default 120).

const { verifyKey } = require('../lib/apiKeys');
const { authenticate, requireRole } = require('./auth');
const { fail, serverError } = require('../lib/shared');

const mode = () => (process.env.API_KEY_MODE || 'required').toLowerCase();
const limitPerMinute = () => Number(process.env.API_KEY_RATE_LIMIT) || 120;

function readKey(req) {
  const header = req.get('x-api-key');
  if (header) return header.trim();
  const [scheme, value] = (req.get('authorization') || '').split(' ');
  if (scheme && scheme.toLowerCase() === 'apikey' && value) return value.trim();
  return null;
}

// Simple fixed-window rate limit kept in memory, per key id.
const windows = new Map();
function rateLimited(keyId, res) {
  const now = Date.now();
  const slot = Math.floor(now / 60000);
  const w = windows.get(keyId);
  const cur = w && w.slot === slot ? w : { slot, count: 0 };
  cur.count += 1;
  windows.set(keyId, cur);
  const limit = limitPerMinute();
  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, limit - cur.count)));
  if (cur.count > limit) {
    res.set('Retry-After', String(60 - Math.floor((now % 60000) / 1000)));
    return true;
  }
  return false;
}

const MESSAGES = {
  missing: 'Missing API key. Send it in the X-API-Key header.',
  invalid: 'Invalid API key.',
  revoked: 'This API key has been revoked.',
  expired: 'This API key has expired.',
};

async function check(req, res, next, scope, { optional }) {
  if (mode() === 'off') return next();
  const key = readKey(req);
  if (!key) return optional ? next() : fail(res, 401, 'unauthorized', MESSAGES.missing);
  try {
    const result = await verifyKey(key);
    if (result.error) {
      console.warn(`[api-key] rejected (${result.error}) ${req.method} ${req.path}`);
      return fail(res, 401, 'unauthorized', MESSAGES[result.error]);
    }
    const k = result.key;
    if (scope && !k.scopes.includes(scope)) {
      return fail(res, 403, 'forbidden', `This API key does not have the '${scope}' scope.`);
    }
    if (rateLimited(k.id, res)) return fail(res, 429, 'rate_limited', 'Too many requests for this API key. Try again in a minute.');
    req.apiKey = k; // routes can see which client called: req.apiKey.name
    console.log(`[api-key] ${k.keyPrefix}… (${k.name}) ${req.method} ${req.originalUrl}`);
    return next();
  } catch (err) {
    if (err && err.code === '42P01') {
      console.error('[api-key] api_keys table missing: run migrations/003_api_keys.sql');
    }
    return serverError(res, err);
  }
}

const requireApiKey = (scope) => (req, res, next) => check(req, res, next, scope, { optional: false });
const optionalApiKey = (scope) => (req, res, next) => check(req, res, next, scope, { optional: true });

const staffCheck = [authenticate, requireRole('security', 'admin')];
const staffOrApiKey = (scope) => (req, res, next) => {
  const [scheme] = (req.get('authorization') || '').split(' ');
  if (scheme === 'Bearer') {
    return staffCheck[0](req, res, () => staffCheck[1](req, res, next));
  }
  return check(req, res, next, scope, { optional: false });
};

module.exports = { requireApiKey, optionalApiKey, staffOrApiKey, readKey, _windows: windows };

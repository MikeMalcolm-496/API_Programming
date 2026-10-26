const { verifyKey } = require('../lib/apiKeys');
const { authenticate, requireRole } = require('./auth');

// Read the key from the X-API-Key header (never from the URL: URLs end up in logs)
function readKey(req) {
  const key = req.get('x-api-key');
  return key ? key.trim() : null;
}

function apiKeyModeOff() {
  return (process.env.API_KEY_MODE || 'required').toLowerCase() === 'off';
}

function sendKeyError(res, failure) {
  if (failure.status === 401 && failure.reason !== 'required') {
    console.warn(`[api-key] rejected (${failure.reason})`);
  }
  return res.status(failure.status).json({
    error: failure.status === 401 ? 'unauthorized' : 'forbidden',
    message: failure.message,
  });
}

async function authenticateApiKey(req, scope) {
  const key = readKey(req);
  if (!key) {
    return { failure: { status: 401, reason: 'required', message: 'API key required. Send it in the X-API-Key header.' } };
  }

  const result = await verifyKey(key);
  if (result.error) {
    return { failure: { status: 401, reason: result.error, message: 'Invalid API key.' } };
  }

  const apiKey = result.key;
  if (scope && !apiKey.scopes.includes(scope)) {
    return { failure: { status: 403, reason: 'scope', message: 'This API key is not allowed to do that.' } };
  }

  req.apiKey = apiKey;
  console.log(`[api-key] ${apiKey.keyPrefix}... (${apiKey.name}) ${req.method} ${req.originalUrl}`);
  return { apiKey };
}

function requireApiKey(scope) {
  return async (req, res, next) => {
    if (apiKeyModeOff()) return next();

    try {
      const result = await authenticateApiKey(req, scope);
      if (result.failure) return sendKeyError(res, result.failure);
      return next();
    } catch (err) {
      console.error('[api-key] error:', err.message);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

function optionalApiKey(scope) {
  return async (req, res, next) => {
    if (apiKeyModeOff() || !readKey(req)) return next();

    try {
      const result = await authenticateApiKey(req, scope);
      if (result.failure) return sendKeyError(res, result.failure);
      return next();
    } catch (err) {
      console.error('[api-key] error:', err.message);
      return res.status(500).json({ error: 'Something went wrong.' });
    }
  };
}

function staffOrApiKey(scope) {
  const authorizeStaff = requireRole('security', 'admin');
  return async (req, res, next) => {
    if (apiKeyModeOff()) return next();

    if (readKey(req)) {
      try {
        const result = await authenticateApiKey(req, scope);
        if (!result.failure) return next();
        if (!req.headers.authorization) return sendKeyError(res, result.failure);
      } catch (err) {
        console.error('[api-key] error:', err.message);
        if (!req.headers.authorization) {
          return res.status(500).json({ error: 'Something went wrong.' });
        }
      }
    }

    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'API key required or staff login required.' });
    }

    return authenticate(req, res, (err) => {
      if (err) return next(err);
      return authorizeStaff(req, res, next);
    });
  };
}

module.exports = { requireApiKey, optionalApiKey, staffOrApiKey };
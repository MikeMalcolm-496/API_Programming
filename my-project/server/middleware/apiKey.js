const { verifyKey } = require('../lib/apiKeys');

// Read the key from the X-API-Key header (never from the URL: URLs end up in logs)
function readKey(req) {
  const key = req.get('x-api-key');
  return key ? key.trim() : null;
}

function requireApiKey(scope) {
  return async (req, res, next) => {
    const key = readKey(req);
    if (!key) {
      return res.status(401).json({ error: 'API key required. Send it in the X-API-Key header.' });
    }

    try {
      const result = await verifyKey(key);

      if (result.error) {
        // Real reason goes to our log only; the caller sees one generic message
        console.warn(`[api-key] rejected (${result.error}) ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Invalid API key.' });
      }

      const k = result.key;

      if (scope && !k.scopes.includes(scope)) {
        return res.status(403).json({ error: 'This API key is not allowed to do that.' });
      }

      req.apiKey = k; // downstream code can see who is calling: req.apiKey.id, .name
      console.log(`[api-key] ${k.keyPrefix}... (${k.name}) ${req.method} ${req.originalUrl}`);
      next();
    } catch (err) {
      console.error('[api-key] error:', err.message);
      res.status(500).json({ error: 'Something went wrong.' })
    }
  };
}

module.exports = { requireApiKey };
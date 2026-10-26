const express = require('express');
const cors = require('cors');
const path = require('path');

const fs = require('fs');
const dotenv = require('dotenv');

const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../../Lost_Found_System-main/.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
dotenv.config();

const db = require('./db');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Swagger UI + the contract it loads
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/openapi.yaml', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

// ---- API keys (machine-to-machine access) ----
// Which routes need a key is decided HERE, in one place, so it is easy to see.
const { requireApiKey, optionalApiKey, staffOrApiKey } = require('./middleware/apiKey');
const { rateLimitPerKey } = require('./middleware/rateLimit');
if ((process.env.API_KEY_MODE || 'required').toLowerCase() === 'off') {
  console.warn('[api-key] API_KEY_MODE=off: API keys are NOT being checked.');
}
app.get('/found-items', optionalApiKey('items:read'), rateLimitPerKey);
app.get('/found-items/:itemId', optionalApiKey('items:read'), rateLimitPerKey);
app.post('/found-items/batch-lookup', requireApiKey('items:batch'), rateLimitPerKey);
app.post('/flagged-checks', requireApiKey('checks:write'), rateLimitPerKey);
app.get('/claims/verify', staffOrApiKey('claims:verify'), rateLimitPerKey);       
app.use('/', require('./routes/apiKeys'));

// Week 10: claim verification page + route (consumes the Strathbites API)
app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'verify.html'));
});
app.use('/', require('./routes/claimVerification'));

const foundItemsRoutes = require('./routes/foundItems');
app.use('/', foundItemsRoutes);

app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/staffItems'));
app.use('/', require('./routes/inquiries'));
app.use('/', require('./routes/images'));

// Unknown routes -> JSON 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `Route ${req.method} ${req.path} does not exist.` });
});

// Malformed JSON bodies -> 400; anything else -> 500 (always JSON)
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ error: 'invalid_request', message: 'Request body must be valid JSON.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal_error', message: 'Failed to process the request.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;

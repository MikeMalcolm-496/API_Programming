require('dotenv').config();
const pool = require('../db'); // same import style as lib/apiKeys.js
const { createKey } = require('../lib/apiKeys');

const KEYS = [
  {
    name: 'local-testing',
    scopes: ['items:read', 'items:write'],   // full access for your own tests
    expiresAt: null,                          // never expires
  },
  {
    name: 'consumer-team',                    // rename, e.g. 'consumer-team-11'
    scopes: ['items:read'],                   // least privilege: read only
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  },
];

(async () => {
  for (const k of KEYS) {
    const { rows } = await pool.query(
      'SELECT 1 FROM api_keys WHERE name = $1 AND revoked_at IS NULL',
      [k.name]
    );
    if (rows.length) {
      console.log(`SKIPPED ${k.name}: an active key with this name already exists.`);
      continue;
    }
    const key = await createKey(k);
    console.log(`\n${k.name}  (scopes: ${k.scopes.join(', ')})`);
    console.log(`  KEY: ${key}`);
  }
  console.log('\nCopy the keys now. They are not stored anywhere and cannot be shown again.');
  process.exit();
})();
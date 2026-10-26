
const crypto = require('crypto');
const pool = require('../db'); // adjust if db.js exports { pool }

// 1. Generate: 32 random bytes = 256 bits of entropy, impossible to guess.
function generateKey() {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
}

// 2. Hash: a one-way fingerprint. We store this, never the key itself.
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// 3. Create: insert the hash, return the plaintext ONCE. It can't be recovered later.
async function createKey({ name, scopes = [], expiresAt = null }) {
  const key = generateKey();
  await pool.query(
    `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [name, key.slice(0, 8), hashKey(key), scopes, expiresAt]
  );
  return key;
}

// 4. Verify: hash what the caller sent, look it up, check its status.
async function verifyKey(key) {
  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, scopes, expires_at, revoked_at
     FROM api_keys WHERE key_hash = $1`,
    [hashKey(key)]
  );
  const row = rows[0];
  if (!row) return { error: 'invalid' };
  if (row.revoked_at) return { error: 'revoked' };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: 'expired' };
  return {
    key: { id: row.id, name: row.name, keyPrefix: row.key_prefix, scopes: row.scopes },
  };
}

// 5. Revoke: switch a key off without deleting its row.
async function revokeKey(keyPrefix) {
  await pool.query(
    `UPDATE api_keys SET revoked_at = now()
     WHERE key_prefix = $1 AND revoked_at IS NULL`,
    [keyPrefix]
  );
}

module.exports = { generateKey, hashKey, createKey, verifyKey, revokeKey };
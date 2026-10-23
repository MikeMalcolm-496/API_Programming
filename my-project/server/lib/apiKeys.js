// API key generation, storage and checking.
//
// A key looks like:  lfk_live_3q2Zx9...  (lfk = Lost & Found key)
//   - 32 random bytes from the OS crypto generator, base64url encoded
//   - shown to the person ONCE when it is created
//   - stored only as a SHA-256 hash, so a database leak does not leak usable keys
//   - the first 16 characters (key_prefix) are stored in clear so humans can
//     tell keys apart in lists and logs without seeing the secret part

const crypto = require('crypto');
const db = require('../db');

const KEY_PREFIX = 'lfk_live_';
const PREFIX_LEN = 16;
const SCOPES = {
  'items:read': 'GET /found-items and GET /found-items/{itemId}',
  'items:batch': 'POST /found-items/batch-lookup',
  'checks:write': 'POST /flagged-checks',
  'claims:verify': 'GET /claims/verify (Strathbites claim check)',
};
const DEFAULT_SCOPES = ['items:read', 'items:batch', 'checks:write'];

const hashKey = (key) => crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
const generateKey = () => `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
const looksLikeKey = (k) => typeof k === 'string' && k.startsWith(KEY_PREFIX) && k.length >= 40 && k.length <= 80;

const publicKey = (r) => ({
  id: r.id,
  name: r.name,
  keyPrefix: r.key_prefix,
  scopes: r.scopes,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  lastUsedAt: r.last_used_at,
  usageCount: Number(r.usage_count),
  status: r.revoked_at ? 'revoked' : (r.expires_at && new Date(r.expires_at) <= new Date() ? 'expired' : 'active'),
});

function validateScopes(scopes) {
  const list = scopes === undefined ? DEFAULT_SCOPES : scopes;
  if (!Array.isArray(list) || list.length === 0) return { error: 'scopes must be a non-empty array.' };
  const bad = list.filter((s) => !SCOPES[s]);
  if (bad.length) return { error: `Unknown scope(s): ${bad.join(', ')}. Allowed: ${Object.keys(SCOPES).join(', ')}.` };
  return { value: [...new Set(list)] };
}

// Returns { apiKey: '<plaintext, show once>', record: {...} }
async function createKey({ name, scopes, expiresInDays, createdBy = null }) {
  if (typeof name !== 'string' || !name.trim()) throw Object.assign(new Error('name is required.'), { status: 400 });
  const sc = validateScopes(scopes);
  if (sc.error) throw Object.assign(new Error(sc.error), { status: 400 });
  let expiresAt = null;
  if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays !== '') {
    const d = Number(expiresInDays);
    if (!Number.isInteger(d) || d < 1 || d > 3650) throw Object.assign(new Error('expiresInDays must be a whole number from 1 to 3650.'), { status: 400 });
    expiresAt = new Date(Date.now() + d * 86400000);
  }
  const apiKey = generateKey();
  const { rows } = await db.query(
    `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, created_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name.trim(), apiKey.slice(0, PREFIX_LEN), hashKey(apiKey), sc.value, createdBy, expiresAt]);
  return { apiKey, record: publicKey(rows[0]) };
}

async function listKeys() {
  const { rows } = await db.query('SELECT * FROM api_keys ORDER BY created_at DESC');
  return rows.map(publicKey);
}

// idOrPrefix: the key's uuid, or its prefix (lfk_live_AbCdEfG)
async function findKey(idOrPrefix) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrPrefix);
  const { rows } = await db.query(
    isUuid ? 'SELECT * FROM api_keys WHERE id = $1' : 'SELECT * FROM api_keys WHERE key_prefix = $1',
    [idOrPrefix]);
  if (rows.length > 1) throw Object.assign(new Error('More than one key has that prefix; use the id.'), { status: 409 });
  return rows[0] || null;
}

async function revokeKey(idOrPrefix) {
  const k = await findKey(idOrPrefix);
  if (!k) return null;
  const { rows } = await db.query(
    'UPDATE api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING *', [k.id]);
  return publicKey(rows[0]);
}

// Rotate = issue a new key with the same name/scopes/expiry window, revoke the old one.
async function rotateKey(idOrPrefix, createdBy = null) {
  const old = await findKey(idOrPrefix);
  if (!old) return null;
  const days = old.expires_at ? Math.max(1, Math.ceil((new Date(old.expires_at) - new Date(old.created_at)) / 86400000)) : undefined;
  const fresh = await createKey({ name: old.name, scopes: old.scopes, expiresInDays: days, createdBy });
  await revokeKey(old.id);
  return fresh;
}

// Checks a key sent by a client. Returns { key } or { error: 'invalid' | 'revoked' | 'expired' }.
// The successful lookup also bumps last_used_at / usage_count in the same query.
async function verifyKey(plaintext) {
  if (!looksLikeKey(plaintext)) return { error: 'invalid' };
  const hash = hashKey(plaintext);
  const { rows } = await db.query(
    `UPDATE api_keys SET last_used_at = now(), usage_count = usage_count + 1
      WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      RETURNING *`, [hash]);
  if (rows.length) return { key: publicKey(rows[0]) };
  const why = await db.query('SELECT revoked_at, expires_at FROM api_keys WHERE key_hash = $1', [hash]);
  if (!why.rows.length) return { error: 'invalid' };
  return { error: why.rows[0].revoked_at ? 'revoked' : 'expired' };
}

module.exports = {
  SCOPES, DEFAULT_SCOPES, KEY_PREFIX, generateKey, hashKey, createKey, listKeys, findKey, revokeKey, rotateKey, verifyKey, publicKey,
};

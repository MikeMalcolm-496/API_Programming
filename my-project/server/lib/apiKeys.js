
// API key generation, storage and checking.
//
// A key looks like: lfk_live_3q2Zx9...
// - Generated using 32 random bytes.
// - Shown to the person only once when created.
// - Stored as a SHA-256 hash.
// - The key prefix is stored to help identify keys in lists.

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

const KEY_COLUMNS = `
  id,
  name,
  key_prefix,
  key_hash,
  scopes,
  created_at,
  created_by_user_id,
  expires_at,
  revoked_at,
  last_used_at,
  usage_count
`;

const hashKey = (key) =>
  crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');

const generateKey = () =>
  `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;

const looksLikeKey = (k) =>
  typeof k === 'string' &&
  k.startsWith(KEY_PREFIX) &&
  k.length >= 40 &&
  k.length <= 80;

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
  status: r.revoked_at
    ? 'revoked'
    : r.expires_at && new Date(r.expires_at) <= new Date()
      ? 'expired'
      : 'active',
});

function validateScopes(scopes) {
  const list = scopes === undefined ? DEFAULT_SCOPES : scopes;

  if (!Array.isArray(list) || list.length === 0) {
    return { error: 'scopes must be a non-empty array.' };
  }

  const bad = list.filter((s) => !SCOPES[s]);

  if (bad.length) {
    return {
      error: `Unknown scope(s): ${bad.join(', ')}. Allowed: ${Object.keys(SCOPES).join(', ')}.`,
    };
  }

  return { value: [...new Set(list)] };
}

// Returns the plaintext API key once, alongside its public record.
async function createKey({ name, scopes, expiresInDays, createdBy = null }) {
  if (typeof name !== 'string' || !name.trim()) {
    throw Object.assign(new Error('name is required.'), { status: 400 });
  }

  const sc = validateScopes(scopes);

  if (sc.error) {
    throw Object.assign(new Error(sc.error), { status: 400 });
  }

  let expiresAt = null;

  if (
    expiresInDays !== undefined &&
    expiresInDays !== null &&
    expiresInDays !== ''
  ) {
    const d = Number(expiresInDays);

    if (!Number.isInteger(d) || d < 1 || d > 3650) {
      throw Object.assign(
        new Error('expiresInDays must be a whole number from 1 to 3650.'),
        { status: 400 }
      );
    }

    expiresAt = new Date(Date.now() + d * 86400000);
  }

  const apiKey = generateKey();

  const { rows } = await pool.query(
    `INSERT INTO api_keys
       (name, key_prefix, key_hash, scopes, created_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, key_hash, scopes, created_at,
               created_by_user_id, expires_at, revoked_at,
               last_used_at, usage_count`,
    [
      name.trim(),
      apiKey.slice(0, PREFIX_LEN),
      hashKey(apiKey),
      sc.value,
      createdBy,
      expiresAt,
    ]
  );

  return { apiKey, record: publicKey(rows[0]) };
}

async function listKeys() {
  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, scopes, created_at,
            created_by_user_id, expires_at, revoked_at,
            last_used_at, usage_count
       FROM api_keys
      ORDER BY created_at DESC`
  );

  return rows.map(publicKey);
}

// idOrPrefix: the key's UUID or its prefix.
async function findKey(idOrPrefix) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrPrefix);

  const { rows } = await pool.query(
    isUuid
      ? `SELECT ${KEY_COLUMNS} FROM api_keys WHERE id = $1`
      : `SELECT ${KEY_COLUMNS} FROM api_keys WHERE key_prefix = $1`,
    [idOrPrefix]
  );

  if (rows.length > 1) {
    throw Object.assign(
      new Error('More than one key has that prefix; use the id.'),
      { status: 409 }
    );
  }

  return rows[0] || null;
}

async function revokeKey(idOrPrefix) {
  const k = await findKey(idOrPrefix);

  if (!k) return null;

  const { rows } = await pool.query(
    `UPDATE api_keys
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = $1
      RETURNING id, name, key_prefix, scopes, created_at,
                created_by_user_id, expires_at, revoked_at,
                last_used_at, usage_count`,
    [k.id]
  );

  return publicKey(rows[0]);
}

// Rotation issues a new key and revokes the old one.
async function rotateKey(idOrPrefix, createdBy = null) {
  const old = await findKey(idOrPrefix);

  if (!old) return null;

  const days = old.expires_at
    ? Math.max(
        1,
        Math.ceil(
          (new Date(old.expires_at) - new Date(old.created_at)) / 86400000
        )
      )
    : undefined;

  const fresh = await createKey({
    name: old.name,
    scopes: old.scopes,
    expiresInDays: days,
    createdBy,
  });

  await revokeKey(old.id);

  return fresh;
}

// Verifies a submitted API key and updates its usage information.
async function verifyKey(plaintext) {
  if (!looksLikeKey(plaintext)) {
    return { error: 'invalid' };
  }

  const hash = hashKey(plaintext);

  const { rows } = await pool.query(
    `UPDATE api_keys
        SET last_used_at = now(),
            usage_count = usage_count + 1
      WHERE key_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      RETURNING ${KEY_COLUMNS}`,
    [hash]
  );

  if (rows.length) {
    return { key: publicKey(rows[0]) };
  }

  const why = await pool.query(
    `SELECT revoked_at, expires_at
       FROM api_keys
      WHERE key_hash = $1`,
    [hash]
  );

  if (!why.rows.length) {
    return { error: 'invalid' };
  }

  return {
    error: why.rows[0].revoked_at ? 'revoked' : 'expired',
  };
}

module.exports = {
  SCOPES,
  DEFAULT_SCOPES,
  KEY_PREFIX,
  generateKey,
  hashKey,
  createKey,
  listKeys,
  findKey,
  revokeKey,
  rotateKey,
  verifyKey,
  publicKey,
};



// API key generation, storage and checking.
//
// A key looks like: lfk_live_3q2Zx9...
// - Generated using 32 random bytes.
// - Shown to the person only once when created.
// - Stored as a SHA-256 hash.
// - The key prefix is stored to help identify keys in lists.

const crypto = require('crypto');
const pool = require('../db');

const KEY_PREFIX = 'lfk_live_';
const PREFIX_LEN = 16;
const KEY_PATTERN = /^lfk_live_[A-Za-z0-9_-]{43}$/;

const SCOPES = {
  'items:read': 'GET /found-items and GET /found-items/{itemId}',
  'items:batch': 'POST /found-items/batch-lookup',
  'checks:write': 'POST /flagged-checks',
  'claims:verify': 'GET /claims/verify (Strathbites claim check)',
};

const DEFAULT_SCOPES = ['items:read', 'items:batch', 'checks:write'];
const NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
]);

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

async function insertKeyViaSupabaseRest(apiKey, { name, scopes, createdBy, expiresAt }) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase REST fallback requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const url = new URL('/rest/v1/api_keys', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'id,name,key_prefix,scopes,created_at,created_by_user_id,expires_at,revoked_at,last_used_at,usage_count'
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      name,
      key_prefix: apiKey.slice(0, PREFIX_LEN),
      key_hash: hashKey(apiKey),
      scopes,
      created_by_user_id: createdBy,
      expires_at: expiresAt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase REST fallback failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) {
    throw new Error('Supabase REST fallback did not return the created API key record.');
  }
  return rows[0];
}

async function listKeysViaSupabaseRest() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase REST fallback requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const url = new URL('/rest/v1/api_keys', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'id,name,key_prefix,scopes,created_at,created_by_user_id,expires_at,revoked_at,last_used_at,usage_count'
  );
  url.searchParams.set('order', 'created_at.desc');

  const keys = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'count=exact',
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase REST fallback failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error('Supabase REST fallback returned an invalid API key list.');
    }
    keys.push(...rows);

    const contentRange = response.headers.get('content-range');
    const total = contentRange && Number(contentRange.split('/')[1]);
    if (Number.isFinite(total)) {
      offset += rows.length;
      if (offset >= total || rows.length === 0) break;
    } else {
      if (rows.length < pageSize) break;
      offset += rows.length;
    }
  }

  return keys.map(publicKey);
}

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

async function findKeyViaSupabaseRest(idOrPrefix) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase REST fallback requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const url = new URL('/rest/v1/api_keys', SUPABASE_URL);
  url.searchParams.set(
    'select',
    'id,name,key_prefix,scopes,created_at,created_by_user_id,expires_at,revoked_at,last_used_at,usage_count'
  );
  url.searchParams.set(/^[0-9a-f-]{36}$/i.test(idOrPrefix) ? 'id' : 'key_prefix', `eq.${idOrPrefix}`);
  url.searchParams.set('limit', '2');

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase REST fallback failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Supabase REST fallback returned an invalid API key record.');
  }
  if (rows.length > 1) {
    throw Object.assign(new Error('More than one key has that prefix; use the id.'), { status: 409 });
  }
  return rows[0] || null;
}

async function revokeKeyViaSupabaseRest(id) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase REST fallback requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const url = new URL('/rest/v1/api_keys', SUPABASE_URL);
  url.searchParams.set('id', `eq.${id}`);
  url.searchParams.set(
    'select',
    'id,name,key_prefix,scopes,created_at,created_by_user_id,expires_at,revoked_at,last_used_at,usage_count'
  );

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    throw new Error(`Supabase REST fallback failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Supabase REST fallback did not return the revoked API key record.');
  }
  if (!rows[0]) {
    const existing = await findKeyViaSupabaseRest(id);
    if (existing) return existing;
    throw new Error('Supabase REST fallback did not return the revoked API key record.');
  }
  return rows[0];
}

const looksLikeKey = (k) => typeof k === 'string' && KEY_PATTERN.test(k);

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
async function createKey({
  name,
  scopes,
  expiresInDays,
  createdBy = null,
  useSupabaseFallback = false,
}) {
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

  let record;
  try {
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
    record = rows[0];
  } catch (error) {
    if (!useSupabaseFallback || !NETWORK_ERROR_CODES.has(error.code)) throw error;
    console.warn('[api-key] PostgreSQL is unreachable; creating the key through Supabase REST.');
    record = await insertKeyViaSupabaseRest(apiKey, {
      name: name.trim(),
      scopes: sc.value,
      createdBy,
      expiresAt,
    });
  }

  return { apiKey, record: publicKey(record) };
}

async function listKeys({ useSupabaseFallback = false } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, key_prefix, scopes, created_at,
              created_by_user_id, expires_at, revoked_at,
              last_used_at, usage_count
         FROM api_keys
        ORDER BY created_at DESC`
    );
    return rows.map(publicKey);
  } catch (error) {
    if (!useSupabaseFallback || !NETWORK_ERROR_CODES.has(error.code)) throw error;
    console.warn('[api-key] PostgreSQL is unreachable; listing keys through Supabase REST.');
    return listKeysViaSupabaseRest();
  }
}

// idOrPrefix: the key's UUID or its prefix.
async function findKey(idOrPrefix, { useSupabaseFallback = false } = {}) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrPrefix);
  let rows;
  try {
    ({ rows } = await pool.query(
      isUuid
        ? `SELECT ${KEY_COLUMNS} FROM api_keys WHERE id = $1`
        : `SELECT ${KEY_COLUMNS} FROM api_keys WHERE key_prefix = $1`,
      [idOrPrefix]
    ));
  } catch (error) {
    if (!useSupabaseFallback || !NETWORK_ERROR_CODES.has(error.code)) throw error;
    console.warn('[api-key] PostgreSQL is unreachable; looking up the key through Supabase REST.');
    const record = await findKeyViaSupabaseRest(idOrPrefix);
    rows = record ? [record] : [];
  }

  if (rows.length > 1) {
    throw Object.assign(
      new Error('More than one key has that prefix; use the id.'),
      { status: 409 }
    );
  }

  return rows[0] || null;
}

async function revokeKey(idOrPrefix, { useSupabaseFallback = false } = {}) {
  const k = await findKey(idOrPrefix, { useSupabaseFallback });

  if (!k) return null;

  let rows;
  try {
    ({ rows } = await pool.query(
      `UPDATE api_keys
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1
        RETURNING id, name, key_prefix, scopes, created_at,
                  created_by_user_id, expires_at, revoked_at,
                  last_used_at, usage_count`,
      [k.id]
    ));
  } catch (error) {
    if (!useSupabaseFallback || !NETWORK_ERROR_CODES.has(error.code)) throw error;
    console.warn('[api-key] PostgreSQL is unreachable; revoking the key through Supabase REST.');
    const record = await revokeKeyViaSupabaseRest(k.id);
    rows = [record];
  }

  return publicKey(rows[0]);
}

// Rotation issues a new key and revokes the old one.
async function rotateKey(idOrPrefix, { createdBy = null, useSupabaseFallback = false } = {}) {
  const old = await findKey(idOrPrefix, { useSupabaseFallback });

  if (!old) return null;

  const scopes = old.scopes.filter((scope) => Object.hasOwn(SCOPES, scope));
  if (!scopes.length) {
    throw Object.assign(
      new Error('This legacy key has no supported scopes; revoke it and create a replacement with current scopes.'),
      { status: 400 }
    );
  }

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
    scopes,
    expiresInDays: days,
    createdBy,
    useSupabaseFallback,
  });

  try {
    await revokeKey(old.id, { useSupabaseFallback });
  } catch (error) {
    throw Object.assign(new Error(error.message, { cause: error }), { replacement: fresh });
  }

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
  KEY_PATTERN,
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

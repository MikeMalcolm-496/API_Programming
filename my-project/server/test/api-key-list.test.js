jest.mock('../db', () => ({
  query: jest.fn(),
}));

const pool = require('../db');
const { generateKey, listKeys, rotateKey, verifyKey } = require('../lib/apiKeys');

const record = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Team integration',
  key_prefix: 'lfk_live_example',
  scopes: ['items:read'],
  created_at: '2026-10-29T05:00:00.000Z',
  created_by_user_id: null,
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  usage_count: '0',
  ...overrides,
});

const response = (rows, contentRange = `${rows.length ? 0 : '*' }-${rows.length - 1}/${rows.length}`) => ({
  ok: true,
  headers: { get: (name) => name === 'content-range' ? contentRange : null },
  json: async () => rows,
});

const mutationResponse = (rows) => ({
  ok: true,
  json: async () => rows,
});

describe('list API keys', () => {
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;

  beforeEach(() => {
    pool.query.mockReset();
    global.fetch = jest.fn();
    process.env.SUPABASE_URL = 'https://project.example.test';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-role-key';
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
  });

  it('lists key metadata from PostgreSQL without exposing key hashes', async () => {
    pool.query.mockResolvedValue({ rows: [record()] });

    const keys = await listKeys();

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      name: 'Team integration',
      keyPrefix: 'lfk_live_example',
      scopes: ['items:read'],
      status: 'active',
      usageCount: 0,
    });
    expect(keys[0]).not.toHaveProperty('key_hash');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to paginated Supabase REST metadata after a PostgreSQL timeout', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('database timeout'), { code: 'ETIMEDOUT' }));
    global.fetch
      .mockResolvedValueOnce(response([record()], '0-0/2'))
      .mockResolvedValueOnce(response([record({
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Read only',
        key_prefix: 'lfk_live_readonly',
      })], '1-1/2'));

    const keys = await listKeys({ useSupabaseFallback: true });

    expect(keys).toHaveLength(2);
    expect(keys.map((key) => key.name)).toEqual(['Team integration', 'Read only']);
    expect(keys[0]).not.toHaveProperty('key_hash');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers.apikey).toBe('test-service-role-key');
    expect(global.fetch.mock.calls[0][1].headers.Range).toBe('0-999');
    expect(global.fetch.mock.calls[1][1].headers.Range).toBe('1-1000');
    expect(global.fetch.mock.calls[0][0].searchParams.get('select')).not.toContain('key_hash');
  });

  it('does not use REST fallback for non-network database errors', async () => {
    pool.query.mockRejectedValue(Object.assign(new Error('missing api_keys table'), { code: '42P01' }));

    await expect(listKeys({ useSupabaseFallback: true })).rejects.toThrow('missing api_keys table');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('generates and accepts only keys in the documented format', async () => {
    expect(generateKey()).toMatch(/^lfk_live_[A-Za-z0-9_-]{43}$/);
    await expect(verifyKey('lfk_live_too-short')).resolves.toEqual({ error: 'invalid' });
    await expect(verifyKey(`lfk_live_${'a'.repeat(43)}!`)).resolves.toEqual({ error: 'invalid' });
    await expect(verifyKey(`sk_${'a'.repeat(43)}`)).resolves.toEqual({ error: 'invalid' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('replaces a legacy key with a current-format key and revokes the old record', async () => {
    const old = record({
      key_prefix: 'sk_legacy',
      scopes: ['items:read', 'items:write'],
    });
    const replacement = record({
      id: '00000000-0000-4000-8000-000000000002',
      name: old.name,
      key_prefix: 'lfk_live_newkeys',
      scopes: ['items:read'],
    });
    const revoked = { ...old, revoked_at: '2026-10-29T05:30:00.000Z' };
    pool.query.mockRejectedValue(Object.assign(new Error('database timeout'), { code: 'ETIMEDOUT' }));
    global.fetch
      .mockResolvedValueOnce(mutationResponse([old]))
      .mockResolvedValueOnce(mutationResponse([replacement]))
      .mockResolvedValueOnce(mutationResponse([old]))
      .mockResolvedValueOnce(mutationResponse([revoked]));

    const rotated = await rotateKey(old.id, { useSupabaseFallback: true });

    expect(rotated.record.keyPrefix).toMatch(/^lfk_live_[A-Za-z0-9_-]{7}$/);
    expect(rotated.record.scopes).toEqual(['items:read']);
    expect(rotated.apiKey).toMatch(/^lfk_live_[A-Za-z0-9_-]{43}$/);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(global.fetch.mock.calls[0][0].searchParams.get('id')).toBe(`eq.${old.id}`);
    expect(global.fetch.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).scopes).toEqual(['items:read']);
    expect(global.fetch.mock.calls[3][1].method).toBe('PATCH');
    expect(global.fetch.mock.calls[3][0].searchParams.get('id')).toBe(`eq.${old.id}`);
  });
});

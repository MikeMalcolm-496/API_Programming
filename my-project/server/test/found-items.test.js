const { api, CATEGORIES, MISSING_UUID, expectFoundItem, expectError } = require('./helpers');

describe('GET /found-items', () => {
  it('happy path: 200, array of correctly shaped items', async () => {
    const res = await api().get('/found-items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(expectFoundItem);
  });
  it('category filter returns only that category', async () => {
    const res = await api().get('/found-items?category=electronics');
    expect(res.status).toBe(200);
    res.body.forEach((i) => { expectFoundItem(i); expect(i.category).toBe('electronics'); });
  });
  it('every valid category is accepted', async () => {
    for (const c of CATEGORIES) {
      const res = await api().get(`/found-items?category=${c}`);
      expect(res.status).toBe(200);
    }
  });
  it('keyword filter returns items whose description contains it', async () => {
    const res = await api().get('/found-items?keyword=umbrella');
    expect(res.status).toBe(200);
    res.body.forEach((i) => expect(i.description.toLowerCase()).toContain('umbrella'));
  });
  it('updatedSince with a valid timestamp returns 200 and an array', async () => {
    const res = await api().get('/found-items?updatedSince=2026-08-12T00:00:00Z');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('edge: updatedSince far in the future returns an empty array', async () => {
    const res = await api().get('/found-items?updatedSince=2999-01-01T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  it('edge: keyword matching nothing returns an empty array', async () => {
    const res = await api().get('/found-items?keyword=zzzzqqqq_nothing');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  it('validation: unrecognised category -> 400 with error body', async () => {
    const res = await api().get('/found-items?category=spaceships');
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('validation: malformed updatedSince -> 400 with error body', async () => {
    const res = await api().get('/found-items?updatedSince=not-a-date');
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('read-only: POST/PUT/DELETE on /found-items are not supported', async () => {
    for (const m of ['post', 'put', 'delete']) {
      const res = await api()[m]('/found-items').send({});
      expect([404, 405]).toContain(res.status);
    }
  });
});

describe('GET /found-items/:itemId', () => {
  it('happy path: returns the item matching the requested id', async () => {
    const list = await api().get('/found-items');
    if (!list.body.length) return console.warn('No seed data: happy-path test skipped');
    const id = list.body[0].itemId;
    const res = await api().get(`/found-items/${id}`);
    expect(res.status).toBe(200);
    expectFoundItem(res.body);
    expect(res.body.itemId).toBe(id);
  });
  it('404 for a well-formed uuid that does not exist', async () => {
    const res = await api().get(`/found-items/${MISSING_UUID}`);
    expect(res.status).toBe(404);
    expectError(res);
    expect(res.body.error).toBe('not_found');
  });
  it('edge: malformed id is rejected with a 4xx error body (contract is silent: 400 vs 404)', async () => {
    const res = await api().get('/found-items/not-a-uuid');
    expect([400, 404]).toContain(res.status);
    expectError(res);
  });
});

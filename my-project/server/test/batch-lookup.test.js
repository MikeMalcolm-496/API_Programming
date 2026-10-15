const { api, expectFoundItem, expectError } = require('./helpers');

describe('POST /found-items/batch-lookup', () => {
  it('happy path: one result per submitted id, in the same order', async () => {
    const ids = ['inv-5501', 'inv-5502', 'inv-5503'];
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: ids });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results).toHaveLength(ids.length);
    res.body.results.forEach((r, n) => {
      expect(r.inventoryItemId).toBe(ids[n]);
      expect(typeof r.matched).toBe('boolean');
      expect(r).toHaveProperty('foundItem');
      if (r.matched) expectFoundItem(r.foundItem);
      else expect(r.foundItem).toBeNull();
    });
  });
  it('edge: an id with no match returns matched:false and foundItem:null', async () => {
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: ['inv-does-not-exist-999'] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].matched).toBe(false);
    expect(res.body.results[0].foundItem).toBeNull();
  });
  it('edge: single-id batch (minItems boundary) works', async () => {
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: ['inv-1'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
  });
  it('validation: empty array -> 400', async () => {
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: [] });
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('validation: missing body / missing field -> 400', async () => {
    const res = await api().post('/found-items/batch-lookup').send({});
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('validation: non-string entries -> 400', async () => {
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: [123, null] });
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('validation: inventoryItemIds not an array -> 400', async () => {
    const res = await api().post('/found-items/batch-lookup').send({ inventoryItemIds: 'inv-5501' });
    expect(res.status).toBe(400);
    expectError(res);
  });
  // No 404 in the contract for this endpoint: unknown ids are a normal matched:false result.
});

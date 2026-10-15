const { api, UUID_RE, OUTCOMES, MISSING_UUID, expectError } = require('./helpers');

async function realFoundItemId() {
  const list = await api().get('/found-items');
  return list.body.length ? list.body[0].itemId : null;
}
const body = (foundItemId, over = {}) => ({
  foundItemId, inventoryItemId: 'inv-5501', checkedBy: 'team11-sync-service', outcome: 'no_match', ...over,
});

describe('POST /flagged-checks', () => {
  it('happy path: 201 and a correctly shaped FlaggedCheck echoing the input', async () => {
    const id = await realFoundItemId();
    if (!id) return console.warn('No seed data: happy-path test skipped');
    const res = await api().post('/flagged-checks').send(body(id));
    expect(res.status).toBe(201);
    expect(res.body.checkId).toMatch(UUID_RE);
    expect(res.body.foundItemId).toBe(id);
    expect(res.body.inventoryItemId).toBe('inv-5501');
    expect(res.body.checkedBy).toBe('team11-sync-service');
    expect(res.body.outcome).toBe('no_match');
    expect(Number.isNaN(Date.parse(res.body.checkedAt))).toBe(false);
  });
  it('every allowed outcome is accepted', async () => {
    const id = await realFoundItemId();
    if (!id) return;
    for (const outcome of OUTCOMES) {
      const res = await api().post('/flagged-checks').send(body(id, { outcome }));
      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe(outcome);
    }
  });
  it.each(['foundItemId', 'inventoryItemId', 'checkedBy', 'outcome'])(
    'validation: missing %s -> 400', async (field) => {
      const id = (await realFoundItemId()) || MISSING_UUID;
      const b = body(id); delete b[field];
      const res = await api().post('/flagged-checks').send(b);
      expect(res.status).toBe(400);
      expectError(res);
    });
  it('validation: outcome outside the allowed set -> 400', async () => {
    const id = (await realFoundItemId()) || MISSING_UUID;
    const res = await api().post('/flagged-checks').send(body(id, { outcome: 'maybe' }));
    expect(res.status).toBe(400);
    expectError(res);
  });
  it('validation: wrong type for checkedBy -> 400', async () => {
    const id = (await realFoundItemId()) || MISSING_UUID;
    const res = await api().post('/flagged-checks').send(body(id, { checkedBy: 42 }));
    expect(res.status).toBe(400);
  });
  it('404 when foundItemId does not exist', async () => {
    const res = await api().post('/flagged-checks').send(body(MISSING_UUID));
    expect(res.status).toBe(404);
    expectError(res);
    expect(res.body.error).toBe('not_found');
  });
  it('edge: malformed foundItemId is rejected with 400 or 404 (contract silent)', async () => {
    const res = await api().post('/flagged-checks').send(body('not-a-uuid'));
    expect([400, 404]).toContain(res.status);
  });
});

const { api } = require('./helpers');

describe('GET /health', () => {
  it('returns 200 with status and database fields', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });
  it('responds with JSON', async () => {
    const res = await api().get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

});

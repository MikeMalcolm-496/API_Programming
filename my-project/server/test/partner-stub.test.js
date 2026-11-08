const request = require('supertest');
const { createStub } = require('../partner-stub');

describe('local Strathbites demo data', () => {
  const api = request(createStub());

  it('matches seeded Strathbites user 3 to cafe-3 orders on the seeded claim date', async () => {
    const frequency = await api
      .get('/api/users/3/order-frequency')
      .query({ locationId: 'cafe-3' });
    const orders = await api
      .get('/api/orders')
      .query({ userId: '3', fields: 'timestamp' });

    expect(frequency.status).toBe(200);
    expect(frequency.body).toMatchObject({
      userId: 3,
      locationId: 'cafe-3',
      orderCount: 5,
      isFirstTimeUser: false,
    });
    expect(orders.status).toBe(200);
    expect(orders.body.orders).toContainEqual({
      id: 10291,
      timestamp: '2026-10-20T09:41:00Z',
    });
  });
});

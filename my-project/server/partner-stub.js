// FAKE Strathbites API for offline practice and the automated tests.
// Same paths and response shapes as their openapi.yaml, made-up data.
// Use only when their trycloudflare tunnel is down:
//   node partner-stub.js        then set PARTNER_URL=http://localhost:5050/api in .env
// (STUB_PORT=6060 node partner-stub.js to use another port)
const express = require('express');

const ORDERS = {
  1: [
    { id: 20101, timestamp: '2026-10-14T06:30:00Z', location: 'cafe-1' },
    { id: 20102, timestamp: '2026-10-21T09:55:00Z', location: 'cafe-1' },
  ],
  2: [
    { id: 30201, timestamp: '2026-10-08T11:20:00Z', location: 'cafe-2' },
  ],
  3: [
    { id: 10287, timestamp: '2026-10-06T09:12:00Z', location: 'cafe-3' },
    { id: 10288, timestamp: '2026-10-09T10:02:00Z', location: 'cafe-3' },
    { id: 10289, timestamp: '2026-10-13T09:45:00Z', location: 'cafe-1' },
    { id: 10290, timestamp: '2026-10-16T09:30:00Z', location: 'cafe-3' },
    { id: 10291, timestamp: '2026-10-20T09:41:00Z', location: 'cafe-3' },
    { id: 10292, timestamp: '2026-10-21T05:15:00Z', location: 'cafe-1' },
    { id: 10293, timestamp: '2026-10-21T10:05:00Z', location: 'cafe-3' },
  ],
};
const LOCATIONS = ['cafe-1', 'cafe-2', 'cafe-3'];

function createStub() {
  const app = express();

  app.get('/api/orders', (req, res) => {
    const { userId, fields } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!['timestamp', 'location'].includes(fields)) {
      return res.status(400).json({ error: 'fields must be one of: timestamp, location' });
    }
    const orders = ORDERS[userId];
    if (!orders) return res.status(404).json({ error: `User ${userId} not found` });
    return res.json({ orders: orders.map((o) => ({ id: o.id, [fields]: o[fields] })) });
  });

  app.get('/api/users/:id/order-frequency', (req, res) => {
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId is required' });
    const orders = ORDERS[req.params.id];
    if (!orders) return res.status(404).json({ error: `User ${req.params.id} not found` });
    if (!LOCATIONS.includes(locationId)) return res.status(404).json({ error: `Location ${locationId} not found` });
    const here = orders.filter((o) => o.location === locationId);
    return res.json({
      userId: Number(req.params.id),
      locationId,
      orderCount: here.length,
      isFirstTimeUser: here.length <= 1,
      lastOrderDate: here.length ? here[here.length - 1].timestamp : null,
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.STUB_PORT) || 5050;
  createStub().listen(port, () => console.log(`FAKE Strathbites stub on http://localhost:${port}/api`));
}

module.exports = { createStub };

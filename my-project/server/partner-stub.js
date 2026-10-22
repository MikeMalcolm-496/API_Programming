// Stand-in for the Strathbites API, returning the example shapes from their
// openapi.yaml. Use only when their tunnel is down:
//   node partner-stub.js   then set PARTNER_URL=http://localhost:5050/api
const express = require('express');
const app = express();

const orders = [
  { id: 10291, timestamp: '2026-10-20T12:41:00Z', location: 'cafe-3' },
  { id: 10292, timestamp: '2026-10-21T08:15:00Z', location: 'cafe-1' },
  { id: 10293, timestamp: '2026-10-21T13:05:00Z', location: 'cafe-3' },
];

app.get('/api/orders', (req, res) => {
  const { userId, fields } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!['timestamp', 'location'].includes(fields)) {
    return res.status(400).json({ error: 'fields must be one of: timestamp, location' });
  }
  if (userId !== '3') return res.status(404).json({ error: `User ${userId} not found` });
  res.json({ orders: orders.map((o) => ({ id: o.id, [fields]: o[fields] })) });
});

app.get('/api/users/:id/order-frequency', (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ error: 'locationId is required' });
  if (req.params.id !== '3') return res.status(404).json({ error: `User ${req.params.id} not found` });
  const here = orders.filter((o) => o.location === locationId);
  res.json({
    userId: 3,
    locationId,
    orderCount: here.length,
    isFirstTimeUser: here.length <= 1,
    lastOrderDate: here.length ? here[here.length - 1].timestamp : null,
  });
});

app.listen(5050, () => console.log('Strathbites stub on http://localhost:5050/api'));

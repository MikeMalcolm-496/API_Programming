// Week 10 integration: Lost & Found (Team 10) consuming the Strathbites API.
//
// Feature: claim verification. When someone claims a lost item, we check their
// Strathbites order history to see whether they were actually at the location
// where the item was lost, and how familiar they are with that location.
//
// All calls to Strathbites happen here on the server, never from the browser.

const express = require('express');

const router = express.Router();

const PARTNER_URL = (process.env.PARTNER_URL || '').replace(/\/+$/, ''); // e.g. https://xxxx.trycloudflare.com/api
const PARTNER_API_KEY = process.env.PARTNER_API_KEY; // added in the physical class; never logged

// Calls one Strathbites endpoint and returns { ok, status, body }.
// Throws only when the partner cannot be reached at all.
async function callPartner(path) {
  const headers = { Accept: 'application/json' };
  if (PARTNER_API_KEY) headers['X-API-Key'] = PARTNER_API_KEY;

  const r = await fetch(`${PARTNER_URL}${path}`, { headers });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null; // tunnel error pages come back as HTML, not JSON
  }
  return { ok: r.ok, status: r.status, body };
}

// GET /claims/verify?userId=3&locationId=cafe-3
router.get('/claims/verify', async (req, res) => {
  const { userId, locationId } = req.query;

  if (!/^\d+$/.test(String(userId || ''))) {
    return res.status(400).json({ error: 'invalid_request', message: 'userId must be a whole number.' });
  }
  if (typeof locationId !== 'string' || !locationId.trim()) {
    return res.status(400).json({ error: 'invalid_request', message: 'locationId is required.' });
  }
  if (!PARTNER_URL) {
    console.error('PARTNER_URL is not set in .env');
    return res.status(502).json({ error: 'partner_unavailable', message: 'Partner data unavailable.' });
  }

  const loc = encodeURIComponent(locationId.trim());

  try {
    // The three Strathbites endpoints, called in parallel.
    const [freq, times, places] = await Promise.all([
      callPartner(`/users/${userId}/order-frequency?locationId=${loc}`),
      callPartner(`/orders?userId=${userId}&fields=timestamp`),
      callPartner(`/orders?userId=${userId}&fields=location`),
    ]);

    // Partner says the user or location does not exist: pass that on as a 404.
    const missing = [freq, times, places].find((r) => r.status === 404);
    if (missing) {
      return res.status(404).json({
        error: 'not_found',
        message: (missing.body && missing.body.error) || `User ${userId} not found at Strathbites.`,
      });
    }

    const failed = [freq, times, places].find((r) => !r.ok);
    if (failed) {
      console.error('partner returned', failed.status);
      return res.status(502).json({ error: 'partner_unavailable', message: 'Partner data unavailable.' });
    }

    // Contract check: fail loudly if the shape is not what openapi.yaml promises.
    const f = freq.body || {};
    const timeOrders = times.body && Array.isArray(times.body.orders) ? times.body.orders : null;
    const placeOrders = places.body && Array.isArray(places.body.orders) ? places.body.orders : null;
    if (typeof f.orderCount !== 'number' || typeof f.isFirstTimeUser !== 'boolean' || !timeOrders || !placeOrders) {
      console.error('partner response did not match contract', {
        frequencyKeys: Object.keys(f),
        timestampShape: typeof times.body,
        locationShape: typeof places.body,
      });
      return res.status(502).json({ error: 'partner_contract_mismatch', message: 'Partner data unavailable.' });
    }

    // fields=timestamp and fields=location each return one extra field per
    // order, so we join them by order id to get time + place together.
    const locationById = new Map(placeOrders.map((o) => [o.id, o.location]));
    const ordersHere = timeOrders
      .filter((o) => locationById.get(o.id) === locationId.trim())
      .map((o) => ({ orderId: o.id, timestamp: o.timestamp }))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    let credibility = 'low';
    if (f.orderCount >= 5) credibility = 'high';
    else if (f.orderCount >= 1) credibility = 'medium';

    return res.json({
      userId: Number(userId),
      locationId: locationId.trim(),
      orderCount: f.orderCount,
      isFirstTimeUser: f.isFirstTimeUser,
      lastOrderDate: f.lastOrderDate || null,
      totalOrders: timeOrders.length,
      ordersAtLocation: ordersHere,
      credibility,
    });
  } catch (err) {
    // ECONNREFUSED = nothing listening; ENOTFOUND = wrong hostname
    console.error('partner call failed:', (err.cause && err.cause.code) || err.message);
    return res.status(502).json({ error: 'partner_unavailable', message: 'Partner data unavailable.' });
  }
});

module.exports = router;

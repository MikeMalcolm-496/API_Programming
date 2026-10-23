
const TIMEOUT_MS = Number(process.env.PARTNER_TIMEOUT_MS) || 8000;
const LOCATION_RE = /\bcafe-\d+\b/i; // Strathbites location IDs look like cafe-1, cafe-2 ...
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT = UTC+3, no daylight saving

// Read at call time (not at startup) so tests and the CLI can point it elsewhere.
const partnerBase = () => (process.env.PARTNER_URL || '').trim().replace(/\/+$/, '');
const loggingOn = () => process.env.STRATHBITES_LOG !== 'off';
const log = (...args) => { if (loggingOn()) console.log('[Strathbites]', ...args); };

class PartnerError extends Error {
  // httpStatus = what OUR API should answer; code = our error code
  constructor(httpStatus, code, message, extra = {}) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    Object.assign(this, extra);
  }
}

function summarise(body) {
  if (!body || typeof body !== 'object') return '';
  if (Array.isArray(body.orders)) return `(orders: ${body.orders.length})`;
  if (typeof body.orderCount === 'number') return `(orderCount: ${body.orderCount})`;
  if (body.error) return `(error: ${body.error})`;
  return '';
}

// THE ONE PLACE WHERE WE MAKE AN HTTP REQUEST TO STRATHBITES.
// Returns { ok, status, body, url, ms }. Throws PartnerError(502) only when the
// partner cannot be reached at all (tunnel down, wrong URL, timeout).
async function callStrathbites(path) {
  const base = partnerBase();
  if (!base) {
    console.error('[Strathbites] PARTNER_URL is not set in .env');
    throw new PartnerError(502, 'partner_unavailable', 'Partner data unavailable (PARTNER_URL not configured).');
  }
  const url = `${base}${path}`;
  const headers = { Accept: 'application/json' };
  if (process.env.PARTNER_API_KEY) headers['X-API-Key'] = process.env.PARTNER_API_KEY;

  const started = Date.now();
  log(`-> GET ${url}`);
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS} ms`
      : (err.cause && err.cause.code) || err.message; // ECONNREFUSED / ENOTFOUND / ...
    console.error(`[Strathbites] x  GET ${url} failed: ${reason}`);
    throw new PartnerError(502, 'partner_unavailable', 'Partner data unavailable.', { reason });
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null; // a dead trycloudflare tunnel answers with an HTML error page
  }
  const ms = Date.now() - started;
  log(`<- ${response.status} ${response.statusText || ''} in ${ms} ms ${summarise(body)}`.replace(/\s+/g, ' ').trim());
  return { ok: response.ok, status: response.status, body, url, ms };
}

// ---- The three Strathbites endpoints from their openapi.yaml ----
const getOrderFrequency = (userId, locationId) =>
  callStrathbites(`/users/${encodeURIComponent(userId)}/order-frequency?locationId=${encodeURIComponent(locationId)}`);

const getOrders = (userId, field) => {
  if (!['timestamp', 'location'].includes(field)) throw new Error('field must be timestamp or location');
  return callStrathbites(`/orders?userId=${encodeURIComponent(userId)}&fields=${field}`);
};

// ---- Helpers ----
const extractLocationId = (text) => {
  const m = String(text || '').match(LOCATION_RE);
  return m ? m[0].toLowerCase() : null;
};
const nairobiDate = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Claim verification: uses all three endpoints ----
// lostDate (optional, YYYY-MM-DD) is the day the item was found/lost; if given,
// we check whether the claimant ordered at that location on that day.
async function verifyClaimant(userId, locationId, { lostDate, includeRaw = false } = {}) {
  if (!/^\d+$/.test(String(userId ?? ''))) {
    throw new PartnerError(400, 'invalid_request', 'userId must be a whole number.');
  }
  if (typeof locationId !== 'string' || !locationId.trim()) {
    throw new PartnerError(400, 'invalid_request', 'locationId is required.');
  }
  if (lostDate !== undefined && lostDate !== null && lostDate !== '' &&
      (!DATE_RE.test(lostDate) || Number.isNaN(Date.parse(lostDate)))) {
    throw new PartnerError(400, 'invalid_request', 'lostDate must be a YYYY-MM-DD date.');
  }
  const loc = locationId.trim();
  const day = lostDate || null;

  // The three calls run in parallel.
  const [freq, times, places] = await Promise.all([
    getOrderFrequency(userId, loc),
    getOrders(userId, 'timestamp'),
    getOrders(userId, 'location'),
  ]);
  const calls = [
    { endpoint: 'GET /users/{id}/order-frequency', url: freq.url, status: freq.status, ms: freq.ms },
    { endpoint: 'GET /orders?fields=timestamp', url: times.url, status: times.status, ms: times.ms },
    { endpoint: 'GET /orders?fields=location', url: places.url, status: places.status, ms: places.ms },
  ];

  const missing = [freq, times, places].find((r) => r.status === 404);
  if (missing) {
    throw new PartnerError(404, 'not_found',
      (missing.body && missing.body.error) || `User ${userId} not found at Strathbites.`, { partnerCalls: calls });
  }
  const failed = [freq, times, places].find((r) => !r.ok);
  if (failed) {
    console.error('[Strathbites] partner returned', failed.status, failed.body && failed.body.error);
    throw new PartnerError(502, 'partner_unavailable', 'Partner data unavailable.', { partnerCalls: calls });
  }

  // Contract check: fail loudly if the shape is not what their openapi.yaml promises.
  const f = freq.body || {};
  const timeOrders = times.body && Array.isArray(times.body.orders) ? times.body.orders : null;
  const placeOrders = places.body && Array.isArray(places.body.orders) ? places.body.orders : null;
  if (typeof f.orderCount !== 'number' || typeof f.isFirstTimeUser !== 'boolean' || !timeOrders || !placeOrders) {
    console.error('[Strathbites] response did not match contract', {
      frequencyKeys: Object.keys(f), timestampShape: typeof times.body, locationShape: typeof places.body,
    });
    throw new PartnerError(502, 'partner_contract_mismatch', 'Partner data unavailable.', { partnerCalls: calls });
  }

  // fields=timestamp and fields=location each return ONE extra field per order,
  // so we join the two lists by order id to get time + place together.
  const locationById = new Map(placeOrders.map((o) => [o.id, o.location]));
  const ordersAtLocation = timeOrders
    .filter((o) => String(locationById.get(o.id) || '').toLowerCase() === loc.toLowerCase())
    .map((o) => ({ orderId: o.id, timestamp: o.timestamp, date: nairobiDate(o.timestamp) }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  const ordersOnLostDate = day ? ordersAtLocation.filter((o) => o.date === day) : [];
  const presentOnLostDate = day ? ordersOnLostDate.length > 0 : null;

  // Simple, explainable scoring.
  const reasons = [];
  let credibility = 'low';
  if (presentOnLostDate) {
    credibility = 'high';
    reasons.push(`Ordered at ${loc} on ${day} (the day the item was found): ${ordersOnLostDate.length} order(s).`);
  } else if (f.orderCount >= 5) {
    credibility = day ? 'medium' : 'high';
    reasons.push(`Regular customer at ${loc}: ${f.orderCount} orders.`);
  } else if (f.orderCount >= 1) {
    credibility = 'medium';
    reasons.push(`Has ordered at ${loc} ${f.orderCount} time(s).`);
  } else {
    reasons.push(`No Strathbites orders at ${loc}.`);
  }
  if (day && !presentOnLostDate) reasons.push(`No order at ${loc} on ${day}.`);
  if (f.isFirstTimeUser) reasons.push('Strathbites marks this user as a first-time visitor at this location.');

  const result = {
    userId: Number(userId),
    locationId: loc,
    lostDate: day,
    orderCount: f.orderCount,
    isFirstTimeUser: f.isFirstTimeUser,
    lastOrderDate: f.lastOrderDate || null,
    totalOrders: timeOrders.length,
    ordersAtLocation,
    presentOnLostDate,
    credibility,
    reasons,
    source: 'Strathbites API',
    partnerCalls: calls,
  };
  if (includeRaw) {
    result.raw = { orderFrequency: freq.body, ordersTimestamp: times.body, ordersLocation: places.body };
  }
  return result;
}

module.exports = {
  callStrathbites, getOrderFrequency, getOrders, verifyClaimant, extractLocationId, nairobiDate, PartnerError, partnerBase,
};

// Calls Strathbites. Version, base URL and key come from .env, never hard-coded.
// ADAPT: the path and query names below to match Strathbites' docs/Swagger.
const BASE = process.env.PARTNER_BASE_URL;          // e.g. http://their-host:3000
const VERSION = process.env.PARTNER_VERSION || 'v2'; // v1 or v2
const KEY = process.env.PARTNER_API_KEY;
const TIMEOUT_MS = Number(process.env.PARTNER_TIMEOUT_MS || 3000);

async function getOrders({ userId, cafeteria, date }) {
  const url = `${BASE}/api/${VERSION}/orders?user=${encodeURIComponent(userId)}` +
              `&cafeteria=${encodeURIComponent(cafeteria)}&date=${encodeURIComponent(date)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': KEY }, signal: ctrl.signal }); // ADAPT header name
    if (!res.ok) throw new Error(`Partner returned ${res.status}`);
    const body = await res.json();
    // v2 usually wraps the payload in { data }; v1 returns it bare. ADAPT to their real v2 shape.
    const data = VERSION === 'v2' && body.data !== undefined ? body.data : body;
    return { stale: false, data };
  } catch (err) {
    console.error(`[partner] ${VERSION} call failed: ${err.message}`); // never log the key
    return { stale: true, data: null, error: 'Partner data unavailable.' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getOrders };

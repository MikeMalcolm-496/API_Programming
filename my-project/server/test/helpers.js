const request = require('supertest');
// Local run: tests hit your app. Partner run: BASE_URL=http://their-host:port npx jest
const target = process.env.BASE_URL || require('../index');
const api = () => request(target);

// Close the DB pool after each suite so Jest can exit (fixes "worker failed to exit").
afterAll(async () => {
  try {
    const db = require('../db');
    if (db && typeof db.end === 'function') await db.end();
    else if (db && db.pool && typeof db.pool.end === 'function') await db.pool.end();
  } catch (e) { /* already closed */ }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['unclaimed', 'claimed', 'pending-verification'];
const CATEGORIES = ['electronics', 'personal-items', 'documents', 'clothing', 'keys', 'other'];
const OUTCOMES = ['match', 'no_match', 'needs_review'];
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

function expectFoundItem(i) {
  for (const f of ['itemId', 'status', 'location', 'dateFound', 'description', 'category'])
    expect(i).toHaveProperty(f);
  expect(i.itemId).toMatch(UUID_RE);
  expect(STATUSES).toContain(i.status);
  expect(typeof i.location).toBe('string');
  expect(Number.isNaN(Date.parse(i.dateFound))).toBe(false);
  expect(typeof i.description).toBe('string');
  expect(CATEGORIES).toContain(i.category);
}
function expectError(res) {
  expect(res.body).toHaveProperty('error');
  expect(res.body).toHaveProperty('message');
  expect(typeof res.body.error).toBe('string');
  expect(typeof res.body.message).toBe('string');
}
module.exports = { api, UUID_RE, CATEGORIES, OUTCOMES, MISSING_UUID, expectFoundItem, expectError };

#!/usr/bin/env node
// Command-line demo of our Strathbites integration.
//
//   node scripts/strathbites-cli.js <userId> <locationId> [--date YYYY-MM-DD] [--url <PARTNER_URL>]
//   node scripts/strathbites-cli.js 3 cafe-3 --date 2026-10-20
//   node scripts/strathbites-cli.js 3 cafe-3 --server http://localhost:5000      (go through OUR API instead)
//
// Direct mode uses the same lib/strathbites.js code the server uses, prints the
// three raw Strathbites responses, then the verification verdict.

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
for (const p of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../Lost_Found_System-main/.env'), path.resolve(ROOT, '../../.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true });
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [userId, locationId] = positional;
const lostDate = flag('--date');
const server = flag('--server');
const apiKey = flag('--key') || process.env.LF_API_KEY; // only used with --server once API keys are on
if (flag('--url')) process.env.PARTNER_URL = flag('--url');

if (!userId || !locationId) {
  console.log('Usage: node scripts/strathbites-cli.js <userId> <locationId> [--date YYYY-MM-DD] [--url <PARTNER_URL>] [--server http://localhost:5000]');
  process.exit(1);
}

const line = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 70 - t.length))}`);
const show = (r) => {
  console.log(`HTTP ${r.status}  (${r.ms} ms)  ${r.url}`);
  console.log(JSON.stringify(r.body, null, 2));
};

async function direct() {
  const sb = require('../lib/strathbites');
  console.log(`Partner base URL: ${sb.partnerBase() || '(PARTNER_URL not set!)'}`);

  line('1. GET /users/{id}/order-frequency');
  show(await sb.getOrderFrequency(userId, locationId));
  line('2. GET /orders?fields=timestamp');
  show(await sb.getOrders(userId, 'timestamp'));
  line('3. GET /orders?fields=location');
  show(await sb.getOrders(userId, 'location'));

  line('VERDICT (all three combined by lib/strathbites.js verifyClaimant)');
  process.env.STRATHBITES_LOG = 'off'; // calls already shown above
  const v = await sb.verifyClaimant(userId, locationId, { lostDate });
  console.log(`User ${v.userId} at ${v.locationId}${v.lostDate ? ` on ${v.lostDate}` : ''}`);
  console.log(`  orders here        : ${v.orderCount}`);
  console.log(`  first-time visitor : ${v.isFirstTimeUser}`);
  console.log(`  last order here    : ${v.lastOrderDate || 'none'}`);
  if (v.lostDate) console.log(`  present that day   : ${v.presentOnLostDate}`);
  console.log(`  CREDIBILITY        : ${v.credibility.toUpperCase()}`);
  v.reasons.forEach((r) => console.log(`   - ${r}`));
}

async function viaServer() {
  const q = new URLSearchParams({ userId, locationId });
  if (lostDate) q.set('lostDate', lostDate);
  const url = `${server.replace(/\/+$/, '')}/claims/verify?${q}`;
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  console.log(`-> GET ${url}`);
  const r = await fetch(url, { headers });
  console.log(`<- HTTP ${r.status}`);
  console.log(JSON.stringify(await r.json().catch(() => null), null, 2));
}

(server ? viaServer() : direct()).catch((e) => {
  console.error(`\nFailed: ${e.message}${e.reason ? ` (${e.reason})` : ''}`);
  if (e.partnerCalls) console.error(e.partnerCalls);
  process.exit(1);
});

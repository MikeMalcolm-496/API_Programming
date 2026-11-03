// traffic.js: sends a mix of requests to our API, to give us data.
// Run (PowerShell): $env:KEY="<your-key>"; node traffic.js
const API = process.env.API || 'http://localhost:5000';
const KEY = process.env.KEY;
const N = Number(process.env.N || 60);

const mix = [
  { method: 'GET', path: '/found-items', key: true },
  { method: 'GET', path: '/found-items', key: true },
  { method: 'GET', path: '/found-items/c0000000-0000-4000-8000-000000000014', key: true }, // real item
  { method: 'GET', path: '/found-items/99', key: true },        // no such id
  { method: 'GET', path: '/found-items', key: false },          // no key at all
  { method: 'GET', path: '/not-a-route', key: true },           // no such path
  { method: 'GET', path: '/claims/verify?userId=3&locationId=cafe-3', key: true }, // calls Strathbites
];

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const counts = {};
  for (let i = 0; i < N; i++) {
    const r = mix[Math.floor(Math.random() * mix.length)];
    try {
      const res = await fetch(API + r.path, {
        method: r.method,
        headers: r.key ? { 'X-API-Key': KEY } : {},
      });
      counts[res.status] = (counts[res.status] || 0) + 1;
    } catch (err) {
      counts.failed = (counts.failed || 0) + 1;
    }
    await pause(50);
  }
  console.log('Status codes received:', counts);
})();
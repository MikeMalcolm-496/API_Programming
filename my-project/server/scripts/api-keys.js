
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
for (const p of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../Lost_Found_System-main/.env'), path.resolve(ROOT, '../../.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true });
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const firstArg = rest.find((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

function usage() {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

async function testKey(key) {
  const server = (flag('--server') || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
  const r = await fetch(`${server}/api-keys/me`, { headers: { 'X-API-Key': key } });
  console.log(`GET ${server}/api-keys/me -> HTTP ${r.status}`);
  console.log(JSON.stringify(await r.json().catch(() => null), null, 2));
  if (!r.ok) process.exitCode = 1;
}

(async () => {
  if (!cmd || cmd === 'help' || cmd === '--help') return usage();
  if (cmd === 'test') {
    if (!firstArg) throw new Error('Usage: test <apiKey>');
    return testKey(firstArg);
  }
  const keys = require('../lib/apiKeys');
  const db = require('../db');
  try {
    if (cmd === 'scopes') {
      console.table(keys.SCOPES);
    } else if (cmd === 'create') {
      const scopes = flag('--scopes') ? flag('--scopes').split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const { apiKey, record } = await keys.createKey({
        name: flag('--name'),
        scopes,
        expiresInDays: flag('--expires'),
        useSupabaseFallback: true,
      });
      console.log('\nAPI key created. Copy it NOW - it is stored only as a hash and cannot be shown again:\n');
      console.log(`    ${apiKey}\n`);
      console.table([{ id: record.id, name: record.name, prefix: record.keyPrefix, scopes: record.scopes.join(' '), expires: record.expiresAt || 'never' }]);
      console.log('Give it to the partner privately. They send it as the header:  X-API-Key: <key>');
    } else if (cmd === 'list') {
      const list = await keys.listKeys({ useSupabaseFallback: true });
      if (!list.length) console.log('No API keys yet. Create one with: node scripts/api-keys.js create --name "Team 11"');
      else console.table(list.map((k) => ({
        id: k.id, name: k.name, prefix: k.keyPrefix, status: k.status, scopes: k.scopes.join(' '),
        currentFormat: k.keyPrefix.startsWith(keys.KEY_PREFIX) && k.scopes.every((scope) => Object.hasOwn(keys.SCOPES, scope))
          ? 'yes' : 'no (legacy)',
        uses: k.usageCount, lastUsed: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : '-',
      })));
    } else if (cmd === 'revoke') {
      if (!firstArg) throw new Error('Usage: revoke <id | keyPrefix>');
      const k = await keys.revokeKey(firstArg);
      console.log(k ? `Revoked ${k.keyPrefix}… (${k.name}). Calls with it now get 401.` : 'No key found with that id or prefix.');
    } else if (cmd === 'rotate') {
      if (!firstArg) throw new Error('Usage: rotate <id | keyPrefix>');
      const fresh = await keys.rotateKey(firstArg, { useSupabaseFallback: true });
      if (!fresh) console.log('No key found with that id or prefix.');
      else console.log(`Old key revoked. New key (copy it now):\n\n    ${fresh.apiKey}\n`);
    } else {
      usage();
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
  return undefined;
})().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
  console.error(`Error: ${message || code || 'Unknown error'}`);
  if (e && e.replacement) {
    console.error('\nA replacement key was created, but the old key could not be revoked. Keep this key and revoke the old key manually:');
    console.error(`    ${e.replacement.apiKey}`);
  }
  if (e instanceof Error && !message) console.error(e.stack);
  if (code === '42P01') console.error('The api_keys table is missing. Run migrations/003_api_keys.sql first.');
  process.exit(1);
});

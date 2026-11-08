const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
for (const envPath of [
  path.join(ROOT, '.env'),
  path.resolve(ROOT, '../../Lost_Found_System-main/.env'),
  path.resolve(ROOT, '../../.env'),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true });
}

const portFromEnv = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number between 1 and 65535.`);
  }
  return value;
};

const appPort = portFromEnv('PORT', 5000);
const stubPort = portFromEnv('STRATHBITES_STUB_PORT', 5050);
if (appPort === stubPort) throw new Error('PORT and STRATHBITES_STUB_PORT must be different.');

process.env.PARTNER_URL = `http://127.0.0.1:${stubPort}/api`;
delete process.env.PARTNER_API_KEY;

const { createStub } = require('../partner-stub');
const app = require('../index');
const db = require('../db');
const servers = [];
let stopping = false;

function listen(server, label) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.removeListener('listening', onListening);
      server.removeListener('error', onError);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(new Error(`Could not start ${label}: ${error.message}`));
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });
}

function close(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await Promise.all(servers.map(close));
    await db.end();
    console.log('[demo] Local demo stopped.');
  } catch (error) {
    console.error(`[demo] Failed to stop cleanly: ${error.message}`);
    process.exitCode = 1;
  }
}

async function start() {
  try {
    const stub = createStub().listen(stubPort, '127.0.0.1');
    servers.push(stub);
    await listen(stub, 'Strathbites demo API');

    const api = app.listen(appPort, '127.0.0.1');
    servers.push(api);
    await listen(api, 'Lost & Found API');

    console.log(`[demo] Strathbites mock API: http://127.0.0.1:${stubPort}/api`);
    console.log(`[demo] Lost & Found API: http://127.0.0.1:${appPort}`);
    console.log('[demo] Partner requests stay local. Press Ctrl+C to stop.');
  } catch (error) {
    console.error(`[demo] ${error.message}`);
    await stop();
    process.exitCode = 1;
  }
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
start();

const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command from an interactive terminal to enter the password securely.');
  }
  process.stdout.write(prompt);
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      if (chunk === '\u0003') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        reject(new Error('Cancelled.'));
      } else if (chunk === '\r' || chunk === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(value);
      } else if (chunk === '\u007f' || chunk === '\b') {
        value = value.slice(0, -1);
      } else {
        value += chunk;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const name = await ask('First administrator full name: ');
  const email = (await ask('First administrator email: ')).toLowerCase();
  const password = await askHidden('Password (minimum 12 characters): ');
  const confirmation = await askHidden('Confirm password: ');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('Provide a name, valid email, and password with at least 12 characters.');
  }
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(735182, 1)');
    const { rows } = await client.query(`SELECT count(*)::int AS count FROM users WHERE role = 'admin'`);
    if (rows[0].count > 0) throw new Error('An administrator already exists; ask an administrator to create the account.');

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await client.query(
      `INSERT INTO users (full_name, email, hashed_password, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email`,
      [name, email, passwordHash]);
    await client.query('COMMIT');
    console.log(`Created initial administrator ${created.rows[0].email}. Sign in through the web app.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());

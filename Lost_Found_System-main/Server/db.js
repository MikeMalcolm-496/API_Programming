const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432, // Default Postgres port fallback
  max: 10,                            // Equivalent to connectionLimit: 10
  idleTimeoutMillis: 30000,           // How long a client is allowed to remain idle before being closed
});

// Just export the pool directly. It natively supports async/await!
module.exports = pool;
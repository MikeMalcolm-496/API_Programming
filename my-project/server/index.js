const express = require('express');
const cors = require('cors');
const path = require('path');

const fs = require('fs');
const dotenv = require('dotenv');

const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../../Lost_Found_System-main/.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
dotenv.config();

const db = require('./db');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// app.get('/', (req, res) => {
//   res.send('API is running');
// });

// app.use(express.static(path.join(__dirname, '../.swagger')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/openapi.yaml', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

const foundItemsRoutes = require('./routes/foundItems');
app.use('/', foundItemsRoutes);

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;

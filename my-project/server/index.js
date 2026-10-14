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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running');
});

const foundItemsRoutes = require('./routes/foundItems');
app.use('/', foundItemsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
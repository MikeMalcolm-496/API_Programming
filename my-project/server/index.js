const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../Lost_Found_System-main/.env'),
});

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
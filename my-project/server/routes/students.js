const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all students
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM students');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

module.exports = router;
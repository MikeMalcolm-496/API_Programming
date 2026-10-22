// Staff-only item management, namespaced under /staff so the public /found-items
// paths stay strictly read-only (a contract test asserts POST /found-items is unsupported).
// The public GET /found-items routes stay in
// routes/foundItems.js, untouched, so the Team 11 contract is not affected.
const express = require('express');
const db = require('../db');
const { staffOnly } = require('../middleware/auth');
const {
  CATEGORIES, ITEM_STATUSES, UUID_RE, ITEM_COLUMNS, fail, serverError, isNonEmptyString,
} = require('../lib/shared');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /staff/found-items
router.post('/staff/found-items', staffOnly, async (req, res) => {
  try {
    const b = req.body || {};
    for (const f of ['title', 'description', 'location', 'dateFound']) {
      if (!isNonEmptyString(b[f])) return fail(res, 400, 'invalid_request', `${f} is required and must be a non-empty string.`);
    }
    if (!CATEGORIES.includes(b.category)) {
      return fail(res, 400, 'invalid_request', `category must be one of: ${CATEGORIES.join(', ')}.`);
    }
    if (!DATE_RE.test(b.dateFound) || Number.isNaN(Date.parse(b.dateFound))) {
      return fail(res, 400, 'invalid_request', 'dateFound must be a valid YYYY-MM-DD date.');
    }
    const { rows } = await db.query(
      `INSERT INTO found_items (posted_by_user_id, title, description, category, location_found, date_found, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'unclaimed') RETURNING id`,
      [req.user.id, b.title.trim(), b.description.trim(), b.category, b.location.trim(), b.dateFound]
    );
    const item = await db.query(`SELECT ${ITEM_COLUMNS} FROM found_items fi WHERE fi.id = $1`, [rows[0].id]);
    return res.status(201).json(item.rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

// PATCH /staff/found-items/:itemId/status
router.patch('/staff/found-items/:itemId/status', staffOnly, async (req, res) => {
  try {
    const { itemId } = req.params;
    const status = req.body && req.body.status;
    if (!ITEM_STATUSES.includes(status)) {
      return fail(res, 400, 'invalid_request', `status must be one of: ${ITEM_STATUSES.join(', ')}.`);
    }
    if (!UUID_RE.test(itemId)) return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    const { rows } = await db.query(
      `UPDATE found_items SET status = $1, updated_at = now() WHERE id = $2 RETURNING id`, [status, itemId]);
    if (rows.length === 0) return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    const item = await db.query(`SELECT ${ITEM_COLUMNS} FROM found_items fi WHERE fi.id = $1`, [itemId]);
    return res.json(item.rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /my/found-items  (the "My Posted Items" dashboard list)
router.get('/my/found-items', staffOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${ITEM_COLUMNS} FROM found_items fi WHERE fi.posted_by_user_id = $1
       ORDER BY fi.created_at DESC`, [req.user.id]);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

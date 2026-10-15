const express = require('express');
const db = require('../db');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['electronics', 'personal-items', 'documents', 'clothing', 'keys', 'other'];
const OUTCOMES = ['match', 'no_match', 'needs_review'];
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

// Maps the database columns (schema.sql) to the FoundItem shape in openapi.yaml.
const ITEM_COLUMNS = `
  fi.id AS "itemId",
  fi.status,
  fi.location_found AS location,
  to_char(fi.date_found, 'YYYY-MM-DD"T"00:00:00"Z"') AS "dateFound",
  fi.description,
  fi.category`;

const badRequest = (res, message) => res.status(400).json({ error: 'invalid_request', message });
const notFound = (res, id) =>
  res.status(404).json({ error: 'not_found', message: `No found item exists with ID ${id}.` });
const serverError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: 'internal_error', message: 'Failed to process the request.' });
};
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// GET /found-items  (browse / search / incremental sync)
router.get('/found-items', async (req, res) => {
  try {
    const { category, keyword, updatedSince } = req.query;
    const where = [];
    const params = [];

    if (category !== undefined) {
      if (typeof category !== 'string' || !CATEGORIES.includes(category)) {
        return badRequest(res, `category must be one of: ${CATEGORIES.join(', ')}.`);
      }
      params.push(category);
      where.push(`fi.category = $${params.length}`);
    }
    if (keyword !== undefined) {
      if (typeof keyword !== 'string' || keyword.trim() === '') {
        return badRequest(res, 'keyword must be a non-empty string.');
      }
      params.push(`%${keyword.trim().replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`fi.description ILIKE $${params.length}`);
    }
    if (updatedSince !== undefined) {
      if (typeof updatedSince !== 'string' || !ISO_DATE_TIME.test(updatedSince) || Number.isNaN(Date.parse(updatedSince))) {
        return badRequest(res, 'updatedSince must be a valid ISO 8601 date-time string.');
      }
      params.push(new Date(updatedSince).toISOString());
      where.push(`fi.updated_at > $${params.length}`);
    }

    const sql = `SELECT ${ITEM_COLUMNS} FROM found_items fi
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY fi.date_found DESC, fi.created_at DESC`;
    const { rows } = await db.query(sql, params);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /found-items/:itemId
router.get('/found-items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!UUID_RE.test(itemId)) return notFound(res, itemId); // not a valid id => cannot exist
    const { rows } = await db.query(`SELECT ${ITEM_COLUMNS} FROM found_items fi WHERE fi.id = $1`, [itemId]);
    if (rows.length === 0) return notFound(res, itemId);
    return res.json(rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /found-items/batch-lookup
// An inventory ID is "matched" when a flagged check with outcome 'match' links it to a found item.
router.post('/found-items/batch-lookup', async (req, res) => {
  try {
    const ids = req.body && req.body.inventoryItemIds;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isNonEmptyString)) {
      return badRequest(res, 'inventoryItemIds must be a non-empty array of strings.');
    }
    const unique = [...new Set(ids)];
    const { rows } = await db.query(
      `SELECT DISTINCT ON (fc.inventory_item_id)
              fc.inventory_item_id AS "inventoryItemId", ${ITEM_COLUMNS}
         FROM flagged_checks fc
         JOIN found_items fi ON fi.id = fc.found_item_id
        WHERE fc.outcome = 'match' AND fc.inventory_item_id = ANY($1::text[])
        ORDER BY fc.inventory_item_id, fc.checked_at DESC`,
      [unique]
    );
    const byId = new Map();
    for (const { inventoryItemId, ...foundItem } of rows) byId.set(inventoryItemId, foundItem);

    return res.json({
      results: ids.map((id) => ({
        inventoryItemId: id,
        matched: byId.has(id),
        foundItem: byId.get(id) || null,
      })),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /flagged-checks
router.post('/flagged-checks', async (req, res) => {
  try {
    const b = req.body || {};
    for (const f of ['foundItemId', 'inventoryItemId', 'checkedBy', 'outcome']) {
      if (!isNonEmptyString(b[f])) return badRequest(res, `${f} is required and must be a non-empty string.`);
    }
    if (!OUTCOMES.includes(b.outcome)) {
      return badRequest(res, `outcome must be one of: ${OUTCOMES.join(', ')}.`);
    }
    if (!UUID_RE.test(b.foundItemId)) return notFound(res, b.foundItemId);

    const exists = await db.query('SELECT 1 FROM found_items WHERE id = $1', [b.foundItemId]);
    if (exists.rowCount === 0) return notFound(res, b.foundItemId);

    const { rows } = await db.query(
      `INSERT INTO flagged_checks (found_item_id, inventory_item_id, checked_by, outcome)
       VALUES ($1, $2, $3, $4)
       RETURNING check_id AS "checkId", found_item_id AS "foundItemId",
                 inventory_item_id AS "inventoryItemId", checked_by AS "checkedBy",
                 outcome, checked_at AS "checkedAt"`,
      [b.foundItemId, b.inventoryItemId.trim(), b.checkedBy.trim(), b.outcome]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

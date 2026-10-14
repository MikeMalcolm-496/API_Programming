const express = require('express');
const db = require('../db');

const router = express.Router();

const categories = new Set([
  'electronics',
  'personal-items',
  'documents',
  'clothing',
  'keys',
  'other',
]);

const outcomes = new Set(['match', 'no_match', 'needs_review']);
const selectColumns = `
  id AS "itemId",
  status,
  location_found AS "location",
  date_found AS "dateFound",
  description,
  category
`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendDatabaseError(res, error) {
  console.error(error);
  res.status(500).json({ error: 'internal_error', message: 'Failed to process the request.' });
}

router.get('/found-items/:itemId', async (req, res) => {
  if (!uuidPattern.test(req.params.itemId)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'itemId must be a valid UUID.',
    });
  }

  try {
    const result = await db.query(
      `SELECT ${selectColumns} FROM found_items WHERE id = $1`,
      [req.params.itemId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: `No found item exists with ID ${req.params.itemId}.`,
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

router.get('/found-items', async (req, res) => {
  const { category, keyword, updatedSince } = req.query;

  if (category && !categories.has(category)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'category must be one of: electronics, personal-items, documents, clothing, keys, other.',
    });
  }

  const conditions = [];
  const values = [];

  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }

  if (keyword) {
    values.push(`%${keyword}%`);
    conditions.push(`description ILIKE $${values.length}`);
  }

  if (updatedSince) {
    const timestamp = new Date(updatedSince);
    if (Number.isNaN(timestamp.getTime())) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'updatedSince must be a valid ISO 8601 date-time string.',
      });
    }

    values.push(timestamp.toISOString());
    conditions.push(`updated_at > $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT ${selectColumns} FROM found_items${whereClause} ORDER BY date_found DESC`,
      values,
    );
    return res.json(result.rows);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

router.post('/found-items/batch-lookup', async (req, res) => {
  const { inventoryItemIds } = req.body || {};

  if (!Array.isArray(inventoryItemIds) || inventoryItemIds.length === 0 || inventoryItemIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'inventoryItemIds must be a non-empty array of strings.',
    });
  }

  try {
    const result = await db.query(
      `SELECT ${selectColumns} FROM found_items WHERE id = ANY($1::uuid[])`,
      [inventoryItemIds],
    );
    const matches = new Map(result.rows.map((item) => [item.itemId, item]));

    return res.json({
      results: inventoryItemIds.map((inventoryItemId) => ({
        inventoryItemId,
        matched: matches.has(inventoryItemId),
        foundItem: matches.get(inventoryItemId) || null,
      })),
    });
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

router.post('/flagged-checks', async (req, res) => {
  const { foundItemId, inventoryItemId, checkedBy, outcome } = req.body || {};

  if (
    typeof foundItemId !== 'string' ||
    !uuidPattern.test(foundItemId) ||
    typeof inventoryItemId !== 'string' ||
    inventoryItemId.trim() === '' ||
    typeof checkedBy !== 'string' ||
    checkedBy.trim() === '' ||
    typeof outcome !== 'string' ||
    !outcomes.has(outcome)
  ) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'foundItemId, inventoryItemId, checkedBy, and a valid outcome are required.',
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO flagged_checks (found_item_id, inventory_item_id, checked_by, outcome)
       SELECT id, $2, $3, $4 FROM found_items WHERE id = $1::uuid
       RETURNING
         check_id AS "checkId",
         found_item_id AS "foundItemId",
         inventory_item_id AS "inventoryItemId",
         checked_by AS "checkedBy",
         outcome,
         checked_at AS "checkedAt"`,
      [foundItemId, inventoryItemId.trim(), checkedBy.trim(), outcome],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: `No found item exists with ID ${foundItemId}.`,
      });
    }

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

module.exports = router;

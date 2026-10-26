const express = require('express');
const db = require('../db');
const {
  UUID_RE, CATEGORIES, fail, serverError, isNonEmptyString, ITEM_COLUMNS,
} = require('../lib/shared');

const router = express.Router();
const OUTCOMES = ['match', 'no_match', 'needs_review'];
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

async function listFoundItems(req, res) {
  try {
    const { category, keyword, updatedSince } = req.query;
    if (category !== undefined && !CATEGORIES.includes(category)) {
      return fail(res, 400, 'invalid_request', `category must be one of: ${CATEGORIES.join(', ')}.`);
    }
    if (updatedSince !== undefined &&
        (typeof updatedSince !== 'string' || !DATE_TIME_RE.test(updatedSince) ||
         Number.isNaN(Date.parse(updatedSince)))) {
      return fail(res, 400, 'invalid_request', 'updatedSince must be a valid ISO 8601 date-time string.');
    }

    const values = [];
    const conditions = [];
    if (category !== undefined) {
      values.push(category);
      conditions.push(`fi.category = $${values.length}`);
    }
    if (keyword !== undefined) {
      values.push(`%${keyword}%`);
      conditions.push(`fi.description ILIKE $${values.length}`);
    }
    if (updatedSince !== undefined) {
      values.push(updatedSince);
      conditions.push(`fi.updated_at > $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT ${ITEM_COLUMNS} FROM found_items fi ${where} ORDER BY fi.created_at DESC`,
      values
    );
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
}

async function getFoundItem(req, res) {
  try {
    const { itemId } = req.params;
    if (!UUID_RE.test(itemId)) {
      return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    }
    const { rows } = await db.query(
      `SELECT ${ITEM_COLUMNS} FROM found_items fi WHERE fi.id = $1`,
      [itemId]
    );
    if (rows.length === 0) {
      return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    }
    return res.json(rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
}

router.get('/found-items', listFoundItems);
router.get('/found-items/:itemId', getFoundItem);

// Browser-facing read-only proxy routes; never expose a shared API key to clients.
router.get('/web/found-items', listFoundItems);
router.get('/web/found-items/:itemId', getFoundItem);

router.post('/found-items/batch-lookup', async (req, res) => {
  try {
    const inventoryItemIds = req.body && req.body.inventoryItemIds;
    if (!Array.isArray(inventoryItemIds) || inventoryItemIds.length === 0 ||
        inventoryItemIds.some((id) => !isNonEmptyString(id))) {
      return fail(res, 400, 'invalid_request', 'inventoryItemIds must be a non-empty array of strings.');
    }

    const { rows } = await db.query(
      `SELECT DISTINCT ON (fc.inventory_item_id)
         fc.inventory_item_id AS "inventoryItemId",
         ${ITEM_COLUMNS}
       FROM flagged_checks fc
       JOIN found_items fi ON fi.id = fc.found_item_id
       WHERE fc.outcome = 'match' AND fc.inventory_item_id = ANY($1::varchar[])
       ORDER BY fc.inventory_item_id, fc.checked_at DESC`,
      [inventoryItemIds]
    );
    const matches = new Map(rows.map((row) => [
      row.inventoryItemId,
      {
        itemId: row.itemId,
        status: row.status,
        location: row.location,
        dateFound: row.dateFound,
        description: row.description,
        category: row.category,
      },
    ]));
    return res.json({
      results: inventoryItemIds.map((inventoryItemId) => ({
        inventoryItemId,
        matched: matches.has(inventoryItemId),
        foundItem: matches.get(inventoryItemId) || null,
      })),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

router.post('/flagged-checks', async (req, res) => {
  try {
    const { foundItemId, inventoryItemId, checkedBy, outcome } = req.body || {};
    if (!isNonEmptyString(foundItemId) || !isNonEmptyString(inventoryItemId) ||
        !isNonEmptyString(checkedBy) || !isNonEmptyString(outcome)) {
      return fail(res, 400, 'invalid_request', 'foundItemId, inventoryItemId, checkedBy, and outcome are required.');
    }
    if (!OUTCOMES.includes(outcome)) {
      return fail(res, 400, 'invalid_request', `outcome must be one of: ${OUTCOMES.join(', ')}.`);
    }
    if (!UUID_RE.test(foundItemId)) {
      return fail(res, 404, 'not_found', `No found item exists with ID ${foundItemId}.`);
    }
    const exists = await db.query('SELECT 1 FROM found_items WHERE id = $1', [foundItemId]);
    if (exists.rows.length === 0) {
      return fail(res, 404, 'not_found', `No found item exists with ID ${foundItemId}.`);
    }
    const { rows } = await db.query(
      `INSERT INTO flagged_checks (found_item_id, inventory_item_id, checked_by, outcome)
       VALUES ($1, $2, $3, $4)
       RETURNING check_id AS "checkId", found_item_id AS "foundItemId",
         inventory_item_id AS "inventoryItemId", checked_by AS "checkedBy",
         outcome, checked_at AS "checkedAt"`,
      [foundItemId, inventoryItemId.trim(), checkedBy.trim(), outcome]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

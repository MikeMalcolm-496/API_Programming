// Claims (inquiries) and the message thread on each claim.
const express = require('express');
const db = require('../db');
const { authenticate, staffOnly, studentOnly } = require('../middleware/auth');
const { UUID_RE, fail, serverError, isNonEmptyString } = require('../lib/shared');

const router = express.Router();
const isStaff = (u) => u.role === 'security' || u.role === 'admin';

const INQUIRY_COLUMNS = `
  i.id AS "inquiryId", i.found_item_id AS "itemId", i.claimant_user_id AS "claimantId",
  i.status, i.claim_description AS "claimDescription",
  i.created_at AS "createdAt", i.updated_at AS "updatedAt",
  fi.title AS "itemTitle", u.full_name AS "claimantName"`;
const INQUIRY_FROM = `FROM inquiries i
  JOIN found_items fi ON fi.id = i.found_item_id
  JOIN users u ON u.id = i.claimant_user_id`;

const itemNotFound = (res, id) => fail(res, 404, 'not_found', `No found item exists with ID ${id}.`);
const inquiryNotFound = (res, id) => fail(res, 404, 'not_found', `No inquiry exists with ID ${id}.`);

// POST /found-items/:itemId/inquiries   (student submits a claim)
router.post('/found-items/:itemId/inquiries', studentOnly, async (req, res) => {
  try {
    const { itemId } = req.params;
    const text = req.body && req.body.claimDescription;
    if (!isNonEmptyString(text)) return fail(res, 400, 'invalid_request', 'claimDescription is required.');
    if (!UUID_RE.test(itemId)) return itemNotFound(res, itemId);

    const item = await db.query('SELECT status FROM found_items WHERE id = $1', [itemId]);
    if (item.rowCount === 0) return itemNotFound(res, itemId);
    if (item.rows[0].status === 'claimed') return fail(res, 409, 'conflict', 'This item has already been claimed.');

    const dup = await db.query(
      `SELECT 1 FROM inquiries WHERE found_item_id = $1 AND claimant_user_id = $2 AND status = 'pending'`,
      [itemId, req.user.id]);
    if (dup.rowCount > 0) return fail(res, 409, 'conflict', 'You already have a pending claim on this item.');

    const { rows } = await db.query(
      `INSERT INTO inquiries (found_item_id, claimant_user_id, claim_description)
       VALUES ($1, $2, $3) RETURNING id`, [itemId, req.user.id, text.trim()]);
    await db.query(
      `UPDATE found_items SET status = 'pending-verification', updated_at = now()
       WHERE id = $1 AND status = 'unclaimed'`, [itemId]);
    const out = await db.query(`SELECT ${INQUIRY_COLUMNS} ${INQUIRY_FROM} WHERE i.id = $1`, [rows[0].id]);
    return res.status(201).json(out.rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /found-items/:itemId/inquiries   (staff)
router.get('/found-items/:itemId/inquiries', staffOnly, async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!UUID_RE.test(itemId)) return itemNotFound(res, itemId);
    const { rows } = await db.query(
      `SELECT ${INQUIRY_COLUMNS} ${INQUIRY_FROM} WHERE i.found_item_id = $1 ORDER BY i.created_at DESC`, [itemId]);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /inquiries/my   (student's own claims)
router.get('/inquiries/my', studentOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${INQUIRY_COLUMNS} ${INQUIRY_FROM} WHERE i.claimant_user_id = $1 ORDER BY i.created_at DESC`,
      [req.user.id]);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /inquiries?status=pending   (staff review queue; status optional)
router.get('/inquiries', staffOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const allowed = ['pending', 'approved', 'rejected'];
    if (status !== undefined && !allowed.includes(status)) {
      return fail(res, 400, 'invalid_request', `status must be one of: ${allowed.join(', ')}.`);
    }
    const { rows } = await db.query(
      `SELECT ${INQUIRY_COLUMNS} ${INQUIRY_FROM} ${status ? 'WHERE i.status = $1' : ''} ORDER BY i.created_at DESC`,
      status ? [status] : []);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

// PATCH /inquiries/:inquiryId/status   (staff approves / rejects)
// Keeps the item's contract status in step: approved -> claimed;
// rejected with no other pending claims -> back to unclaimed.
router.patch('/inquiries/:inquiryId/status', staffOnly, async (req, res) => {
  const { inquiryId } = req.params;
  const status = req.body && req.body.status;
  if (!['approved', 'rejected'].includes(status)) {
    return fail(res, 400, 'invalid_request', 'status must be one of: approved, rejected.');
  }
  if (!UUID_RE.test(inquiryId)) return inquiryNotFound(res, inquiryId);

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE inquiries SET status = $1, updated_at = now() WHERE id = $2 RETURNING found_item_id`,
      [status, inquiryId]);
    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return inquiryNotFound(res, inquiryId);
    }
    const itemId = upd.rows[0].found_item_id;
    if (status === 'approved') {
      await client.query(`UPDATE found_items SET status = 'claimed', updated_at = now() WHERE id = $1`, [itemId]);
    } else {
      await client.query(
        `UPDATE found_items SET status = 'unclaimed', updated_at = now()
         WHERE id = $1 AND status = 'pending-verification'
           AND NOT EXISTS (SELECT 1 FROM inquiries WHERE found_item_id = $1 AND status = 'pending')`,
        [itemId]);
    }
    await client.query('COMMIT');
    const out = await db.query(`SELECT ${INQUIRY_COLUMNS} ${INQUIRY_FROM} WHERE i.id = $1`, [inquiryId]);
    return res.json(out.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return serverError(res, err);
  } finally {
    if (client) client.release();
  }
});

// ---- Messages: only the claimant and staff may read or write a thread ----
async function loadThreadAccess(req, res) {
  const { inquiryId } = req.params;
  if (!UUID_RE.test(inquiryId)) { inquiryNotFound(res, inquiryId); return null; }
  const { rows } = await db.query('SELECT claimant_user_id FROM inquiries WHERE id = $1', [inquiryId]);
  if (rows.length === 0) { inquiryNotFound(res, inquiryId); return null; }
  if (!isStaff(req.user) && rows[0].claimant_user_id !== req.user.id) {
    fail(res, 403, 'forbidden', 'You do not have access to this inquiry.');
    return null;
  }
  return inquiryId;
}

const MESSAGE_SELECT = `SELECT m.id AS "messageId", m.inquiry_id AS "inquiryId", m.sender_user_id AS "senderId",
  u.full_name AS "senderName", u.role AS "senderRole", m.message, m.sent_at AS "sentAt"
  FROM inquiry_messages m JOIN users u ON u.id = m.sender_user_id`;

router.get('/inquiries/:inquiryId/messages', authenticate, async (req, res) => {
  try {
    const id = await loadThreadAccess(req, res);
    if (!id) return undefined;
    const { rows } = await db.query(`${MESSAGE_SELECT} WHERE m.inquiry_id = $1 ORDER BY m.sent_at ASC`, [id]);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

router.post('/inquiries/:inquiryId/messages', authenticate, async (req, res) => {
  try {
    const text = req.body && req.body.message;
    if (!isNonEmptyString(text)) return fail(res, 400, 'invalid_request', 'message is required.');
    const id = await loadThreadAccess(req, res);
    if (!id) return undefined;
    const ins = await db.query(
      `INSERT INTO inquiry_messages (inquiry_id, sender_user_id, message) VALUES ($1, $2, $3) RETURNING id`,
      [id, req.user.id, text.trim()]);
    const { rows } = await db.query(`${MESSAGE_SELECT} WHERE m.id = $1`, [ins.rows[0].id]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

// Integration: Lost & Found consuming the Strathbites API.
//
// Feature: claim verification. When someone claims a lost item, we check their
// Strathbites order history to see whether they were at the cafeteria where the
// item was found, on the day it was found, and how familiar they are with it.
//
// The actual HTTP calls to Strathbites live in lib/strathbites.js.
// The browser never calls Strathbites directly; it calls these routes.

const express = require('express');
const db = require('../db');
const { staffOnly } = require('../middleware/auth');
const { UUID_RE, fail, serverError } = require('../lib/shared');
const { verifyClaimant, extractLocationId, PartnerError } = require('../lib/strathbites');

const router = express.Router();
const wantsRaw = (q) => ['1', 'true', 'yes'].includes(String(q.debug || '').toLowerCase());

function sendPartnerError(res, err) {
  if (err instanceof PartnerError) {
    const body = { error: err.code, message: err.message };
    if (err.partnerCalls) body.partnerCalls = err.partnerCalls;
    return res.status(err.httpStatus).json(body);
  }
  return serverError(res, err);
}

// GET /claims/verify?userId=3&locationId=cafe-3[&lostDate=2026-10-20][&debug=true]
// Manual check: any Strathbites user ID against any location.
router.get('/claims/verify', async (req, res) => {
  try {
    const { userId, locationId, lostDate } = req.query;
    const result = await verifyClaimant(userId, locationId, { lostDate, includeRaw: wantsRaw(req.query) });
    return res.json(result);
  } catch (err) {
    return sendPartnerError(res, err);
  }
});

// GET /inquiries/:inquiryId/verify   (security/admin only)
// Proves (or questions) a real claim: takes the claimant's linked Strathbites ID,
// the cafeteria in the item's location and the date it was found, and asks Strathbites.
router.get('/inquiries/:inquiryId/verify', staffOnly, async (req, res) => {
  try {
    const { inquiryId } = req.params;
    if (!UUID_RE.test(inquiryId)) return fail(res, 404, 'not_found', `No inquiry exists with ID ${inquiryId}.`);
    const { rows } = await db.query(
      `SELECT i.id, i.status, i.claim_description,
              u.full_name, u.email, u.strathbites_user_id,
              fi.id AS item_id, fi.title, fi.location_found, to_char(fi.date_found, 'YYYY-MM-DD') AS date_found
         FROM inquiries i
         JOIN users u ON u.id = i.claimant_user_id
         JOIN found_items fi ON fi.id = i.found_item_id
        WHERE i.id = $1`, [inquiryId]);
    if (rows.length === 0) return fail(res, 404, 'not_found', `No inquiry exists with ID ${inquiryId}.`);
    const r = rows[0];

    const claim = {
      inquiryId: r.id,
      status: r.status,
      claimDescription: r.claim_description,
      claimant: { name: r.full_name, email: r.email, strathbitesUserId: r.strathbites_user_id },
      item: { itemId: r.item_id, title: r.title, location: r.location_found, dateFound: r.date_found },
    };

    const locationId = extractLocationId(r.location_found);
    if (!locationId) {
      return res.status(422).json({ error: 'not_verifiable', message: 'This item was not found at a Strathbites location (cafe-N), so there is no order data to check.', claim });
    }
    if (r.strathbites_user_id === null || r.strathbites_user_id === undefined) {
      return res.status(422).json({ error: 'not_verifiable', message: 'The claimant has not linked a Strathbites user ID to their account.', claim });
    }

    const verification = await verifyClaimant(String(r.strathbites_user_id), locationId, {
      lostDate: r.date_found, includeRaw: wantsRaw(req.query),
    });
    return res.json({ ...claim, verification });
  } catch (err) {
    return sendPartnerError(res, err);
  }
});

module.exports = router;

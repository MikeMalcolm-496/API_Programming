
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createHash, randomBytes } = require('crypto');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { fail, serverError, isNonEmptyString } = require('../lib/shared');
const { sendInvitationEmail } = require('../lib/mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['student', 'security', 'admin'];
const adminOnly = [authenticate, requireRole('admin')];
const hashInviteToken = (token) => createHash('sha256').update(token).digest('hex');

// Only expose public user information.
// Never include hashed_password or other private fields.
const publicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  role: u.role,
  studentId: u.student_id,
  strathbitesUserId: u.strathbites_user_id ?? null,
});

// Optional Strathbites user ID (a positive whole number);
// '' / null clears it.
const parseStrathbitesId = (v) => {
  if (v === undefined) return { skip: true };
  if (v === null || v === '') return { value: null };

  const n = Number(v);

  return Number.isInteger(n) && n > 0
    ? { value: n }
    : { error: 'strathbitesUserId must be a positive whole number.' };
};

// Public registration is disabled. User accounts are created through admin invites.
router.post('/register', async (req, res) => {
  return fail(res, 403, 'forbidden', 'Accounts can only be created by an administrator.');
});

// Public request is deliberately generic to avoid revealing whether an email has an account.
router.post('/invitation-requests', async (req, res) => {
  const email = req.body && req.body.email;
  if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) {
    return fail(res, 400, 'invalid_request', 'A valid email is required.');
  }
  try {
    await db.query(
      `INSERT INTO user_invitation_requests (email)
       SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)
       ON CONFLICT DO NOTHING`,
      [email.trim().toLowerCase()]);
    return res.status(202).json({
      message: 'If eligible, your request will be reviewed by an administrator. You will receive an email if an invitation is approved.',
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /auth/admin/invitations (administrator only)
router.post('/admin/invitations', adminOnly, async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.fullName)) return fail(res, 400, 'invalid_request', 'fullName is required.');
  if (!isNonEmptyString(b.email) || !EMAIL_RE.test(b.email.trim())) {
    return fail(res, 400, 'invalid_request', 'A valid email is required.');
  }
  const role = b.role === undefined ? 'student' : b.role;
  if (!ROLES.includes(role)) return fail(res, 400, 'invalid_request', `role must be one of: ${ROLES.join(', ')}.`);
  const sb = parseStrathbitesId(b.strathbitesUserId);
  if (sb.error) return fail(res, 400, 'invalid_request', sb.error);

  const token = randomBytes(32).toString('base64url');
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const email = b.email.trim().toLowerCase();
    const existingUser = await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'conflict', 'An account already exists for this email.');
    }
    await client.query(
      `UPDATE user_invitations SET used_at = now()
       WHERE lower(email) = $1 AND used_at IS NULL AND expires_at <= now()`, [email]);
    const existingInvite = await client.query(
      `SELECT 1 FROM user_invitations
       WHERE lower(email) = $1 AND used_at IS NULL AND expires_at > now()`, [email]);
    if (existingInvite.rowCount > 0) {
      await client.query('ROLLBACK');
      return fail(res, 409, 'conflict', 'A valid invitation already exists for this email.');
    }
    const inserted = await client.query(
      `INSERT INTO user_invitations
         (full_name, email, role, student_id, strathbites_user_id, token_hash, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours')
       RETURNING id, expires_at`,
      [
        b.fullName.trim(),
        email,
        role,
        isNonEmptyString(b.studentId) ? b.studentId.trim() : null,
        sb.value ?? null,
        hashInviteToken(token),
        req.user.id,
      ]);
    await client.query('COMMIT');
    try {
      await sendInvitationEmail({ email, fullName: b.fullName.trim(), token });
    } catch (err) {
      console.error('Invitation email could not be sent:', err);
      await db.query('UPDATE user_invitations SET used_at = now() WHERE id = $1', [inserted.rows[0].id]);
      return fail(res, 503, 'email_unavailable', 'Invitation email could not be sent. Check SMTP configuration and retry.');
    }
    return res.status(201).json({
      email,
      role,
      expiresAt: inserted.rows[0].expires_at,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return fail(res, 409, 'conflict', 'An account or invitation already exists for this email.');
    return serverError(res, err);
  } finally {
    if (client) client.release();
  }
});

// GET /auth/admin/invitation-requests (administrator only)
router.get('/admin/invitation-requests', adminOnly, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, status, created_at AS "createdAt"
       FROM user_invitation_requests
       WHERE status IN ('pending', 'email_failed')
       ORDER BY created_at ASC`);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /auth/admin/invitation-requests/:requestId/reject (administrator only)
router.post('/admin/invitation-requests/:requestId/reject', adminOnly, async (req, res) => {
  const { requestId } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return fail(res, 404, 'not_found', 'No invitation request exists with that ID.');
  }
  try {
    const result = await db.query(
      `UPDATE user_invitation_requests
       SET status = 'rejected', reviewed_at = now(), reviewed_by_user_id = $2
       WHERE id = $1 AND status IN ('pending', 'email_failed')
       RETURNING id`,
      [requestId, req.user.id]);
    if (result.rowCount === 0) return fail(res, 404, 'not_found', 'No pending invitation request exists with that ID.');
    return res.json({ status: 'rejected' });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /auth/admin/invitation-requests/:requestId/approve (administrator only)
router.post('/admin/invitation-requests/:requestId/approve', adminOnly, async (req, res) => {
  const { requestId } = req.params;
  const b = req.body || {};
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return fail(res, 404, 'not_found', 'No invitation request exists with that ID.');
  }
  if (!isNonEmptyString(b.fullName)) return fail(res, 400, 'invalid_request', 'fullName is required.');
  const role = b.role === undefined ? 'student' : b.role;
  if (!ROLES.includes(role)) return fail(res, 400, 'invalid_request', `role must be one of: ${ROLES.join(', ')}.`);
  const sb = parseStrathbitesId(b.strathbitesUserId);
  if (sb.error) return fail(res, 400, 'invalid_request', sb.error);

  const token = randomBytes(32).toString('base64url');
  let client;
  let invitationRequest;
  let invitationId;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, email FROM user_invitation_requests
       WHERE id = $1 AND status IN ('pending', 'email_failed')
       FOR UPDATE`,
      [requestId]);
    if (found.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(res, 404, 'not_found', 'No pending invitation request exists with that ID.');
    }
    invitationRequest = found.rows[0];
    const existingUser = await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [invitationRequest.email.toLowerCase()]);
    if (existingUser.rowCount > 0) {
      await client.query(
        `UPDATE user_invitation_requests SET status = 'rejected', reviewed_at = now(), reviewed_by_user_id = $2
         WHERE id = $1`, [requestId, req.user.id]);
      await client.query('COMMIT');
      return fail(res, 409, 'conflict', 'An account already exists for this email.');
    }

    await client.query(
      `UPDATE user_invitations SET used_at = now()
       WHERE lower(email) = $1 AND used_at IS NULL`, [invitationRequest.email.toLowerCase()]);
    const invitation = await client.query(
      `INSERT INTO user_invitations
         (full_name, email, role, student_id, strathbites_user_id, token_hash, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours')
       RETURNING id, expires_at`,
      [
        b.fullName.trim(),
        invitationRequest.email,
        role,
        isNonEmptyString(b.studentId) ? b.studentId.trim() : null,
        sb.value ?? null,
        hashInviteToken(token),
        req.user.id,
      ]);
    invitationId = invitation.rows[0].id;
    await client.query(
      `UPDATE user_invitation_requests
       SET status = 'email_failed', reviewed_at = now(), reviewed_by_user_id = $2, invitation_id = $3
       WHERE id = $1`,
      [requestId, req.user.id, invitationId]);
    await client.query('COMMIT');

    try {
      await sendInvitationEmail({ email: invitationRequest.email, fullName: b.fullName.trim(), token });
    } catch (err) {
      console.error('Invitation request email could not be sent:', err);
      await db.query('UPDATE user_invitations SET used_at = now() WHERE id = $1', [invitationId]);
      return fail(res, 503, 'email_unavailable', 'Invitation email could not be sent. Check SMTP configuration; the request remains available to retry.');
    }
    await db.query(
      `UPDATE user_invitation_requests SET status = 'emailed' WHERE id = $1 AND invitation_id = $2`,
      [requestId, invitationId]);
    return res.json({ email: invitationRequest.email, role, expiresAt: invitation.rows[0].expires_at });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return fail(res, 409, 'conflict', 'An account or invitation already exists for this email.');
    return serverError(res, err);
  } finally {
    if (client) client.release();
  }
});

// POST /auth/accept-invite (the invitation token is the sole authorization)
router.post('/accept-invite', async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.token)) return fail(res, 400, 'invalid_request', 'Invitation token is required.');
  if (typeof b.password !== 'string' || b.password.length < 8) {
    return fail(res, 400, 'invalid_request', 'password must be at least 8 characters.');
  }

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const invite = await client.query(
      `SELECT id, full_name, email, role, student_id, strathbites_user_id
       FROM user_invitations
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashInviteToken(b.token)]);
    if (invite.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(res, 400, 'invalid_request', 'This invitation is invalid, expired, or already used.');
    }
    const invitation = invite.rows[0];
    const passwordHash = await bcrypt.hash(b.password, 10);
    const account = await client.query(
      `INSERT INTO users (full_name, email, hashed_password, role, student_id, strathbites_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, role, student_id, strathbites_user_id`,
      [
        invitation.full_name,
        invitation.email,
        passwordHash,
        invitation.role,
        invitation.student_id,
        invitation.strathbites_user_id,
      ]);
    await client.query('UPDATE user_invitations SET used_at = now() WHERE id = $1', [invitation.id]);
    await client.query('COMMIT');
    return res.status(201).json(publicUser(account.rows[0]));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return fail(res, 409, 'conflict', 'An account already exists for this email.');
    return serverError(res, err);
  } finally {
    if (client) client.release();
  }
});

// POST /auth/login -> { token, user }
router.post('/login', async (req, res) => {
  try {
    const b = req.body || {};

    // Use the same response for an unknown email or incorrect password.
    const bad = () =>
      fail(res, 401, 'unauthorized', 'Invalid email or password.');

    if (!isNonEmptyString(b.email) || typeof b.password !== 'string') {
      return bad();
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set');

      return fail(
        res,
        500,
        'internal_error',
        'Server is not configured for authentication.'
      );
    }

    // Select only the columns needed for authentication and the user response.
    // hashed_password is required for bcrypt comparison but is never returned.
    const { rows } = await db.query(
      `SELECT
         id,
         full_name,
         email,
         hashed_password,
         role,
         student_id,
         strathbites_user_id
       FROM users
       WHERE email = $1`,
      [b.email.trim().toLowerCase()]
    );

    if (
      rows.length === 0 ||
      !(await bcrypt.compare(b.password, rows[0].hashed_password))
    ) {
      return bad();
    }

    const u = rows[0];

    const token = jwt.sign(
      { sub: u.id, role: u.role, email: u.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({
      token,
      user: publicUser(u),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    // This endpoint needs public user fields only.
    const { rows } = await db.query(
      `SELECT
         id,
         full_name,
         email,
         role,
         student_id,
         strathbites_user_id
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    }

    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

// PATCH /auth/me { strathbitesUserId }
// Link or unlink your Strathbites account.
router.patch('/me', authenticate, async (req, res) => {
  try {
    const sb = parseStrathbitesId(
      (req.body || {}).strathbitesUserId
    );

    if (sb.skip) {
      return fail(
        res,
        400,
        'invalid_request',
        'strathbitesUserId is required (use null to unlink).'
      );
    }

    if (sb.error) {
      return fail(res, 400, 'invalid_request', sb.error);
    }

    const { rows } = await db.query(
      `UPDATE users
       SET strathbites_user_id = $1
       WHERE id = $2
       RETURNING
         id,
         full_name,
         email,
         role,
         student_id,
         strathbites_user_id`,
      [sb.value, req.user.id]
    );

    if (rows.length === 0) {
      return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    }

    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

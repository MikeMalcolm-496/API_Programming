const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { fail, serverError, isNonEmptyString } = require('../lib/shared');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['student', 'security', 'admin'];

const publicUser = (u) => ({
  id: u.id, fullName: u.full_name, email: u.email, role: u.role, studentId: u.student_id,
  strathbitesUserId: u.strathbites_user_id ?? null,
});
// Optional Strathbites user ID (a positive whole number); '' / null clears it.
const parseStrathbitesId = (v) => {
  if (v === undefined) return { skip: true };
  if (v === null || v === '') return { value: null };
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? { value: n } : { error: 'strathbitesUserId must be a positive whole number.' };
};

// POST /auth/register
// Anyone can register as a student. security/admin accounts need the staff
// sign-up code (STAFF_SIGNUP_CODE in .env) so people cannot make themselves admin.
router.post('/register', async (req, res) => {
  try {
    const b = req.body || {};
    if (!isNonEmptyString(b.fullName)) return fail(res, 400, 'invalid_request', 'fullName is required.');
    if (!isNonEmptyString(b.email) || !EMAIL_RE.test(b.email.trim())) {
      return fail(res, 400, 'invalid_request', 'A valid email is required.');
    }
    if (typeof b.password !== 'string' || b.password.length < 8) {
      return fail(res, 400, 'invalid_request', 'password must be at least 8 characters.');
    }
    const role = b.role === undefined ? 'student' : b.role;
    if (!ROLES.includes(role)) return fail(res, 400, 'invalid_request', `role must be one of: ${ROLES.join(', ')}.`);
    if (role !== 'student') {
      const code = process.env.STAFF_SIGNUP_CODE;
      if (!code || b.staffCode !== code) {
        return fail(res, 403, 'forbidden', 'A valid staff sign-up code is required for this role.');
      }
    }
    const sb = parseStrathbitesId(b.strathbitesUserId);
    if (sb.error) return fail(res, 400, 'invalid_request', sb.error);
    const hash = await bcrypt.hash(b.password, 10);
    try {
      const { rows } = await db.query(
        `INSERT INTO users (full_name, email, hashed_password, role, student_id, strathbites_user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [b.fullName.trim(), b.email.trim().toLowerCase(), hash, role,
         isNonEmptyString(b.studentId) ? b.studentId.trim() : null, sb.value ?? null]
      );
      return res.status(201).json(publicUser(rows[0]));
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'conflict', 'A user with this email already exists.');
      throw e;
    }
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /auth/login  ->  { token, user }
router.post('/login', async (req, res) => {
  try {
    const b = req.body || {};
    const bad = () => fail(res, 401, 'unauthorized', 'Invalid email or password.'); // same message for both cases
    if (!isNonEmptyString(b.email) || typeof b.password !== 'string') return bad();
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set');
      return fail(res, 500, 'internal_error', 'Server is not configured for authentication.');
    }
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [b.email.trim().toLowerCase()]);
    if (rows.length === 0 || !(await bcrypt.compare(b.password, rows[0].hashed_password))) return bad();
    const u = rows[0];
    const token = jwt.sign({ sub: u.id, role: u.role, email: u.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.json({ token, user: publicUser(u) });
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

// PATCH /auth/me  { strathbitesUserId }  -> link (or unlink) your Strathbites account
router.patch('/me', authenticate, async (req, res) => {
  try {
    const sb = parseStrathbitesId((req.body || {}).strathbitesUserId);
    if (sb.skip) return fail(res, 400, 'invalid_request', 'strathbitesUserId is required (use null to unlink).');
    if (sb.error) return fail(res, 400, 'invalid_request', sb.error);
    const { rows } = await db.query(
      'UPDATE users SET strathbites_user_id = $1 WHERE id = $2 RETURNING *', [sb.value, req.user.id]);
    if (rows.length === 0) return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

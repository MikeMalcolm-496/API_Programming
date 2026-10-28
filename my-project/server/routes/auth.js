const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { fail, serverError, isNonEmptyString } = require('../lib/shared');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['student', 'security', 'admin'];
const adminOnly = [authenticate, requireRole('admin')];

const publicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  role: u.role,
  studentId: u.student_id,
  strathbitesUserId: u.strathbites_user_id ?? null,
  mustChangePassword: Boolean(u.must_change_password),
});

const parseStrathbitesId = (v) => {
  if (v === undefined) return { skip: true };
  if (v === null || v === '') return { value: null };

  const n = Number(v);
  return Number.isInteger(n) && n > 0
    ? { value: n }
    : { error: 'strathbitesUserId must be a positive whole number.' };
};

router.post('/admin/users', adminOnly, async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.fullName)) return fail(res, 400, 'invalid_request', 'fullName is required.');
  if (!isNonEmptyString(b.email) || !EMAIL_RE.test(b.email.trim())) {
    return fail(res, 400, 'invalid_request', 'A valid email is required.');
  }
  const role = b.role === undefined ? 'student' : b.role;
  if (!ROLES.includes(role)) return fail(res, 400, 'invalid_request', `role must be one of: ${ROLES.join(', ')}.`);
  const sb = parseStrathbitesId(b.strathbitesUserId);
  if (sb.error) return fail(res, 400, 'invalid_request', sb.error);

  const email = b.email.trim().toLowerCase();
  const temporaryPassword = randomBytes(12).toString('base64url');
  try {
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const { rows } = await db.query(
      `INSERT INTO users
         (full_name, email, hashed_password, role, student_id, strathbites_user_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, full_name, email, role, student_id, strathbites_user_id, must_change_password`,
      [
        b.fullName.trim(),
        email,
        hashedPassword,
        role,
        isNonEmptyString(b.studentId) ? b.studentId.trim() : null,
        sb.value ?? null,
      ]);

    return res.status(201).json({
      user: publicUser(rows[0]),
      temporaryPassword,
    });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'conflict', 'An account already exists for this email.');
    return serverError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const b = req.body || {};
    const bad = () => fail(res, 401, 'unauthorized', 'Invalid email or password.');
    if (!isNonEmptyString(b.email) || typeof b.password !== 'string') return bad();

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set');
      return fail(res, 500, 'internal_error', 'Server is not configured for authentication.');
    }

    const { rows } = await db.query(
      `SELECT id, full_name, email, hashed_password, role, student_id,
              strathbites_user_id, must_change_password
       FROM users
       WHERE email = $1`,
      [b.email.trim().toLowerCase()]);

    if (rows.length === 0 || !(await bcrypt.compare(b.password, rows[0].hashed_password))) {
      return bad();
    }

    const u = rows[0];
    const token = jwt.sign(
      { sub: u.id, role: u.role, email: u.email, mustChangePassword: Boolean(u.must_change_password) },
      process.env.JWT_SECRET,
      { expiresIn: '1h' });

    return res.json({ token, user: publicUser(u) });
  } catch (err) {
    return serverError(res, err);
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  if (!req.user.mustChangePassword) {
    return fail(res, 403, 'forbidden', 'Password changes are only available during first login.');
  }
  const password = (req.body || {}).password;
  if (typeof password !== 'string' || password.length < 8) {
    return fail(res, 400, 'invalid_request', 'password must be at least 8 characters.');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `UPDATE users
       SET hashed_password = $1, must_change_password = false
       WHERE id = $2
       RETURNING id, full_name, email, role, student_id, strathbites_user_id, must_change_password`,
      [hashedPassword, req.user.id]);
    if (rows.length === 0) return fail(res, 401, 'unauthorized', 'Account no longer exists.');

    const user = publicUser(rows[0]);
    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email, mustChangePassword: false },
      process.env.JWT_SECRET,
      { expiresIn: '1h' });
    return res.json({ token, user });
  } catch (err) {
    return serverError(res, err);
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, role, student_id, strathbites_user_id, must_change_password
       FROM users WHERE id = $1`,
      [req.user.id]);
    if (rows.length === 0) return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

router.patch('/me', authenticate, async (req, res) => {
  try {
    const sb = parseStrathbitesId((req.body || {}).strathbitesUserId);
    if (sb.skip) return fail(res, 400, 'invalid_request', 'strathbitesUserId is required (use null to unlink).');
    if (sb.error) return fail(res, 400, 'invalid_request', sb.error);

    const { rows } = await db.query(
      `UPDATE users SET strathbites_user_id = $1
       WHERE id = $2
       RETURNING id, full_name, email, role, student_id, strathbites_user_id, must_change_password`,
      [sb.value, req.user.id]);
    if (rows.length === 0) return fail(res, 401, 'unauthorized', 'Account no longer exists.');
    return res.json(publicUser(rows[0]));
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;

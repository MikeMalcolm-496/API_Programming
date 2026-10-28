const jwt = require('jsonwebtoken');
const { fail } = require('../lib/shared');

function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return fail(res, 401, 'unauthorized', 'Missing bearer token.');
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    return fail(res, 500, 'internal_error', 'Server is not configured for authentication.');
  }
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: p.sub,
      role: p.role,
      email: p.email,
      mustChangePassword: p.mustChangePassword === true,
    };
    if (
      p.mustChangePassword === true &&
      !(req.method === 'POST' && req.baseUrl === '/auth' && req.path === '/change-password')
    ) {
      return fail(res, 403, 'password_change_required', 'Change your temporary password before continuing.');
    }
    return next();
  } catch (e) {
    return fail(res, 401, 'unauthorized', 'Invalid or expired token.');
  }
}

// Usage: router.post('/x', authenticate, requireRole('security', 'admin'), handler)
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : fail(res, 403, 'forbidden', 'You do not have permission to perform this action.');

const staffOnly = [authenticate, requireRole('security', 'admin')];

module.exports = { authenticate, requireRole, staffOnly };

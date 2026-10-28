jest.mock('../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../db');
const app = require('../index');

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const JWT_SECRET = 'admin-created-accounts-test-secret';

function apiAs(id, role, mustChangePassword = false) {
  const authorization = `Bearer ${jwt.sign(
    { sub: id, role, mustChangePassword },
    JWT_SECRET
  )}`;
  return {
    get: (path) => request(app).get(path).set('Authorization', authorization),
    post: (path) => request(app).post(path).set('Authorization', authorization),
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  db.query.mockReset();
});

describe('admin-created accounts', () => {
  it('allows only administrators to create user accounts', async () => {
    const response = await apiAs(USER_ID, 'security')
      .post('/auth/admin/users')
      .send({ fullName: 'New User', email: 'new@example.test' });

    expect(response.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('creates an account with a generated temporary password stored as a hash', async () => {
    db.query.mockImplementationOnce(async (sql, values) => ({
      rows: [{
        id: USER_ID,
        full_name: values[0],
        email: values[1],
        role: values[3],
        student_id: values[4],
        strathbites_user_id: values[5],
        must_change_password: true,
      }],
    }));

    const response = await apiAs(ADMIN_ID, 'admin')
      .post('/auth/admin/users')
      .send({
        fullName: 'New User',
        email: 'NEW@example.test',
        role: 'student',
        studentId: 'S123',
        strathbitesUserId: 23,
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      id: USER_ID,
      fullName: 'New User',
      email: 'new@example.test',
      role: 'student',
      studentId: 'S123',
      strathbitesUserId: 23,
      mustChangePassword: true,
    });
    expect(response.body.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('must_change_password');
    expect(values[2]).not.toBe(response.body.temporaryPassword);
    await expect(bcrypt.compare(response.body.temporaryPassword, values[2])).resolves.toBe(true);
    expect(values).toMatchObject(['New User', 'new@example.test', expect.any(String), 'student', 'S123', 23]);
  });

  it('rejects invalid account details and duplicate emails', async () => {
    const invalid = await apiAs(ADMIN_ID, 'admin')
      .post('/auth/admin/users')
      .send({ fullName: 'New User', email: 'not-an-email' });
    expect(invalid.status).toBe(400);

    db.query.mockRejectedValueOnce({ code: '23505' });
    const duplicate = await apiAs(ADMIN_ID, 'admin')
      .post('/auth/admin/users')
      .send({ fullName: 'Existing User', email: 'existing@example.test' });
    expect(duplicate.status).toBe(409);
  });

  it('marks a temporary-password login and blocks protected endpoints', async () => {
    const passwordHash = await bcrypt.hash('temporary-password', 4);
    db.query.mockResolvedValueOnce({
      rows: [{
        id: USER_ID,
        full_name: 'New User',
        email: 'new@example.test',
        hashed_password: passwordHash,
        role: 'student',
        student_id: 'S123',
        strathbites_user_id: null,
        must_change_password: true,
      }],
    });

    const login = await request(app).post('/auth/login').send({
      email: 'NEW@example.test',
      password: 'temporary-password',
    });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect(jwt.verify(login.body.token, JWT_SECRET).mustChangePassword).toBe(true);

    const protectedResponse = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(protectedResponse.status).toBe(403);
    expect(protectedResponse.body.error).toBe('password_change_required');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('changes the temporary password and returns a normal session', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: USER_ID,
        full_name: 'New User',
        email: 'new@example.test',
        role: 'student',
        student_id: 'S123',
        strathbites_user_id: null,
        must_change_password: false,
      }],
    });

    const response = await apiAs(USER_ID, 'student', true)
      .post('/auth/change-password')
      .send({ password: 'a-new-secure-password' });

    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(false);
    expect(jwt.verify(response.body.token, JWT_SECRET).mustChangePassword).toBe(false);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('must_change_password = false');
    await expect(bcrypt.compare('a-new-secure-password', values[0])).resolves.toBe(true);
  });

  it('does not allow normal sessions to use the first-login password endpoint', async () => {
    const response = await apiAs(USER_ID, 'student')
      .post('/auth/change-password')
      .send({ password: 'a-new-secure-password' });

    expect(response.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not expose public registration or invitation endpoints', async () => {
    const paths = [
      ['/auth/register', { fullName: 'Someone', email: 'someone@example.test' }],
      ['/auth/invitation-requests', { email: 'someone@example.test' }],
      ['/auth/accept-invite', { token: 'token', password: 'password' }],
    ];
    for (const [path, body] of paths) {
      const response = await request(app).post(path).send(body);
      expect(response.status).toBe(404);
    }
  });
});

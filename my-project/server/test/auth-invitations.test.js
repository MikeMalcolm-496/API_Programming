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
const INVITATION_ID = '00000000-0000-4000-8000-000000000003';
const JWT_SECRET = 'auth-invitations-test-secret';

function apiAs(id, role) {
  const authorization = `Bearer ${jwt.sign({ sub: id, role }, JWT_SECRET)}`;
  return {
    post: (path) => request(app).post(path).set('Authorization', authorization),
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  db.query.mockReset();
  db.connect.mockReset();
});

describe('admin-managed account invitations', () => {
  it('disables public account registration', async () => {
    const response = await request(app).post('/auth/register').send({
      fullName: 'Uninvited User',
      email: 'uninvited@example.test',
      password: 'long-enough-password',
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/only be created by an administrator/i);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('only lets an administrator create an invitation', async () => {
    const response = await apiAs(USER_ID, 'security')
      .post('/auth/admin/invitations')
      .send({ fullName: 'New User', email: 'new@example.test' });

    expect(response.status).toBe(403);
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('creates a hashed, expiring invitation for an administrator', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [{ expires_at: '2030-01-01T00:00:00Z' }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);

    const response = await apiAs(ADMIN_ID, 'admin')
      .post('/auth/admin/invitations')
      .send({
        fullName: 'New User',
        email: 'NEW@example.test',
        role: 'student',
        strathbitesUserId: 23,
      });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe('new@example.test');
    expect(response.body.role).toBe('student');
    expect(response.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(client.query.mock.calls[4][1][5]).toMatch(/^[a-f0-9]{64}$/);
    expect(client.query.mock.calls[4][1][5]).not.toBe(response.body.token);
    expect(client.query.mock.calls[4][1][6]).toBe(ADMIN_ID);
    expect(client.release).toHaveBeenCalled();
  });

  it('accepts a valid invitation once and stores only a password hash', async () => {
    const rawToken = 'single-use-invitation-token';
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: INVITATION_ID,
            full_name: 'Invited User',
            email: 'invited@example.test',
            role: 'student',
            student_id: 'S123',
            strathbites_user_id: 23,
          }],
        })
        .mockImplementationOnce(async (sql, values) => ({
          rows: [{
            id: USER_ID,
            full_name: values[0],
            email: values[1],
            role: values[3],
            student_id: values[4],
            strathbites_user_id: values[5],
          }],
        }))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);

    const response = await request(app).post('/auth/accept-invite').send({
      token: rawToken,
      password: 'a-secure-password',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: USER_ID, email: 'invited@example.test', role: 'student' });
    const insertValues = client.query.mock.calls[2][1];
    expect(insertValues[2]).not.toBe('a-secure-password');
    await expect(bcrypt.compare('a-secure-password', insertValues[2])).resolves.toBe(true);
    expect(client.query.mock.calls[3][0]).toContain('used_at');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects invalid or already-used invitation tokens', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);

    const response = await request(app).post('/auth/accept-invite').send({
      token: 'invalid-token',
      password: 'a-secure-password',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/invalid, expired, or already used/i);
    expect(client.query.mock.calls[2][0]).toBe('ROLLBACK');
  });
});

jest.mock('../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../db');
const app = require('../index');

const CLAIMANT_ID = '00000000-0000-4000-8000-000000000001';
const STAFF_ID = '00000000-0000-4000-8000-000000000002';
const INQUIRY_ID = '00000000-0000-4000-8000-000000000003';
const ITEM_ID = '00000000-0000-4000-8000-000000000004';

function token(id, role) {
  return jwt.sign({ sub: id, role }, process.env.JWT_SECRET);
}

function apiAs(id, role) {
  const authorization = `Bearer ${token(id, role)}`;
  return {
    get: (path) => request(app).get(path).set('Authorization', authorization),
    post: (path) => request(app).post(path).set('Authorization', authorization),
    patch: (path) => request(app).patch(path).set('Authorization', authorization),
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = 'inquiries-test-secret';
  db.query.mockReset();
  db.connect.mockReset();
});

describe('inquiry claims and approval audit', () => {
  it.each(['student', 'security', 'admin'])('%s accounts can submit a claim', async (role) => {
    db.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'unclaimed' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: INQUIRY_ID }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({
        rows: [{ inquiryId: INQUIRY_ID, claimantId: CLAIMANT_ID, status: 'pending' }],
      });

    const response = await apiAs(CLAIMANT_ID, role)
      .post(`/found-items/${ITEM_ID}/inquiries`)
      .send({ claimDescription: 'I can identify a distinctive mark.' });

    expect(response.status).toBe(201);
    expect(response.body.claimantId).toBe(CLAIMANT_ID);
  });

  it('lets staff view their own claims', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ inquiryId: INQUIRY_ID, claimantId: STAFF_ID }] });

    const response = await apiAs(STAFF_ID, 'security').get('/inquiries/my');

    expect(response.status).toBe(200);
    expect(response.body[0].claimantId).toBe(STAFF_ID);
  });

  it('blocks a staff claimant from approving their own claim', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ found_item_id: ITEM_ID, claimant_user_id: STAFF_ID }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);

    const response = await apiAs(STAFF_ID, 'security')
      .patch(`/inquiries/${INQUIRY_ID}/status`)
      .send({ status: 'approved' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/cannot approve your own claim/i);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it('stores and returns the staff account that approved the claim', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ found_item_id: ITEM_ID, claimant_user_id: CLAIMANT_ID }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ found_item_id: ITEM_ID }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);
    db.query.mockResolvedValueOnce({
      rows: [{ inquiryId: INQUIRY_ID, approvedById: STAFF_ID, approvedByName: 'Reviewing staff' }],
    });

    const response = await apiAs(STAFF_ID, 'security')
      .patch(`/inquiries/${INQUIRY_ID}/status`)
      .send({ status: 'approved' });

    expect(response.status).toBe(200);
    expect(client.query.mock.calls[2][0]).toContain('approved_by_user_id');
    expect(client.query.mock.calls[2][1]).toEqual(['approved', INQUIRY_ID, STAFF_ID]);
    expect(response.body.approvedById).toBe(STAFF_ID);
    expect(response.body.approvedByName).toBe('Reviewing staff');
    expect(client.release).toHaveBeenCalled();
  });
});

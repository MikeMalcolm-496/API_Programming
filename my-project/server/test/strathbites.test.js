const originalFetch = global.fetch;
const originalPartnerUrl = process.env.PARTNER_URL;
const originalPartnerApiKey = process.env.PARTNER_API_KEY;

const strathbites = require('../lib/strathbites');

describe('Strathbites API requests', () => {
  beforeEach(() => {
    process.env.PARTNER_API_KEY = 'partner-test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ orderCount: 0, isFirstTimeUser: true }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPartnerUrl === undefined) delete process.env.PARTNER_URL;
    else process.env.PARTNER_URL = originalPartnerUrl;
    if (originalPartnerApiKey === undefined) delete process.env.PARTNER_API_KEY;
    else process.env.PARTNER_API_KEY = originalPartnerApiKey;
  });

  it('uses the partner /api routes and sends the configured API key', async () => {
    process.env.PARTNER_URL = 'https://partner.example';

    await strathbites.getOrderFrequency('3', 'cafe-3');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://partner.example/api/users/3/order-frequency?locationId=cafe-3',
      expect.objectContaining({
        headers: { Accept: 'application/json', 'X-API-Key': 'partner-test-key' },
      })
    );
  });

  it('does not duplicate /api when the configured URL already includes it', async () => {
    process.env.PARTNER_URL = 'https://partner.example/api/';

    await strathbites.getOrders('3', 'timestamp');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://partner.example/api/orders?userId=3&fields=timestamp',
      expect.objectContaining({
        headers: { Accept: 'application/json', 'X-API-Key': 'partner-test-key' },
      })
    );
  });
});

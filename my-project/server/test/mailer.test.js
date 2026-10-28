jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const nodemailer = require('nodemailer');
const { sendInvitationEmail } = require('../lib/mailer');

describe('invitation email delivery', () => {
  const originalEnv = { ...process.env };
  const sendMail = jest.fn();

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_USER: 'mailer@example.test',
      SMTP_PASS: 'test-password',
      SMTP_FROM: 'Lost & Found <noreply@example.test>',
      PUBLIC_APP_URL: 'https://lost.example.test',
    };
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-id' });
    nodemailer.createTransport.mockReset().mockReturnValue({ sendMail });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends an expiring-link email through authenticated SMTP', async () => {
    await sendInvitationEmail({
      email: 'person@example.test',
      fullName: 'A <User>',
      token: 'safe-token',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'mailer@example.test', pass: 'test-password' },
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'person@example.test',
      from: 'Lost & Found <noreply@example.test>',
      subject: 'Your Lost & Found account invitation',
      text: expect.stringContaining('https://lost.example.test/accept-invite.html?token=safe-token'),
      html: expect.stringContaining('A &lt;User&gt;'),
    }));
  });

  it('fails explicitly when SMTP settings are missing', async () => {
    delete process.env.SMTP_PASS;

    await expect(sendInvitationEmail({
      email: 'person@example.test',
      fullName: 'Person',
      token: 'safe-token',
    })).rejects.toThrow(/SMTP is not configured/);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

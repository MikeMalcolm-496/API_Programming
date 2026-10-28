const nodemailer = require('nodemailer');

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

async function sendInvitationEmail({ email, fullName, token }) {
  const { SMTP_FROM, PUBLIC_APP_URL } = process.env;
  if (!SMTP_FROM) throw new Error('SMTP_FROM is not configured.');
  if (!PUBLIC_APP_URL) throw new Error('PUBLIC_APP_URL is not configured.');

  let baseUrl;
  try {
    baseUrl = new URL(PUBLIC_APP_URL);
  } catch {
    throw new Error('PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new Error('PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL without embedded credentials.');
  }

  const inviteUrl = new URL('accept-invite.html', `${baseUrl.href.replace(/\/+$/, '')}/`);
  inviteUrl.searchParams.set('token', token);
  const name = fullName || 'there';
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Lost & Found account invitation',
    text: `Hello ${name},\n\nAn administrator invited you to create a Lost & Found account. This link is valid for 24 hours and can be used once:\n\n${inviteUrl.href}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>An administrator invited you to create a Lost &amp; Found account. This link is valid for 24 hours and can be used once:</p><p><a href="${escapeHtml(inviteUrl.href)}">Accept your invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
  });
}

module.exports = { sendInvitationEmail };

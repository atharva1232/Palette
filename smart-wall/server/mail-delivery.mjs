import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

export function mailConfiguration({ production, directory, mode = process.env.MAIL_MODE || (production ? 'resend' : 'file'), key = process.env.MAIL_ENCRYPTION_KEY, apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM, gmailUser = process.env.GMAIL_USER, gmailPassword = process.env.GMAIL_APP_PASSWORD } = {}) {
  if (!['file', 'resend', 'gmail'].includes(mode) || production && mode === 'file') throw new Error('Choose MAIL_MODE=gmail or resend for production; file is development only.');
  if (mode === 'resend' && (!apiKey || !from || /[\r\n]/.test(from) || !from.includes('@'))) throw new Error('Set RESEND_API_KEY and a verified MAIL_FROM sender.');
  if (mode === 'gmail') {
    if (!/^[A-Za-z0-9._%+-]+@gmail\.com$/i.test(gmailUser || '') || !/^[A-Za-z]{16}$/.test((gmailPassword || '').replace(/\s/g, ''))) throw new Error('Set GMAIL_USER and a 16-letter Google app password using npm run mail:setup:gmail.');
    gmailPassword = gmailPassword.replace(/\s/g, '');
    from = `SmartWall <${gmailUser}>`;
  }
  if (production && (!key || key.length < 32)) throw new Error('Set MAIL_ENCRYPTION_KEY to a random secret of at least 32 characters.');
  if (!key) {
    mkdirSync(directory, { recursive: true });
    const file = join(directory, '.mail-key');
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
    key = readFileSync(file, 'utf8');
  }
  return { directory, mode, apiKey, from, gmailUser, gmailPassword, key: createHash('sha256').update(key).digest() };
}
export function gmailTransport(config, factory = nodemailer.createTransport) {
  return factory({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: config.gmailUser, pass: config.gmailPassword },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
  });
}
export function mailTransport(config, factory) {
  const smtp = config.mode === 'gmail' ? gmailTransport(config, factory) : null;
  return async (message, id) => {
    if (config.mode === 'file') {
      mkdirSync(join(config.directory, 'mail'), { recursive: true });
      writeFileSync(join(config.directory, 'mail', `${id}.json`), JSON.stringify(message, null, 2), { mode: 0o600 });
      return;
    }
    if (smtp) {
      const result = await smtp.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html, messageId: `<${id}@smartwall.local>` });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Gmail did not accept the recipient.');
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  };
}

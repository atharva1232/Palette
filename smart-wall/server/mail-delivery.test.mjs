import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mailConfiguration, mailTransport } from './mail-delivery.mjs';
import { recoveryMessage } from './recovery-message.mjs';
const options = { mode: 'gmail', gmailUser: 'sender@gmail.com', gmailPassword: 'abcd efgh ijkl mnop', key: 'a'.repeat(32) };
test('Gmail configuration fixes sender and rejects incomplete credentials and production file mode', () => {
  const config = mailConfiguration({ ...options, production: true, from: 'Spoof <other@example.com>' });
  assert.equal(config.from, 'SmartWall <sender@gmail.com>');
  assert.equal(config.gmailPassword, 'abcdefghijklmnop');
  assert.throws(() => mailConfiguration({ ...options, gmailPassword: 'normal-password' }), /app password/);
  assert.throws(() => mailConfiguration({ ...options, gmailUser: 'sender@gmail.com\r\nBcc: other@example.com' }), /GMAIL_USER/);
  assert.throws(() => mailConfiguration({ ...options, production: true, mode: 'file' }), /production/);
});
test('Gmail uses authenticated TLS and passes both formats without exposing credentials in message', async () => {
  const config = mailConfiguration(options);
  let settings, sent;
  const send = mailTransport(config, value => { settings = value; return { sendMail: async message => { sent = message; return { accepted: [message.to], rejected: [] }; } }; });
  const message = recoveryMessage('recipient@example.com', 'verify', 'http://127.0.0.1:4200', 'safe-token');
  await send(message, 'job-id');
  assert.equal(settings.host, 'smtp.gmail.com'); assert.equal(settings.port, 465); assert.equal(settings.secure, true);
  assert.equal(settings.tls.rejectUnauthorized, true); assert.equal(settings.debug, false);
  assert.equal(settings.auth.pass, 'abcdefghijklmnop'); assert.equal(sent.from, config.from);
  assert.equal(sent.text, message.text); assert.equal(sent.html, message.html);
  assert.equal(sent.messageId, '<job-id@smartwall.local>'); assert.ok(!JSON.stringify(sent).includes(settings.auth.pass));
});
test('Gmail recipient rejection leaves delivery failed for queue retry', async () => {
  const send = mailTransport(mailConfiguration(options), () => ({ sendMail: async () => ({ accepted: [], rejected: ['recipient@example.com'] }) }));
  await assert.rejects(send({ to: 'recipient@example.com' }, 'job'), /did not accept/);
});
test('Mail encryption key survives switching from local files to Gmail', () => {
  const directory = mkdtempSync(join(tmpdir(), 'smartwall-mail-'));
  try {
    const before = mailConfiguration({ mode: 'file', directory });
    const after = mailConfiguration({ ...options, key: undefined, directory });
    assert.deepEqual(before.key, after.key);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('Recovery templates retain one-time links, expiry and escape HTML', () => {
  for (const purpose of ['verify', 'reset']) {
    const message = recoveryMessage('recipient@example.com', purpose, 'https://smartwall.example', 'token&"<');
    assert.ok(message.text.includes(`/#${purpose}=token`));
    assert.ok(message.html.includes('token&amp;&quot;&lt;'));
    assert.ok(message.text.includes(purpose === 'verify' ? '24 hours' : '30 minutes'));
    assert.ok(message.html.includes('works once'));
  }
});

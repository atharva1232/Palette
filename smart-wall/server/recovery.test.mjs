import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from './api.mjs';
import { tokenHash } from './security.mjs';

test('email verification, recovery tokens, revocation, private feedback and production frontend', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'smartwall-recovery-'));
  const file = join(directory, 'app.sqlite');
  const frontend = join(directory, 'frontend'); mkdirSync(frontend);
  writeFileSync(join(frontend, 'index.html'), '<!doctype html><title>Palettè trial</title>');
  writeFileSync(join(frontend, 'main-ABCDEFGH.js'), 'console.log("test")');
  const messages = [];
  let server;
  let url;
  const start = async () => {
    server = createApi({ file, frontend, production: true, origin: 'https://wall.example.test', mail: { mode: 'resend', apiKey: 'test-only', from: 'Palettè <hello@example.test>', key: 'test-only-encryption-secret-with-32-characters' }, transport: async message => { messages.push(message); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => { await new Promise(resolve => server.close(resolve)); await server.resourcesClosed; };
  const call = (path, value, cookie = '') => fetch(url + path, { method: value === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-SmartWall-Request': '1', Cookie: cookie }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const details = { name: 'Recovery Test', email: 'recover@example.test', password: 'original-password-123' };
  let cookie, user, originalVerification, resetToken;
  const token = (message, purpose) => message.text.match(new RegExp(`#${purpose}=([A-Za-z0-9_-]{43})`))[1];
  await start();
  try {
    await t.test('queues an encrypted verification email with a fixed HTTPS origin', async () => {
      const response = await call('/api/auth/signup', details);
      assert.equal(response.status, 201);
      assert.match(response.headers.get('set-cookie'), /__Host-smartwall=.*Secure/);
      cookie = response.headers.get('set-cookie').split(';')[0]; user = (await response.json()).user;
      assert.equal(user.emailVerified, false);
      const db = new DatabaseSync(file);
      const job = db.prepare('SELECT payload FROM mail_outbox').get();
      assert.ok(job); assert.equal(job.payload.includes(details.email), false);
      db.close();
      await server.mail.drain();
      const message = messages.find(item => item.subject.includes('Verify'));
      assert.match(message.text, /https:\/\/wall\.example\.test\/#verify=/);
      originalVerification = token(message, 'verify');
      const inspect = new DatabaseSync(file);
      assert.equal(inspect.prepare('SELECT hash FROM account_tokens').get().hash, tokenHash(originalVerification));
      inspect.close();
    });
    await t.test('resend invalidates the previous link and verification is single-use', async () => {
      const db = new DatabaseSync(file); db.prepare('UPDATE account_tokens SET created_at=?').run(Date.now() - 61_000); db.close();
      await call('/api/auth/resend-verification', {}, cookie); await server.mail.drain();
      const newest = token(messages.at(-1), 'verify');
      assert.notEqual(newest, originalVerification);
      assert.equal((await call('/api/auth/verify-email', { token: originalVerification })).status, 400);
      assert.equal((await call('/api/auth/verify-email', { token: newest })).status, 200);
      assert.equal((await call('/api/auth/verify-email', { token: newest })).status, 400);
      assert.equal((await (await call('/api/auth/me', undefined, cookie)).json()).user.emailVerified, true);
    });
    await t.test('unknown and known emails receive identical recovery responses without token disclosure', async () => {
      const unknown = await call('/api/auth/forgot-password', { email: 'unknown@example.test' });
      const known = await call('/api/auth/forgot-password', { email: details.email });
      assert.equal(unknown.status, 200); assert.equal(known.status, 200);
      assert.deepEqual(await unknown.json(), await known.json());
      await server.mail.drain(); resetToken = token(messages.at(-1), 'reset');
      assert.equal((await call('/api/auth/verify-email', { token: resetToken })).status, 400);
    });
    await t.test('tokens and email verification survive a restart', async () => {
      await close(); await start();
      const db = new DatabaseSync(file);
      assert.ok(db.prepare("SELECT 1 FROM account_tokens WHERE hash=? AND purpose='reset'").get(tokenHash(resetToken)));
      db.close();
      assert.equal((await (await call('/api/auth/me', undefined, cookie)).json()).user.emailVerified, true);
    });
    await t.test('invalid password does not consume the link; reset revokes all sessions and cannot be replayed', async () => {
      const second = await call('/api/auth/login', { email: details.email, password: details.password });
      const secondCookie = second.headers.get('set-cookie').split(';')[0];
      assert.equal((await call('/api/auth/reset-password', { token: resetToken, password: 'short' })).status, 400);
      const reset = await call('/api/auth/reset-password', { token: resetToken, password: 'new-password-456' });
      assert.equal(reset.status, 200); assert.match(reset.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal((await call('/api/auth/reset-password', { token: resetToken, password: 'different-password' })).status, 400);
      for (const session of [cookie, secondCookie]) assert.equal((await (await call('/api/auth/me', undefined, session)).json()).user, null);
      assert.equal((await call('/api/auth/login', { email: details.email, password: details.password })).status, 401);
      assert.equal((await call('/api/auth/login', { email: details.email, password: 'new-password-456' })).status, 200);
      await server.mail.drain();
      assert.ok(messages.some(message => message.subject.includes('password changed')));
    });
    await t.test('expired reset tokens fail and never change the password', async () => {
      await call('/api/auth/forgot-password', { email: details.email }); await server.mail.drain();
      const expired = token(messages.at(-1), 'reset');
      const db = new DatabaseSync(file); db.prepare("UPDATE account_tokens SET expires=0 WHERE purpose='reset'").run(); db.close();
      assert.equal((await call('/api/auth/reset-password', { token: expired, password: 'should-not-work' })).status, 400);
      assert.equal((await call('/api/auth/login', { email: details.email, password: 'new-password-456' })).status, 200);
    });
    await t.test('collects ratings privately without exposing a public feedback list', async () => {
      const feedback = { ease: 4, accuracy: 3, device: 'desktop', tasks: { upload: true, select: true, save: true, reopen: true, delete: false }, comment: 'Synthetic automated test, not a participant.' };
      assert.equal((await call('/api/trial/feedback', { ...feedback, ease: 8 })).status, 400);
      assert.equal((await call('/api/trial/feedback', feedback)).status, 201);
      assert.equal((await call('/api/trial/feedback')).status, 404);
      const db = new DatabaseSync(file); const row = db.prepare('SELECT * FROM trial_feedback').get(); db.close();
      assert.equal(row.comment, feedback.comment); assert.equal('email' in row, false);
    });
    await t.test('serves the compiled app with no-referrer and excludes source/private paths', async () => {
      const response = await call('/');
      assert.equal(response.status, 200); assert.match(await response.text(), /Palettè trial/);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.match((await call('/main-ABCDEFGH.js')).headers.get('cache-control'), /immutable/);
      for (const path of ['/.data/app.sqlite', '/server/api.mjs', '/.env', '/api/missing']) assert.equal((await call(path)).status, 404);
    });
  } finally { if (server.listening) await close(); }
});

test('production refuses development email fallback and missing sender secrets', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'smartwall-config-')), 'app.sqlite');
  assert.throws(() => createApi({ file, production: true, origin: 'https://example.test', mail: { mode: 'file' } }), /MAIL_MODE/);
  assert.throws(() => createApi({ file, production: true, origin: 'https://example.test', mail: { mode: 'resend', apiKey: '', from: '' } }), /RESEND_API_KEY/);
});

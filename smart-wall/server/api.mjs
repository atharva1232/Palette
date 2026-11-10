import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDatabase } from './database.mjs';
import { passwordHash, checkPassword, tokenHash, newToken, rateLimiter } from './security.mjs';
import { validatePattern } from './patterns.mjs';
import { validateDesign, designSummary } from './designs.mjs';
import { mailConfiguration, createMailQueue } from './mail.mjs';
import { accountRecovery } from './account-recovery.mjs';
import { staticFrontend } from './static.mjs';

const week = 7 * 24 * 60 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function body(request, max = 4096) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'JSON required.');
  if (Number(request.headers['content-length']) > max) fail(413, 'Request is too large.');
  const chunks = []; let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) fail(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'Invalid JSON.'); }
}
export function createApi({ file = fileURLToPath(new URL('../.data/smartwall.sqlite', import.meta.url)), origin = 'http://127.0.0.1:4200', production = false, mail: mailOptions = {}, transport, frontend } = {}) {
  const allowedOrigin = new URL(origin).origin;
  if (production && !allowedOrigin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS.');
  const mailConfig = mailConfiguration({ production, directory: dirname(file), ...mailOptions });
  const serveFrontend = frontend ? staticFrontend(frontend) : null;
  const db = openDatabase(file);
  const mail = createMailQueue(db, mailConfig, transport);
  const recovery = accountRecovery(db, mail, allowedOrigin);
  const publicUser = account => ({ id: account.id, name: account.name, email: account.email, emailVerified: !!(account.emailVerified ?? account.email_verified_at) });
  const limit = rateLimiter();
  const cookieName = production ? '__Host-smartwall' : 'smartwall_session';
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${production ? '; Secure' : ''}`;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (serveFrontend && path !== '/api' && !path.startsWith('/api/')) return serveFrontend(request, response, path);
      const method = request.method;
      if (!['GET', 'POST', 'DELETE'].includes(method)) fail(405, 'Method not allowed.');
      if (method !== 'GET') {
        if (request.headers['x-smartwall-request'] !== '1' || (request.headers.origin && request.headers.origin !== allowedOrigin) || request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Request origin is not allowed.');
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'JSON required.');
      }
      const rawToken = request.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
      const sessionHash = rawToken.length < 200 ? tokenHash(rawToken) : '';
      const now = Date.now();
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
      const user = rawToken ? db.prepare('SELECT u.id, u.name, u.email, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?').get(sessionHash, now) : null;
      const requireUser = () => { if (!user) fail(401, 'Please log in to continue.'); return user; };
      const establishSession = account => {
        const token = newToken();
        db.prepare('DELETE FROM sessions WHERE hash = ?').run(sessionHash);
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id = ? ORDER BY expires DESC LIMIT 9)').run(account.id, account.id);
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash(token), account.id, now + week);
        response.setHeader('Set-Cookie', cookie(token, week / 1000));
      };
      if (path === '/api/health' && method === 'GET') return send(200, { status: 'ok' });
      if (path === '/api/auth/me' && method === 'GET') return send(200, { user: user ? publicUser(user) : null });
      if (path === '/api/auth/forgot-password' && method === 'POST') {
        limit(`recovery-ip:${request.socket.remoteAddress}`, 10);
        const value = await body(request);
        if (typeof value?.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) fail(400, 'Enter a valid email address.');
        const account = db.prepare('SELECT id,email FROM users WHERE email=?').get(value.email.trim().toLowerCase());
        if (account) recovery.issue(account, 'reset');
        return send(200, { message: 'If an account exists for that email, a password-reset link has been queued. Check your inbox and spam folder.' });
      }
      if (path === '/api/auth/resend-verification' && method === 'POST') {
        requireUser(); limit(`verify-user:${user.id}`, 5);
        if (!user.email_verified_at) recovery.issue(user, 'verify');
        return send(200, { message: user.email_verified_at ? 'Your email is already verified.' : 'A verification email has been queued. Check your inbox and spam folder.' });
      }
      if (path === '/api/auth/verify-email' && method === 'POST') {
        limit(`verify-token:${request.socket.remoteAddress}`, 20);
        const value = await body(request);
        const id = recovery.verify(value?.token);
        return send(200, { message: 'Your email is verified. You can now share patterns.', userId: id });
      }
      if (path === '/api/auth/reset-password' && method === 'POST') {
        limit(`reset-token:${request.socket.remoteAddress}`, 20);
        const value = await body(request);
        await recovery.reset(value?.token, value?.password);
        response.setHeader('Set-Cookie', cookie('', 0));
        return send(200, { message: 'Your password has been changed. All sessions were signed out. Log in with your new password.' });
      }
      if (['/api/auth/signup', '/api/auth/login'].includes(path) && method === 'POST') {
        limit(`auth-ip:${request.socket.remoteAddress}`, 30);
        const value = await body(request);
        if (!value || typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) || typeof value.password !== 'string' || value.password.length < 8 || value.password.length > 128) fail(400, 'Enter a valid email and a password of 8–128 characters.');
        const email = value.email.trim().toLowerCase();
        limit(`auth-email:${email}`, 15);
        if (path.endsWith('signup')) {
          if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) fail(400, 'Enter a name of 1–80 characters.');
          if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'An account with this email already exists. Please log in.');
          const password = await passwordHash(value.password);
          // Check again after asynchronous hashing to handle simultaneous signups.
          if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'An account with this email already exists. Please log in.');
          const account = { id: randomUUID(), name: value.name.trim(), email };
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('INSERT INTO users (id,email,name,password,created_at) VALUES (?, ?, ?, ?, ?)').run(account.id, email, account.name, password, now);
            recovery.issue(account, 'verify', true);
            establishSession(account);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return send(201, { user: publicUser(account), message: 'Account created. A verification email has been queued.' });
        }
        const account = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!(await checkPassword(value.password, account?.password))) fail(401, 'Email or password is incorrect.');
        const currentAccount = db.prepare('SELECT * FROM users WHERE id=?').get(account.id);
        // A reset may finish while scrypt is running; the old password must not create a new session afterward.
        if (!currentAccount || currentAccount.password !== account.password) fail(401, 'Email or password is incorrect.');
        establishSession(currentAccount);
        return send(200, { user: publicUser(currentAccount) });
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE hash = ?').run(sessionHash);
        response.setHeader('Set-Cookie', cookie('', 0));
        return send(200, { ok: true });
      }
      if (path === '/api/account/stats' && method === 'GET') {
        requireUser();
        return send(200, { designs: db.prepare('SELECT count(*) AS total FROM designs WHERE user_id = ?').get(user.id).total, patterns: db.prepare('SELECT count(*) AS total FROM patterns WHERE user_id = ?').get(user.id).total });
      }
      if (path === '/api/patterns' && method === 'GET') {
        return send(200, db.prepare('SELECT * FROM patterns ORDER BY created_at DESC, id DESC LIMIT 500').all().map(p => ({ ...JSON.parse(p.data), id: p.id, ownerId: p.user_id })));
      }
      if (path === '/api/patterns' && method === 'POST') {
        requireUser(); limit(`pattern:${user.id}`, 60, 60 * 60_000);
        if (!user.email_verified_at) fail(403, 'Verify your email before sharing patterns. You can resend the email from your dashboard.');
        const pattern = validatePattern({ ...await body(request), author: user.name.slice(0, 40) });
        if (!pattern) fail(400, 'Invalid pattern fields.');
        if (db.prepare('SELECT count(*) AS total FROM patterns').get().total >= 500) fail(409, 'The shared pattern collection is full.');
        const id = randomUUID();
        db.prepare('INSERT INTO patterns VALUES (?, ?, ?, ?)').run(id, user.id, JSON.stringify(pattern), now);
        return send(201, { ...pattern, id, ownerId: user.id });
      }
      const patternPath = path.match(/^\/api\/patterns\/([0-9a-f-]+)$/i);
      if (patternPath && method === 'DELETE') {
        requireUser();
        const removed = db.prepare('DELETE FROM patterns WHERE id = ? AND user_id = ?').run(patternPath[1], user.id);
        if (!removed.changes) fail(404, 'Pattern not found.');
        return send(200, { ok: true });
      }
      if (path === '/api/designs' && method === 'GET') {
        requireUser();
        return send(200, db.prepare('SELECT id, name, saved_at, file_name, color FROM designs WHERE user_id = ? ORDER BY saved_at DESC, id DESC').all(user.id).map(designSummary));
      }
      if (path === '/api/designs' && method === 'POST') {
        requireUser(); limit(`design:${user.id}`, 100, 60 * 60_000);
        if (!user.email_verified_at) fail(403, 'Verify your email before saving photos to your account. You can resend the email from your dashboard.');
        const value = await body(request, 50 * 1024 * 1024);
        if (!uuid.test(value?.id)) fail(400, 'Invalid design ID.');
        const existing = db.prepare('SELECT id FROM designs WHERE id = ? AND user_id = ?').get(value.id, user.id);
        if (existing) return send(200, { id: existing.id });
        const design = validateDesign(value);
        const quota = db.prepare('SELECT count(*) AS total, coalesce(sum(bytes), 0) AS bytes FROM designs WHERE user_id = ?').get(user.id);
        if (quota.total >= 50 || quota.bytes + design.bytes > 256 * 1024 * 1024) fail(409, 'Your saved-design storage is full (50 designs or 256 MB). Delete some designs and retry.');
        db.prepare('INSERT INTO designs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(value.id, user.id, design.name, now, design.fileName, design.color, design.type, design.photo, design.preview, design.state, design.bytes);
        return send(201, { id: value.id });
      }
      if (path === '/api/designs/delete' && method === 'POST') {
        requireUser();
        const value = await body(request, 8192);
        if (!Array.isArray(value?.ids) || !value.ids.length || value.ids.length > 50 || !value.ids.every(id => typeof id === 'string' && uuid.test(id))) fail(400, 'Choose valid designs to delete.');
        const ids = [...new Set(value.ids)];
        const placeholders = ids.map(() => '?').join(',');
        const removed = db.prepare(`DELETE FROM designs WHERE user_id = ? AND id IN (${placeholders})`).run(user.id, ...ids);
        return send(200, { deleted: Number(removed.changes) });
      }
      const designPath = path.match(/^\/api\/designs\/([0-9a-f-]+)(?:\/(photo|preview))?$/i);
      if (designPath && method === 'GET') {
        requireUser();
        const row = db.prepare('SELECT * FROM designs WHERE id = ? AND user_id = ?').get(designPath[1], user.id);
        if (!row) fail(404, 'Design not found.');
        if (designPath[2]) {
          const kind = designPath[2];
          response.writeHead(200, { 'Content-Type': kind === 'photo' ? row.photo_type : 'image/png', 'Content-Disposition': `inline; filename="room.${kind === 'photo' && row.photo_type === 'image/jpeg' ? 'jpg' : kind === 'photo' && row.photo_type === 'image/webp' ? 'webp' : 'png'}"`, 'Content-Security-Policy': "default-src 'none'; sandbox" });
          return response.end(row[kind]);
        }
        return send(200, { ...designSummary(row), ...JSON.parse(row.state), photo: Buffer.from(row.photo).toString('base64'), photoType: row.photo_type, preview: Buffer.from(row.preview).toString('base64') });
      }
      if (path === '/api/trial/feedback' && method === 'POST') {
        limit(`feedback:${request.socket.remoteAddress}`, 5, 60 * 60_000);
        const value = await body(request, 8192);
        const keys = ['upload', 'select', 'save', 'reopen', 'delete'];
        if (!value || !Number.isInteger(value.ease) || value.ease < 1 || value.ease > 5 || !Number.isInteger(value.accuracy) || value.accuracy < 1 || value.accuracy > 5 || !['desktop', 'mobile', 'tablet'].includes(value.device) || typeof value.comment !== 'string' || value.comment.length > 2000 || !value.tasks || !keys.every(key => typeof value.tasks[key] === 'boolean')) fail(400, 'Complete the feedback ratings and device type.');
        db.prepare('INSERT INTO trial_feedback VALUES (?,?,?,?,?,?,?)').run(randomUUID(), now, value.ease, value.accuracy, value.device, JSON.stringify(Object.fromEntries(keys.map(key => [key, value.tasks[key]]))), value.comment.trim());
        return send(201, { message: 'Thank you. Your feedback has been saved privately for the Palettè trial.' });
      }
      fail(404, 'Not found.');
    } catch (error) {
      request.resume();
      if (error.status === 429) response.setHeader('Retry-After', '900');
      if (!error.status) console.error('API request failed:', error.message);
      if (!response.headersSent) send(error.status || 500, { error: error.status ? error.message : 'The server could not complete this request. Please retry.' });
      else response.end();
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.mail = mail;
  server.resourcesClosed = new Promise(resolve => server.on('close', () => { void mail.stop().finally(() => { db.close(); resolve(); }); }));
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const production = process.env.NODE_ENV === 'production';
  if (production && !process.env.APP_ORIGIN) throw new Error('Set APP_ORIGIN for production.');
  const server = createApi({ file: process.env.DATABASE_PATH || undefined, origin: process.env.APP_ORIGIN || 'http://127.0.0.1:4200', production, frontend: production ? resolve(process.env.STATIC_DIRECTORY || 'dist/smart-wall/browser') : undefined });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    setTimeout(() => server.closeAllConnections(), 5000).unref();
  });
  server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log('Palettè API ready on port ' + (process.env.PORT || 3001)));
}

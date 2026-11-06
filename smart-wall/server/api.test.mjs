import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from './api.mjs';

const pattern = { name: 'My arches', author: 'Spoofed author', style: 'Arches', base: '#fff0ee', ink: '#713343', scale: 32 };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==';
const design = () => ({ id: randomUUID(), name: 'My room', fileName: 'room.png', color: '#713343', strength: 90, tolerance: 32, photo: png, preview: png, boundary: '/w==', safety: '/w==', protectedAreas: 'AA==', seeds: [{ x: 0, y: 0 }], polygons: [[{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]] });

test('accounts, session lifecycle, private designs, ownership, migration and durable storage', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'smartwall-api-'));
  const file = join(folder, 'app.sqlite');
  const legacy = [{ id: 'old-pattern', ...pattern }];
  writeFileSync(join(folder, 'patterns.json'), JSON.stringify(legacy));
  let server; let base; const emails = [];
  const start = async () => {
    server = createApi({ file, transport: async message => { emails.push(message); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const close = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())).then(() => server.resourcesClosed);
  const call = (path, method = 'GET', value, cookie = '', extra = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-SmartWall-Request': '1', ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  let alice, bob, aliceCookie, bobCookie; const room = design(); let patternId;
  await start();
  try {
    await t.test('migrates old patterns once without modifying the backup', async () => {
      const records = await (await call('/api/patterns')).json();
      assert.equal(records.length, 1); assert.equal(records[0].id, 'old-pattern');
      assert.deepEqual(JSON.parse(readFileSync(join(folder, 'patterns.json'), 'utf8')), legacy);
    });
    await t.test('blocks unauthenticated and cross-origin writes', async () => {
      assert.equal((await call('/api/patterns', 'POST', pattern)).status, 401);
      assert.equal((await call('/api/designs')).status, 401);
      assert.equal((await call('/api/auth/signup', 'POST', {}, '', { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await call('/api/auth/logout', 'POST', {}, '', { 'X-SmartWall-Request': '' })).status, 403);
      assert.equal((await call('/api/auth/signup', 'POST', { name: 'A', email: 'bad', password: '123' })).status, 400);
    });
    await t.test('creates accounts, hashes passwords and sets HttpOnly sessions', async () => {
      const response = await call('/api/auth/signup', 'POST', { name: 'Alice', email: 'ALICE@example.com', password: 'testing-password-123' });
      assert.equal(response.status, 201);
      const header = response.headers.get('set-cookie');
      assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/);
      aliceCookie = header.split(';')[0]; alice = (await response.json()).user;
      assert.equal(alice.email, 'alice@example.com'); assert.equal(alice.password, undefined);
      assert.equal((await call('/api/auth/signup', 'POST', { name: 'Other', email: alice.email, password: 'testing-password-123' })).status, 409);
      const b = await call('/api/auth/signup', 'POST', { name: 'Bob', email: 'bob@example.com', password: 'other-password-123' });
      assert.equal(b.status, 201); bobCookie = b.headers.get('set-cookie').split(';')[0]; bob = (await b.json()).user;
      const db = new DatabaseSync(file);
      const stored = db.prepare('SELECT password FROM users WHERE id = ?').get(alice.id).password;
      assert.notEqual(stored, 'testing-password-123'); assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
      assert.equal(db.prepare('SELECT hash FROM sessions WHERE user_id = ?').get(alice.id).hash.includes(aliceCookie.split('=')[1]), false);
      db.close();
    });
    await t.test('requires email proof before publishing to the shared community', async () => {
      assert.equal((await call('/api/patterns', 'POST', pattern, aliceCookie)).status, 403);
      await server.mail.drain();
      const message = emails.find(item => item.to === alice.email);
      const token = message.text.match(/#verify=([A-Za-z0-9_-]{43})/)[1];
      assert.equal((await call('/api/auth/verify-email', 'POST', { token }, aliceCookie)).status, 200);
      assert.equal((await (await call('/api/auth/me', 'GET', undefined, aliceCookie)).json()).user.emailVerified, true);
    });
    await t.test('publishes patterns under the authenticated owner and blocks another owner deleting them', async () => {
      const response = await call('/api/patterns', 'POST', pattern, aliceCookie);
      assert.equal(response.status, 201);
      const created = await response.json(); patternId = created.id;
      assert.equal(created.ownerId, alice.id); assert.equal(created.author, 'Alice');
      assert.equal((await call(`/api/patterns/${patternId}`, 'DELETE', undefined, bobCookie)).status, 404);
    });
    await t.test('validates photos and mask dimensions and rejects oversized requests', async () => {
      assert.equal((await call('/api/designs', 'POST', { ...room, photo: Buffer.from('<svg/>').toString('base64') }, aliceCookie)).status, 400);
      assert.equal((await call('/api/designs', 'POST', { ...room, protectedAreas: 'AAAA' }, aliceCookie)).status, 400);
      assert.equal((await call('/api/auth/login', 'POST', { payload: 'x'.repeat(5000) })).status, 413);
    });
    await t.test('saves original, preview and editable state with idempotent retries', async () => {
      assert.equal((await call('/api/designs', 'POST', room, aliceCookie)).status, 201);
      assert.equal((await call('/api/designs', 'POST', room, aliceCookie)).status, 200);
      const list = await (await call('/api/designs', 'GET', undefined, aliceCookie)).json();
      assert.equal(list.length, 1); assert.equal(list[0].photo, undefined); assert.equal(list[0].boundary, undefined);
      const saved = await (await call(`/api/designs/${room.id}`, 'GET', undefined, aliceCookie)).json();
      assert.equal(saved.photo, room.photo); assert.equal(saved.preview, room.preview); assert.equal(saved.safety, room.safety);
      const image = await call(`/api/designs/${room.id}/photo`, 'GET', undefined, aliceCookie);
      assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(image.headers.get('cache-control'), 'no-store');
      assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), png);
    });
    await t.test('isolates lists, editable state, photo URLs and deletions between accounts', async () => {
      assert.deepEqual(await (await call('/api/designs', 'GET', undefined, bobCookie)).json(), []);
      for (const suffix of ['', '/photo', '/preview']) assert.equal((await call(`/api/designs/${room.id}${suffix}`, 'GET', undefined, bobCookie)).status, 404);
      assert.equal((await call(`/api/designs/${room.id}/photo`)).status, 401);
      assert.equal((await (await call('/api/designs/delete', 'POST', { ids: [room.id] }, bobCookie)).json()).deleted, 0);
      assert.equal((await call(`/api/designs/${room.id}`, 'GET', undefined, aliceCookie)).status, 200);
    });
    await t.test('retains accounts, sessions, designs and migrated patterns across restart', async () => {
      await close(); await start();
      assert.equal((await (await call('/api/auth/me', 'GET', undefined, aliceCookie)).json()).user.id, alice.id);
      assert.equal((await (await call('/api/designs', 'GET', undefined, aliceCookie)).json()).length, 1);
      assert.equal((await (await call('/api/patterns')).json()).length, 2);
      const stats = await (await call('/api/account/stats', 'GET', undefined, aliceCookie)).json();
      assert.deepEqual(stats, { designs: 1, patterns: 1 });
    });
    await t.test('enforces both the per-account design count and byte quotas', async () => {
      const db = new DatabaseSync(file);
      const copies = Array.from({ length: 49 }, () => randomUUID());
      const originalBytes = db.prepare('SELECT bytes FROM designs WHERE id = ? AND user_id = ?').get(room.id, alice.id).bytes;
      try {
        for (const id of copies) db.prepare('INSERT INTO designs SELECT ?, user_id, name, saved_at, file_name, color, photo_type, photo, preview, state, bytes FROM designs WHERE id = ? AND user_id = ?').run(id, room.id, alice.id);
        assert.equal((await call('/api/designs', 'POST', design(), aliceCookie)).status, 409);
        await call('/api/designs/delete', 'POST', { ids: copies }, aliceCookie);
        db.prepare('UPDATE designs SET bytes = ? WHERE id = ? AND user_id = ?').run(256 * 1024 * 1024, room.id, alice.id);
        assert.equal((await call('/api/designs', 'POST', design(), aliceCookie)).status, 409);
      } finally {
        for (const id of copies) db.prepare('DELETE FROM designs WHERE id = ? AND user_id = ?').run(id, alice.id);
        db.prepare('UPDATE designs SET bytes = ? WHERE id = ? AND user_id = ?').run(originalBytes, room.id, alice.id);
        db.close();
      }
    });
    await t.test('revokes logout and expired sessions and rejects incorrect credentials', async () => {
      assert.equal((await call('/api/auth/login', 'POST', { email: alice.email, password: 'wrong-password' })).status, 401);
      assert.equal((await call('/api/auth/logout', 'POST', {}, aliceCookie)).status, 200);
      assert.equal((await (await call('/api/auth/me', 'GET', undefined, aliceCookie)).json()).user, null);
      assert.equal((await call('/api/designs', 'GET', undefined, aliceCookie)).status, 401);
      const login = await call('/api/auth/login', 'POST', { email: alice.email, password: 'testing-password-123' });
      assert.equal(login.status, 200); aliceCookie = login.headers.get('set-cookie').split(';')[0];
      const db = new DatabaseSync(file); db.prepare('UPDATE sessions SET expires = 0 WHERE user_id = ?').run(bob.id); db.close();
      assert.equal((await call('/api/designs', 'GET', undefined, bobCookie)).status, 401);
    });
    await t.test('deletes selected designs atomically and leaves other designs intact', async () => {
      const second = design(); await call('/api/designs', 'POST', second, aliceCookie);
      assert.equal((await (await call('/api/designs/delete', 'POST', { ids: [room.id] }, aliceCookie)).json()).deleted, 1);
      assert.equal((await call(`/api/designs/${room.id}/photo`, 'GET', undefined, aliceCookie)).status, 404);
      const list = await (await call('/api/designs', 'GET', undefined, aliceCookie)).json();
      assert.deepEqual(list.map(x => x.id), [second.id]);
      await call('/api/designs/delete', 'POST', { ids: list.map(x => x.id) }, aliceCookie);
      assert.deepEqual(await (await call('/api/designs', 'GET', undefined, aliceCookie)).json(), []);
      assert.equal((await call(`/api/patterns/${patternId}`, 'DELETE', undefined, aliceCookie)).status, 200);
    });
    await t.test('rate limits repeated authentication attempts', async () => {
      let status;
      for (let i = 0; i < 35; i++) status = (await call('/api/auth/login', 'POST', {})).status;
      assert.equal(status, 429);
    });
  } finally { if (server.listening) await close(); /* Temporary test DB is retained under the OS temp directory for diagnostics. */ }
});
test('production refuses insecure origin configuration', () => {
  assert.throws(() => createApi({ production: true, origin: 'http://example.com' }), /HTTPS/);
});

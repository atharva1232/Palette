// Isolated local production smoke check; no real email is sent and no live database is touched.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { connectMongo } from '../server/mongo.mjs';
import { verifyBackup } from '../server/mongo-backup.mjs';
import assert from 'node:assert/strict';

const directory = mkdtempSync(join(tmpdir(), 'smartwall-release-'));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const backupDirectory = join(directory, 'backups');
const store=await connectMongo({uri:process.env.TEST_MONGODB_URI,name:'release_'+randomBytes(8).toString('hex'),directory,local:!process.env.TEST_MONGODB_URI,localPort:0});
let logs = '';
const child = spawn(process.execPath, ['scripts/mean-server.mjs','--production'], { cwd: resolve('.'), windowsHide: true, env: {
  ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
  APP_ORIGIN: 'https://release-check.example.test', MONGODB_URI:store.uri, MONGODB_DATABASE:store.db.databaseName, DATA_DIRECTORY:directory, JWT_SECRET:randomBytes(32).toString('hex'), LEGACY_SQLITE_PATH:join(directory,'no-source.sqlite'), BACKUP_DIR: backupDirectory,
  MAIL_MODE: 'resend', MAIL_FROM: 'Release check <no-send@example.test>', RESEND_API_KEY: 'synthetic-no-delivery-check', MAIL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
} });
child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Production startup failed: ' + logs);
    try { ready = (await fetch(base + '/api/health')).status === 200; } catch { /* Startup may still be binding. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'Health endpoint must start');
  const page = await fetch(base + '/');
  const html=await page.text(); assert.equal(page.status, 200); assert.match(html, /app-root/); assert.doesNotMatch(html, /data-beasties-media|<script>/, 'CSP must not block deferred global styles'); const css=html.match(/href="(styles-[^"]+\.css)"/); assert.ok(css); const stylesheet=await fetch(base+'/'+css[1]);assert.equal(stylesheet.status,200);assert.match(await stylesheet.text(),/footer-top/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  for (const path of ['/.env', '/.data/app.sqlite', '/server/api.mjs']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/api/designs')).status, 401);
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SmartWall-Request': '1', Origin: 'https://evil.example' }, body: '{}' })).status, 403);
  let snapshots = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    try { snapshots = readdirSync(backupDirectory).filter(name => /^mongo-\d+-[0-9a-f-]{36}$/.test(name)); } catch { /* Initial snapshot may still be running. */ }
    if (snapshots.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(snapshots.length, 'Production must create an initial backup');
  assert.ok(verifyBackup(join(backupDirectory,snapshots[0])).collections.length);
  console.log(JSON.stringify({ productionStartup: 'passed', compiledFrontend: 'passed', privatePaths: 'blocked', unauthenticatedDesigns: 'blocked', crossOriginWrites: 'blocked', automaticBackup: 'verified', realEmailDelivery: 'not tested', publicHttps: 'not deployed', diagnostics: directory }, null, 2));
} finally { child.kill('SIGTERM'); await exited; await store.db.dropDatabase(); await store.close(); }

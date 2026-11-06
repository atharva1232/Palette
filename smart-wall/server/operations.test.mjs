import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database.mjs';
import { mailConfiguration, createMailQueue } from './mail.mjs';
import { databaseBackup } from './backups.mjs';

test('failed email deliveries remain encrypted and retry without duplicates', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'smartwall-mail-'));
  const file = join(directory, 'app.sqlite');
  let db = openDatabase(file);
  db.prepare('INSERT INTO users (id,email,name,password,created_at) VALUES (?,?,?,?,?)').run('one', 'mail@example.test', 'Mail Test', 'not-a-real-password', Date.now());
  const config = mailConfiguration({ production: false, directory });
  const delivered = [];
  let fail = true;
  let queue = createMailQueue(db, config, async (message, id) => { if (fail) throw new Error('Provider offline'); delivered.push({ message, id }); });
  const message = { to: 'mail@example.test', subject: 'Test', text: 'sensitive-reset-token' };
  try {
    queue.enqueue('one', 'reset', message, Date.now() + 60_000);
    const id = db.prepare('SELECT id FROM mail_outbox').get().id;
    await queue.drain();
    const job = db.prepare('SELECT * FROM mail_outbox').get();
    assert.equal(job.attempts, 1); assert.equal(job.payload.includes(message.text), false);
    assert.ok(job.next_attempt > Date.now());
    await queue.stop(); db.close();
    db = openDatabase(file);
    const restoredConfig = mailConfiguration({ production: false, directory });
    assert.ok(restoredConfig.key.equals(config.key));
    fail = false;
    queue = createMailQueue(db, restoredConfig, async (message, id) => { delivered.push({ message, id }); });
    db.prepare('UPDATE mail_outbox SET next_attempt=0').run();
    await queue.drain(); await queue.drain();
    assert.deepEqual(delivered, [{ message, id }]);
    assert.equal(db.prepare('SELECT count(*) AS total FROM mail_outbox').get().total, 0);
  } finally { await queue.stop(); db.close(); }
});

test('backups include committed WAL data, pass integrity and retain only verified snapshots', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'smartwall-backup-'));
  const file = join(directory, 'app.sqlite');
  const folder = join(directory, 'backups');
  const db = openDatabase(file);
  db.prepare('INSERT INTO users (id,email,name,password,created_at) VALUES (?,?,?,?,?)').run('one', 'backup@example.test', 'Backup Test', 'not-a-real-password', Date.now());
  db.prepare('INSERT INTO designs VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('room', 'one', 'Room snapshot', Date.now(), 'room.png', '#713343', 'image/png', Buffer.from('original-photo'), Buffer.from('painted-photo'), JSON.stringify({ strength: 90, boundary: '/w==' }), 64);
  let first;
  try {
    first = await databaseBackup(file, folder, 2);
    const copy = new DatabaseSync(first, { readOnly: true });
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(copy.prepare('SELECT name FROM users WHERE id=?').get('one').name, 'Backup Test');
    const saved = copy.prepare('SELECT photo,preview,state FROM designs WHERE id=?').get('room');
    assert.equal(Buffer.from(saved.photo).toString(), 'original-photo');
    assert.equal(Buffer.from(saved.preview).toString(), 'painted-photo');
    assert.equal(JSON.parse(saved.state).strength, 90);
    copy.close();
    writeFileSync(join(folder, 'operator-note.txt'), 'keep this unrelated file');
    // Snapshot names remain unique even if two jobs start in the same millisecond.
    await databaseBackup(file, folder, 2);
    await databaseBackup(file, folder, 2);
    const files = readdirSync(folder);
    assert.equal(files.filter(name => name.endsWith('.sqlite')).length, 2);
    assert.ok(files.includes('operator-note.txt'));
    const latest = files.filter(name => name.endsWith('.sqlite')).sort().at(-1);
    const restored = openDatabase(join(folder, latest));
    assert.equal(restored.prepare('SELECT count(*) AS total FROM users').get().total, 1);
    restored.close();
    await assert.rejects(databaseBackup(file, folder, 0), /retention/);
  } finally { db.close(); }
});

test('the verification migration preserves existing accounts and leaves them unverified', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'smartwall-migration-')), 'app.sqlite');
  const previous = new DatabaseSync(file);
  previous.exec('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL)');
  previous.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('existing', 'existing@example.test', 'Existing account', 'existing-password-hash', 1);
  previous.close();
  const db = openDatabase(file);
  try {
    const account = db.prepare('SELECT * FROM users WHERE id=?').get('existing');
    assert.equal(account.password, 'existing-password-hash');
    assert.equal(account.email_verified_at, null);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  } finally { db.close(); }
});

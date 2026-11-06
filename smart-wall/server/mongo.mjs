import { applySchemas } from './schema.mjs';
import { MongoClient, GridFSBucket } from 'mongodb';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { finished } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';

export function localSecret(directory, name) {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, name);
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
  return readFileSync(file, 'utf8');
}
export async function connectMongo({ uri, name = 'smartwall', directory = resolve('.data'), local = false, localPort = 27019 } = {}) {
  let runtime;
  if (!uri) {
    if (!local) throw new Error('MONGODB_URI is required. Production never starts a development database.');
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    mkdirSync(join(directory, 'mongo'), { recursive: true });
    runtime = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION || '8.0.34', ...(process.platform === 'win32' && process.arch === 'arm64' ? { arch: 'x64' } : {}) }, instanceOpts: [{ dbPath: join(directory, 'mongo'), port: localPort }], replSet: { count: 1, storageEngine: 'wiredTiger', name: 'smartwall' } });
    uri = runtime.getUri();
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(name);
  await applySchemas(db);
  const bucket = new GridFSBucket(db, { bucketName: 'media' });
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('tokens').createIndex({ userId: 1, purpose: 1 }, { unique: true }),
    db.collection('projects').createIndex({ userId: 1, savedAt: -1 }),
    db.collection('visits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('events').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return {
    client, db, bucket, directory, uri,
    async transaction(callback) { const session = client.startSession(); try { return await session.withTransaction(() => callback(session), { readConcern: { level: 'snapshot' } }); } finally { await session.endSession(); } },
    async putFile(id, bytes, contentType) {
      if (await db.collection('media.files').findOne({ _id: id })) return id;
      const upload = bucket.openUploadStreamWithId(id, 'room', { metadata: { contentType } });
      upload.end(bytes); await finished(upload); return id;
    },
    async file(id) { const chunks = []; for await (const chunk of bucket.openDownloadStream(id)) chunks.push(chunk); return Buffer.concat(chunks); },
    async removeFile(id) { if (id && await db.collection('media.files').findOne({ _id: id })) await bucket.delete(id); },
    async close() { await client.close(); if (runtime) await runtime.stop({ doCleanup: false }); },
  };
}

/** Non-destructive, resumable import. Existing destination IDs are never overwritten. */
export async function migrateSqlite(store, file) {
  if (!existsSync(file) || await store.db.collection('migrations').findOne({ _id: 'sqlite-v1' })) return;
  const legacy = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = new Set(legacy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    const rows = table => tables.has(table) ? legacy.prepare(`SELECT * FROM ${table}`).all() : [];
    for (const row of rows('users')) await store.db.collection('users').updateOne({ _id: row.id }, { $setOnInsert: { name: row.name, email: row.email, password: row.password, createdAt: row.created_at, verifiedAt: row.email_verified_at || null, role: 'user', disabled: false, authVersion: 0, favourites: [], storageBytes: 0, projectCount: 0 } }, { upsert: true });
    for (const row of rows('sessions')) await store.db.collection('sessions').updateOne({ _id: row.hash }, { $setOnInsert: { userId: row.user_id, expiresAt: new Date(row.expires), createdAt: Date.now(), legacy: true } }, { upsert: true });
    for (const row of rows('patterns')) await store.db.collection('patterns').updateOne({ _id: row.id }, { $setOnInsert: { ...JSON.parse(row.data), ownerId: row.user_id, createdAt: row.created_at } }, { upsert: true });
    for (const row of rows('designs')) {
      const id = `${row.user_id}:${row.id}`;
      if (await store.db.collection('projects').findOne({ _id: id })) continue;
      const photoId = await store.putFile(id + ':photo', Buffer.from(row.photo), row.photo_type);
      const previewId = await store.putFile(id + ':preview', Buffer.from(row.preview), 'image/png');
      await store.transaction(async session => {
        if (await store.db.collection('projects').findOne({ _id: id }, { session })) return;
        await store.db.collection('projects').insertOne({ _id: id, id: row.id, userId: row.user_id, name: row.name, savedAt: row.saved_at, createdAt: row.saved_at, updatedAt: row.saved_at, fileName: row.file_name, color: row.color, photoType: row.photo_type, photoId, previewId, state: JSON.parse(row.state), bytes: row.bytes }, { session });
        await store.db.collection('users').updateOne({ _id: row.user_id }, { $inc: { projectCount: 1, storageBytes: row.bytes } }, { session });
      });
    }
    for (const row of rows('account_tokens')) await store.db.collection('tokens').updateOne({ userId: row.user_id, purpose: row.purpose }, { $setOnInsert: { hash: row.hash, expires: row.expires, createdAt: row.created_at } }, { upsert: true });
    for (const row of rows('mail_outbox')) await store.db.collection('outbox').updateOne({ _id: row.id }, { $setOnInsert: { userId: row.user_id, purpose: row.purpose, payload: row.payload, attempts: row.attempts, nextAttempt: row.next_attempt, expires: row.expires } }, { upsert: true });
    for (const row of rows('trial_feedback')) await store.db.collection('feedback').updateOne({ _id: row.id }, { $setOnInsert: { createdAt: row.created_at, ease: row.ease, accuracy: row.accuracy, device: row.device, tasks: JSON.parse(row.tasks), comment: row.comment } }, { upsert: true });
    await store.db.collection('migrations').updateOne({ _id: 'sqlite-v1' }, { $set: { completedAt: Date.now() } }, { upsert: true });
  } finally { legacy.close(); }
}

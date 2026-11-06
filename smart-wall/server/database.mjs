import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validatePattern } from './patterns.mjs';

export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS patterns (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS designs (id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, saved_at INTEGER NOT NULL, file_name TEXT NOT NULL, color TEXT NOT NULL, photo_type TEXT NOT NULL, photo BLOB NOT NULL, preview BLOB NOT NULL, state TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(id, user_id));
    CREATE INDEX IF NOT EXISTS designs_owner ON designs(user_id, saved_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS patterns_owner ON patterns(user_id);
    CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS account_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS account_token_purpose ON account_tokens(user_id, purpose);
    CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trial_feedback (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, ease INTEGER NOT NULL, accuracy INTEGER NOT NULL, device TEXT NOT NULL, tasks TEXT NOT NULL, comment TEXT NOT NULL);`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
  }
  db.exec('PRAGMA user_version = 2');
  // Import once, without changing or deleting the original JSON backup.
  if (!db.prepare('SELECT 1 FROM migrations WHERE name = ?').get('legacy-patterns')) {
    const legacy = join(dirname(file), 'patterns.json');
    const patterns = existsSync(legacy) ? JSON.parse(readFileSync(legacy, 'utf8')) : [];
    if (!Array.isArray(patterns) || patterns.some(p => !validatePattern(p) || typeof p.id !== 'string')) {
      db.close(); throw new Error('Legacy pattern data is invalid; repair patterns.json before starting.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of patterns) db.prepare('INSERT OR IGNORE INTO patterns VALUES (?, NULL, ?, ?)').run(p.id, JSON.stringify(validatePattern(p)), Date.now());
      db.prepare('INSERT INTO migrations VALUES (?)').run('legacy-patterns');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}

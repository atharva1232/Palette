import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

export async function databaseBackup(source, directory, retain = 7) {
  const root = resolve(directory);
  if (!Number.isInteger(retain) || retain < 1 || retain > 90) throw new Error('Backup retention must be between 1 and 90.');
  mkdirSync(root, { recursive: true });
  const name = `smartwall-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.sqlite`;
  const temporary = join(root, name + '.partial');
  const target = join(root, name);
  if (resolve(source) === target || resolve(source) === temporary) throw new Error('Backup cannot overwrite the live database.');
  const database = new DatabaseSync(resolve(source), { readOnly: true });
  try { await backup(database, temporary); } finally { database.close(); }
  const check = new DatabaseSync(temporary, { readOnly: true });
  try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.'); }
  finally { check.close(); }
  renameSync(temporary, target);
  const files = readdirSync(root).filter(file => /^smartwall-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{8})?\.sqlite$/.test(file)).sort().reverse();
  for (const file of files.slice(retain)) {
    const expired = resolve(root, file);
    if (!expired.startsWith(root + sep) || expired === resolve(source)) throw new Error('Unsafe backup cleanup path.');
    unlinkSync(expired);
  }
  return target;
}
export function scheduledBackups({ source, directory, hours = 24, retain = 7 }) {
  if (!directory || !Number.isFinite(hours) || hours < 1 || hours > 168) throw new Error('Configure BACKUP_DIR and an interval of 1–168 hours.');
  if (!Number.isInteger(retain) || retain < 1 || retain > 90) throw new Error('Backup retention must be between 1 and 90.');
  let active = null;
  let stopped = false;
  const run = () => {
    if (active || stopped) return active;
    active = databaseBackup(source, directory, retain).then(() => console.log('Automatic database backup verified.')).catch(() => console.error('Automatic database backup failed. Check disk space and permissions.')).finally(() => { active = null; });
    return active;
  };
  const timer = setInterval(run, hours * 60 * 60_000); timer.unref();
  void run();
  return { async stop() { stopped = true; clearInterval(timer); if (active) await active; } };
}

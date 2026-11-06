import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.env.DATABASE_PATH || '.data/smartwall.sqlite');
const target = resolve(process.argv[2] || `.backups/smartwall-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
if (source === target) throw new Error('Choose a backup path different from the live database.');
mkdirSync(dirname(target), { recursive: true });
const database = new DatabaseSync(source, { readOnly: true });
try { await backup(database, target); console.log(`Database backup saved: ${target}`); }
finally { database.close(); }

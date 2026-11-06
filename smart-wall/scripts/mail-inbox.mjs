import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

if (process.env.NODE_ENV === 'production') throw new Error('The local mail viewer is for development only.');
const folder = resolve(dirname(process.env.DATABASE_PATH || '.data/smartwall.sqlite'), 'mail');
try {
  const messages = readdirSync(folder).filter(file => /^[0-9a-f-]+\.json$/.test(file)).map(file => JSON.parse(readFileSync(resolve(folder, file), 'utf8')));
  if (!messages.length) console.log('No local development emails yet. Allow up to 10 seconds after requesting one.');
  for (const message of messages) console.log(JSON.stringify(message, null, 2));
} catch (error) { if (error.code === 'ENOENT') console.log('No local development emails yet.'); else throw error; }

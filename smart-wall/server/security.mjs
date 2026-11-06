import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
const hashConcurrency = Number(process.env.PASSWORD_HASH_CONCURRENCY || 2);
if (![1, 2].includes(hashConcurrency)) throw new Error('PASSWORD_HASH_CONCURRENCY must be 1 or 2.');
let hashing = 0;
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  if (hashing >= hashConcurrency) throw Object.assign(new Error('Login service is busy. Please retry shortly.'), { status: 503 });
  hashing++;
  try { return `${salt}:${Buffer.from(await derive(password, salt, 64, options)).toString('hex')}`; }
  finally { hashing--; }
}
export async function checkPassword(password, stored) {
  const [salt, expected] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = (await passwordHash(password, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')) && !!stored;
}
export function rateLimiter() {
  const entries = new Map();
  return (key, limit, window = 15 * 60_000) => {
    const now = Date.now();
    for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
    const entry = entries.get(key) || { count: 0, until: now + window };
    entries.set(key, entry);
    if (++entry.count > limit) throw Object.assign(new Error('Too many attempts. Please try again later.'), { status: 429 });
  };
}

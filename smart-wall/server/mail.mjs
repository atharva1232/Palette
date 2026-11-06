import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { mailTransport } from './mail-delivery.mjs';
export { mailConfiguration } from './mail-delivery.mjs';

export function createMailQueue(db, config, transport) {
  const seal = message => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', config.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  };
  const open = payload => {
    const bytes = Buffer.from(payload, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', config.key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  };
  let active = null;
  let stopped = false;
  const send = transport || mailTransport(config);
  const queue = {
    enqueue(userId, purpose, message, expires) {
      const id = randomUUID();
      db.prepare('INSERT INTO mail_outbox (id,user_id,purpose,payload,next_attempt,expires) VALUES (?,?,?,?,?,?)').run(id, userId, purpose, seal(message), Date.now(), expires);
    },
    drain() {
      if (active) return active;
      if (stopped) return Promise.resolve();
      active = (async () => {
        db.prepare('DELETE FROM mail_outbox WHERE expires <= ?').run(Date.now());
        const jobs = db.prepare('SELECT * FROM mail_outbox WHERE next_attempt <= ? AND attempts < 6 ORDER BY next_attempt LIMIT 20').all(Date.now());
        for (const job of jobs) {
          if (stopped) break;
          try { await send(open(job.payload), job.id); db.prepare('DELETE FROM mail_outbox WHERE id = ?').run(job.id); }
          catch { db.prepare('UPDATE mail_outbox SET attempts=attempts+1, next_attempt=? WHERE id=?').run(Date.now() + Math.min(600_000, 30_000 * 2 ** job.attempts), job.id); console.error('Email delivery failed; queued for retry. Check sender/provider configuration.'); }
        }
      })().finally(() => { active = null; });
      return active;
    },
    async stop() { stopped = true; clearInterval(timer); if (active) await active; },
  };
  const timer = setInterval(() => { void queue.drain().catch(() => console.error('Email queue could not be processed.')); }, 10_000);
  timer.unref();
  return queue;
}

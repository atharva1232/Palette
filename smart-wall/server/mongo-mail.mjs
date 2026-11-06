import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { mailTransport } from './mail-delivery.mjs';
export { mailConfiguration } from './mail-delivery.mjs';

export function createMongoMailQueue(db, config, transport) {
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
    async enqueue(userId, purpose, message, expires, session) {
      const id = randomUUID();
      await db.collection('outbox').insertOne({ _id: id, userId, purpose, payload: seal(message), attempts: 0, nextAttempt: Date.now(), expires }, { session });
    },
    drain() {
      if (active) return active;
      if (stopped) return Promise.resolve();
      active = (async () => {
        await db.collection('outbox').deleteMany({ expires: { $lte: Date.now() } });
        const jobs = await db.collection('outbox').find({ nextAttempt: { $lte: Date.now() }, attempts: { $lt: 6 } }).sort({ nextAttempt: 1 }).limit(20).toArray();
        for (const job of jobs) {
          if (stopped) break;
          try { await send(open(job.payload), job._id); await db.collection('outbox').deleteOne({ _id: job._id }); }
          catch { await db.collection('outbox').updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { nextAttempt: Date.now() + Math.min(600_000, 30_000 * 2 ** job.attempts) } }); console.error('Email delivery failed; queued for retry. Check sender/provider configuration.'); }
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

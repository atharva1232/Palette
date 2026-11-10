import { recoveryMessage } from './recovery-message.mjs';
import { newToken, tokenHash, passwordHash } from './security.mjs';
const invalid = () => { throw Object.assign(new Error('This link is invalid or expired. Request a new email.'), { status: 400 }); };
export function mongoRecovery(store, mail, origin) {
  const { db } = store;
  return {
    async issue(user, purpose, session) {
      const issue = async session => {
        const previous = await db.collection('tokens').findOne({ userId: user._id, purpose }, { session });
        if (previous && previous.createdAt > Date.now() - 60000) return;
        const token = newToken(), expires = Date.now() + (purpose === 'verify' ? 86400000 : 1800000);
        await db.collection('tokens').updateOne({ userId: user._id, purpose }, { $set: { hash: tokenHash(token), expires, createdAt: Date.now() } }, { session, upsert: true });
        await db.collection('outbox').deleteMany({ userId: user._id, purpose }, { session });
        await mail.enqueue(user._id, purpose, recoveryMessage(user.email, purpose, origin, token), expires, session);
      };
      return session ? issue(session) : store.transaction(issue);
    },
    async consume(token, purpose, password) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) invalid();
      if (purpose === 'reset' && (typeof password !== 'string' || password.length < 8 || password.length > 128)) throw Object.assign(new Error('Choose a password of 8–128 characters.'), { status: 400 });
      const filter = { hash: tokenHash(token), purpose, expires: { $gt: Date.now() } };
      if (!await db.collection('tokens').findOne(filter)) invalid();
      const encoded = purpose === 'reset' ? await passwordHash(password) : null;
      return store.transaction(async session => {
        const row = await db.collection('tokens').findOneAndDelete({ ...filter, expires: { $gt: Date.now() } }, { session });
        if (!row) invalid();
        const update = { $set: { verifiedAt: Date.now() } };
        if (encoded) { update.$set.password = encoded; update.$inc = { authVersion: 1 }; }
        const user = await db.collection('users').findOneAndUpdate({ _id: row.userId }, update, { session, returnDocument: 'after' });
        if (!user) invalid();
        if(await db.collection('admin_invitations').findOne({_id:user.email},{session})) await db.collection('users').updateOne({_id:user._id},{$set:{role:'admin'}},{session});
        await db.collection('outbox').deleteMany({ userId: user._id, purpose }, { session });
        if (encoded) {
          await db.collection('sessions').deleteMany({ userId: user._id }, { session });
          await db.collection('tokens').deleteMany({ userId: user._id }, { session });
          await db.collection('outbox').deleteMany({ userId: user._id }, { session });
          await mail.enqueue(user._id, 'password-changed', { to: user.email, subject: 'Your Palettè password changed', text: 'Your password changed and all sessions were signed out. Request recovery immediately if this was not you.' }, Date.now() + 86400000, session);
        }
        return user._id;
      });
    },
  };
}

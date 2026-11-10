import { newToken, tokenHash, passwordHash } from './security.mjs';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export function accountRecovery(db, mail, origin) {
  const transaction = callback => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return {
    issue(user, purpose, insideTransaction = false) {
      const now = Date.now();
      const previous = db.prepare('SELECT created_at FROM account_tokens WHERE user_id=? AND purpose=?').get(user.id, purpose);
      if (previous && previous.created_at > now - 60_000) return;
      const token = newToken();
      const expires = now + (purpose === 'verify' ? 24 * 60 * 60_000 : 30 * 60_000);
      const url = `${origin}/#${purpose}=${token}`;
      const issue = () => {
        db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(user.id, purpose);
        db.prepare('DELETE FROM mail_outbox WHERE user_id=? AND purpose=?').run(user.id, purpose);
        db.prepare('INSERT INTO account_tokens VALUES (?,?,?,?,?)').run(tokenHash(token), user.id, purpose, expires, now);
        mail.enqueue(user.id, purpose, {
          to: user.email,
          subject: purpose === 'verify' ? 'Verify your Palettè email' : 'Reset your Palettè password',
          text: purpose === 'verify' ? `Confirm your email address for Palettè:\n\n${url}\n\nThis single-use link expires in 24 hours. If you did not create an account, ignore this email.` : `Choose a new password for Palettè:\n\n${url}\n\nThis single-use link expires in 30 minutes. If you did not request this, ignore this email; your password has not changed.`,
        }, expires);
      };
      if (insideTransaction) issue(); else transaction(issue);
    },
    verify(token) {
      if (!validToken(token)) fail('This verification link is invalid or has expired. Request a new email.');
      return transaction(() => {
        const row = db.prepare("SELECT user_id FROM account_tokens WHERE hash=? AND purpose='verify' AND expires>?").get(tokenHash(token), Date.now());
        if (!row) fail('This verification link is invalid or has expired. Request a new email.');
        db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(Date.now(), row.user_id);
        db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);
        db.prepare("DELETE FROM mail_outbox WHERE user_id=? AND purpose='verify'").run(row.user_id);
        return row.user_id;
      });
    },
    async reset(token, password) {
      if (!validToken(token)) fail('This password-reset link is invalid or has expired. Request a new one.');
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail('Choose a password of 8–128 characters.');
      const hash = tokenHash(token);
      if (!db.prepare("SELECT 1 FROM account_tokens WHERE hash=? AND purpose='reset' AND expires>?").get(hash, Date.now())) fail('This password-reset link is invalid or has expired. Request a new one.');
      const encoded = await passwordHash(password);
      transaction(() => {
        // Re-check after hashing: two simultaneous uses must not both succeed.
        const row = db.prepare("SELECT user_id FROM account_tokens WHERE hash=? AND purpose='reset' AND expires>?").get(hash, Date.now());
        if (!row) fail('This password-reset link is invalid or has expired. Request a new one.');
        const user = db.prepare('SELECT email FROM users WHERE id=?').get(row.user_id);
        db.prepare('UPDATE users SET password=?, email_verified_at=coalesce(email_verified_at,?) WHERE id=?').run(encoded, Date.now(), row.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM mail_outbox WHERE user_id=?').run(row.user_id);
        mail.enqueue(row.user_id, 'password-changed', { to: user.email, subject: 'Your Palettè password changed', text: 'Your Palettè password has been changed and all existing sessions were signed out. If this was not you, request a new password-reset link immediately.' }, Date.now() + 24 * 60 * 60_000);
      });
    },
  };
}

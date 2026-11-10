import { validateStoredImages } from './image-validation.mjs';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { passwordHash, checkPassword, tokenHash, rateLimiter } from './security.mjs';
import { validateDesign } from './designs.mjs';
import { validatePattern } from './patterns.mjs';
import { mailConfiguration, createMongoMailQueue } from './mongo-mail.mjs';
import { mongoRecovery } from './mongo-recovery.mjs';
import { staticFrontend } from './static.mjs';
import { localSecret } from './mongo.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const text = (value, max = 80) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const publicUser = u => ({ id: u._id, name: u.name, email: u.email, emailVerified: !!u.verifiedAt, role: u.role });
const patternPublic = p => { const { _id, ...rest } = p; return { ...rest, id: _id }; };
const summary = p => ({ id: p.id, name: p.name, savedAt: p.savedAt, createdAt: p.createdAt, updatedAt: p.updatedAt, fileName: p.fileName, color: p.color, photoUrl: `/api/designs/${p.id}/photo`, previewUrl: `/api/designs/${p.id}/preview` });
export async function createMeanApi({ store, origin = 'http://127.0.0.1:4200', production = false, secret, frontend, transport, emailEnabled = false, proxyHops = 0, mail: mailOptions = {} }) {
  if (production && (!origin.startsWith('https://') || !secret || secret.length < 32)) throw new Error('Production requires HTTPS APP_ORIGIN and JWT_SECRET (32+ characters).');
  const key = new TextEncoder().encode(secret || localSecret(store.directory, '.jwt-key'));
  const { db } = store;
  const mail = emailEnabled ? createMongoMailQueue(db, mailConfiguration({ production, directory: store.directory, ...mailOptions }), transport) : { async drain() {}, async stop() {}, async enqueue() { throw new Error('Email features are disabled.'); } };
  const recovery = mongoRecovery(store, mail, origin);
  const seed = JSON.parse(readFileSync(new URL('./catalog-seed.json', import.meta.url), 'utf8'));
  for (const c of seed.colours) { const { id, ...data } = c; await db.collection('colours').updateOne({ _id: id }, { $setOnInsert: { ...data, active: true } }, { upsert: true }); }
  for (const p of seed.patterns) { const { id, ...data } = p; await db.collection('patterns').updateOne({ _id: id }, { $setOnInsert: { ...data, ownerId: null, starter: true, active: true, createdAt: Date.now() } }, { upsert: true }); }
  const settings = db.collection('settings');
  await settings.updateOne({ _id: 'system' }, { $setOnInsert: { siteName: 'Palettè', maintenance: false, allowPublishing: true } }, { upsert: true });
  await settings.updateOne({ _id: 'system', siteName: 'SmartWall' }, { $set: { siteName: 'Palettè' } });
  await db.collection('colours').updateMany({ brand: 'SmartWall concept palette' }, { $set: { brand: 'Palettè concept palette' } });
  await db.collection('patterns').updateMany({ starter: true, ownerId: null, author: 'SmartWall' }, { $set: { author: 'Palettè' } });
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('Invalid trusted proxy hop count.');
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', proxyHops);
  const limit = rateLimiter();
  const cookieName = production ? '__Host-smartwall' : 'smartwall_session';
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${production ? '; Secure' : ''}`;
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer' });
    if (req.path.startsWith('/api/') && !['GET','HEAD'].includes(req.method)) {
      if (req.headers['x-smartwall-request'] !== '1' || req.headers.origin && req.headers.origin !== new URL(origin).origin || req.headers['sec-fetch-site'] === 'cross-site') return next(Object.assign(new Error('Request origin is not allowed.'), { status: 403 }));
      if (!req.is('application/json')) return next(Object.assign(new Error('JSON required.'), { status: 415 }));
    }
    next();
  });
  app.use('/api/designs', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', async (req, res, next) => {
    const raw = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    req.sessionHash = raw && raw.length < 2000 ? tokenHash(raw) : null;
    if (req.sessionHash) {
      const s = await db.collection('sessions').findOne({ _id: req.sessionHash, expiresAt: { $gt: new Date() } });
      if (s) {
        let valid = false;
        if (s.legacy && !production) valid = true;
        else try { const { payload } = await jwtVerify(raw, key, { algorithms: ['HS256'], issuer: 'smartwall', audience: origin }); valid = payload.sub === s.userId && payload.jti === s.jti; } catch { /* invalid JWT has no authority */ }
        if (valid) {
          const u = await db.collection('users').findOne({ _id: s.userId, disabled: { $ne: true } });
          if (u && (s.legacy || u.authVersion === s.authVersion)) req.user = u;
        }
      }
    }
    next();
  });
  const auth = (req, res, next) => req.user ? next() : next(Object.assign(new Error('Please log in to continue.'), { status: 401 }));
  const admin = (req, res, next) => req.user?.role === 'admin' ? next() : next(Object.assign(new Error('Administrator access required.'), { status: req.user ? 403 : 401 }));
  const verified = (req, res, next) => (!emailEnabled || req.user?.verifiedAt) ? next() : next(Object.assign(new Error('Verify your email from your dashboard before saving or publishing.'), { status: 403 }));
  const establish = async (u, req, res, session) => {
    const jti = randomUUID(), now = Date.now();
    const token = await new SignJWT({ version: u.authVersion }).setProtectedHeader({ alg: 'HS256' }).setSubject(u._id).setJti(jti).setIssuer('smartwall').setAudience(origin).setIssuedAt().setExpirationTime('7d').sign(key);
    const previous = await db.collection('sessions').find({ userId: u._id }, { session }).sort({ createdAt: -1 }).skip(9).toArray();
    if (previous.length) await db.collection('sessions').deleteMany({ _id: { $in: previous.map(s=>s._id) } }, { session });
    await db.collection('sessions').insertOne({ _id: tokenHash(token), userId: u._id, authVersion: u.authVersion, jti, createdAt: now, lastSeen: now, activeSeconds: 0, expiresAt: new Date(now + 604800000) }, { session });
    res.setHeader('Set-Cookie', cookie(token, 604800));
  };
  app.get('/api/health', async (req, res) => { await db.command({ ping: 1 }); res.json({ status: 'ok', stack: 'MEAN' }); });
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null, emailEnabled }));
  for (const kind of ['signup', 'login']) app.post('/api/auth/' + kind, async (req, res) => {
    limit('auth-ip:' + req.ip, 30);
    const v = req.body;
    if (!v || typeof v.email !== 'string' || v.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) || typeof v.password !== 'string' || v.password.length < 8 || v.password.length > 128) fail(400, 'Enter a valid email and a password of 8-128 characters.');
    const email = v.email.trim().toLowerCase(); limit('auth:' + email, 15);
    if (kind === 'signup') {
      if (!text(v.name)) fail(400, 'Enter a name of 1-80 characters.');
      if (await db.collection('users').findOne({ email })) fail(409, 'An account with this email already exists.');
      const u = { _id: randomUUID(), name: v.name.trim(), email, password: await passwordHash(v.password), role: 'user', disabled: false, authVersion: 0, verifiedAt: null, createdAt: Date.now(), favourites: [], storageBytes: 0, projectCount: 0 };
      await store.transaction(async session => { await db.collection('users').insertOne(u, { session }); if (emailEnabled) await recovery.issue(u, 'verify', session); await establish(u, req, res, session); });
      return res.status(201).json({ user: publicUser(u), message: emailEnabled ? 'Account created. A verification email has been queued.' : 'Account created. You can now save designs and share patterns.' });
    }
    const u = await db.collection('users').findOne({ email });
    if (!await checkPassword(v.password, u?.password) || u.disabled) fail(401, 'Email or password is incorrect.');
    await store.transaction(async session => { const current = await db.collection('users').findOneAndUpdate({ _id: u._id, password: u.password, disabled: { $ne: true } }, { $inc: { loginRevision: 1 } }, { session, returnDocument: 'after' }); if (!current) fail(401, 'Email or password is incorrect.'); await establish(current, req, res, session); });
    res.json({ user: publicUser(u) });
  });
  app.post('/api/auth/logout', async (req, res) => { if (req.sessionHash) await db.collection('sessions').deleteOne({ _id: req.sessionHash }); res.setHeader('Set-Cookie', cookie('', 0)); res.json({ ok: true }); });
  // Optional email flows stay unavailable when the internship build has no sender.
  for (const path of ['forgot-password', 'resend-verification', 'verify-email', 'reset-password']) app.post('/api/auth/' + path, (req, res, next) => { if (!emailEnabled) return res.status(404).json({ error: 'Email features are not enabled for this project.' }); next(); });
  app.post('/api/auth/forgot-password', async (req, res) => {
    limit('recover:' + req.ip, 10);
    if (!text(req.body?.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())) fail(400, 'Enter a valid email.');
    const u = await db.collection('users').findOne({ email: req.body.email.trim().toLowerCase() });
    if (u) await recovery.issue(u, 'reset');
    res.json({ message: 'If an account exists, a password-reset email has been queued. Check your inbox and spam folder.' });
  });
  app.post('/api/auth/resend-verification', auth, async (req, res) => { limit('verify:' + req.user._id, 5); if (!req.user.verifiedAt) await recovery.issue(req.user, 'verify'); res.json({ message: req.user.verifiedAt ? 'Your email is already verified.' : 'A verification email has been queued.' }); });
  app.post('/api/auth/verify-email', async (req, res) => { limit('token:' + req.ip, 20); const userId = await recovery.consume(req.body?.token, 'verify'); res.json({ userId, role: (await db.collection('users').findOne({_id:userId})).role, message: 'Your email is verified.' }); });
  app.post('/api/auth/reset-password', async (req, res) => { limit('reset:' + req.ip, 20); await recovery.consume(req.body?.token, 'reset', req.body?.password); res.setHeader('Set-Cookie', cookie('', 0)); res.json({ message: 'Password changed. All sessions were signed out. Log in with your new password.' }); });
  app.get('/api/catalog', async (req, res) => {
    const colours = (await db.collection('colours').find({ active: { $ne: false } }).toArray()).map(c => { const { _id, ...rest } = c; return { id: _id, ...rest }; });
    res.json({ colours, publishedPatterns: (await db.collection('patterns').find({ starter: { $ne: true }, active: { $ne: false } }).limit(500).toArray()).map(patternPublic), patterns: (await db.collection('patterns').find({ starter: true, active: { $ne: false } }).toArray()).map(patternPublic) });
  });
  app.get('/api/patterns', async (req, res) => res.json((await db.collection('patterns').find({ starter: { $ne: true }, active: { $ne: false } }).sort({ createdAt: -1 }).limit(500).toArray()).map(patternPublic)));
  app.post('/api/patterns', auth, verified, async (req, res) => {
    limit('pattern:' + req.user._id, 60, 3600000);
    if (!(await db.collection('settings').findOne({ _id: 'system' })).allowPublishing) fail(409, 'Community publishing is temporarily paused.');
    const p = validatePattern({ ...req.body, author: req.user.name.slice(0, 40) }); if (!p) fail(400, 'Invalid pattern fields.');
    const row = { ...p, _id: randomUUID(), description: String(req.body.description || '').slice(0, 500), category: p.style, ownerId: req.user._id, active: true, createdAt: Date.now() };
    await db.collection('patterns').insertOne(row); res.status(201).json(patternPublic(row));
  });
  app.delete('/api/patterns/:id', auth, async (req, res) => { const result = await db.collection('patterns').deleteOne({ _id: req.params.id, ownerId: req.user._id, starter: { $ne: true } }); if (!result.deletedCount) fail(404, 'Pattern not found.'); res.json({ ok: true }); });
  app.get('/api/account/stats', auth, async (req, res) => res.json({ designs: await db.collection('projects').countDocuments({ userId: req.user._id }), patterns: await db.collection('patterns').countDocuments({ ownerId: req.user._id }) }));
  app.get('/api/account/favourites', auth, (req, res) => res.json(req.user.favourites || []));
  app.post('/api/account/favourites', auth, async (req, res) => {
    const { kind, id, selected } = req.body || {};
    if (!['colour','pattern'].includes(kind) || !idOK(id) || typeof selected !== 'boolean') fail(400, 'Invalid favourite.');
    if (selected && !await db.collection(kind === 'colour' ? 'colours' : 'patterns').findOne({ _id: id, active: { $ne: false } })) fail(404, 'Catalogue item not found.');
    await db.collection('users').updateOne({ _id: req.user._id }, { [selected ? '$addToSet' : '$pull']: { favourites: `${kind}:${id}` } });
    res.json({ ok: true });
  });
  app.get('/api/designs', auth, async (req, res) => res.json((await db.collection('projects').find({ userId: req.user._id }).sort({ savedAt: -1 }).toArray()).map(summary)));
  app.post('/api/designs', auth, verified, async (req, res) => {
    limit('save:' + req.user._id, 100, 3600000);
    if (!/^[0-9a-f-]{36}$/i.test(req.body?.id || '')) fail(400, 'Invalid design ID.');
    const id = `${req.user._id}:${req.body.id}`;
    if (await db.collection('projects').findOne({ _id: id })) return res.json({ id: req.body.id });
    const d = validateDesign(req.body), now = Date.now();
    await validateStoredImages(d);
    // New file IDs per attempt prevent a failed concurrent save deleting committed media.
    const attempt = randomUUID();
    const photoId = await store.putFile(attempt + ':photo', d.photo, d.type);
    const previewId = await store.putFile(attempt + ':preview', d.preview, 'image/png');
    let inserted = false;
    try {
      await store.transaction(async session => {
        inserted = false;
        if (await db.collection('projects').findOne({ _id: id }, { session })) return;
        const quota = await db.collection('users').updateOne({ _id: req.user._id, projectCount: { $lt: 50 }, storageBytes: { $lte: 268435456 - d.bytes } }, { $inc: { projectCount: 1, storageBytes: d.bytes } }, { session });
        if (!quota.modifiedCount) fail(409, 'Storage limit reached (50 designs / 256 MB). Delete unwanted designs.');
        await db.collection('projects').insertOne({ _id: id, id: req.body.id, userId: req.user._id, name: d.name, fileName: d.fileName, color: d.color, photoType: d.type, photoId, previewId, state: JSON.parse(d.state), bytes: d.bytes, savedAt: now, createdAt: now, updatedAt: now }, { session });
        await db.collection('events').insertOne({ _id: randomUUID(), type: 'save', userId: req.user._id, createdAt: now, expiresAt: new Date(now + 7776000000) }, { session }); inserted = true;
      });
    } catch (error) { await store.removeFile(photoId); await store.removeFile(previewId); throw error; }
    if (!inserted) { await store.removeFile(photoId); await store.removeFile(previewId); }
    res.status(inserted ? 201 : 200).json({ id: req.body.id });
  });
  app.post('/api/designs/delete', auth, async (req, res) => {
    const ids = req.body?.ids; if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(idOK)) fail(400, 'Choose valid designs.');
    let removed;
    await store.transaction(async session => {
      removed = await db.collection('projects').find({ userId: req.user._id, id: { $in: ids } }, { session }).toArray();
      await db.collection('projects').deleteMany({ userId: req.user._id, id: { $in: ids } }, { session });
      await db.collection('users').updateOne({ _id: req.user._id }, { $inc: { projectCount: -removed.length, storageBytes: -removed.reduce((sum,p) => sum + p.bytes, 0) } }, { session });
    });
    for (const p of removed) { await store.removeFile(p.photoId); await store.removeFile(p.previewId); }
    res.json({ deleted: removed.length });
  });
  app.get('/api/designs/:id{/:kind}', auth, async (req, res) => {
    const p = await db.collection('projects').findOne({ id: req.params.id, userId: req.user._id }); if (!p) fail(404, 'Design not found.');
    const kind = req.params.kind;
    if (kind) { if (!['photo','preview'].includes(kind)) fail(404, 'Not found.'); res.set({ 'Content-Type': kind === 'photo' ? p.photoType : 'image/png', 'Content-Security-Policy': "default-src 'none'; sandbox" }); return res.send(await store.file(kind === 'photo' ? p.photoId : p.previewId)); }
    res.json({ ...summary(p), ...p.state, photoType: p.photoType, photo: (await store.file(p.photoId)).toString('base64'), preview: (await store.file(p.previewId)).toString('base64') });
  });
  app.post('/api/trial/feedback', async (req, res) => {
    limit('feedback:' + req.ip, 5, 3600000); const v = req.body;
    const keys = ['upload','select','save','reopen','delete'];
    if (!v || ![v.ease,v.accuracy].every(x => Number.isInteger(x) && x >= 1 && x <= 5) || !['desktop','mobile','tablet'].includes(v.device) || typeof v.comment !== 'string' || v.comment.length > 2000 || !keys.every(k => typeof v.tasks?.[k] === 'boolean')) fail(400, 'Complete feedback ratings and device.');
    await db.collection('feedback').insertOne({ _id: randomUUID(), createdAt: Date.now(), ease: v.ease, accuracy: v.accuracy, device: v.device, tasks: Object.fromEntries(keys.map(k => [k,v.tasks[k]])), comment: v.comment.trim() });
    res.status(201).json({ message: 'Thank you. Your feedback was saved privately.' });
  });
  app.post('/api/activity', async (req, res) => {
    limit('activity:' + req.ip, 300, 3600000);
    const { type, visit } = req.body || {}; if (!['upload','heartbeat'].includes(type) || !/^[0-9a-f-]{36}$/i.test(visit || '')) fail(400, 'Invalid activity.');
    const now = Date.now();
    if (type === 'upload') await db.collection('events').insertOne({ _id: randomUUID(), type, visit, userId: req.user?._id || null, createdAt: now, expiresAt: new Date(now + 7776000000) });
    const v = await db.collection('visits').findOne({ _id: visit });
    // Count only closely spaced, visible-page heartbeats. Gaps do not count as activity.
    await db.collection('visits').updateOne({ _id: visit }, { $set: { lastSeen: now, expiresAt: new Date(now + 7776000000) }, $setOnInsert: { createdAt: now }, $inc: { activeSeconds: v ? Math.max(0, Math.min(30, (now - v.lastSeen) / 1000)) : 0 } }, { upsert: true });
    res.json({ ok: true });
  });
  app.get('/api/settings', async (req, res) => { const s = await db.collection('settings').findOne({ _id: 'system' }); res.json({ siteName: s.siteName, maintenance: s.maintenance, allowPublishing: s.allowPublishing }); });
  app.use('/api/admin', admin);
  const audit = async (req, action, target) => db.collection('audit').insertOne({ _id: randomUUID(), actor: req.user._id, action, target, createdAt: Date.now() });
  app.get('/api/admin/overview', async (req, res) => {
    const visits = await db.collection('visits').aggregate([{ $group: { _id: null, average: { $avg: '$activeSeconds' }, count: { $sum: 1 } } }]).toArray();
    const feedback = await db.collection('feedback').aggregate([{ $group: { _id: null, count: { $sum: 1 }, ease: { $avg: '$ease' }, accuracy: { $avg: '$accuracy' } } }]).toArray();
    res.json({ users: await db.collection('users').countDocuments(), uploads: await db.collection('events').countDocuments({ type: 'upload' }), saves: await db.collection('events').countDocuments({ type: 'save' }), currentDesigns: await db.collection('projects').countDocuments(), averageSessionSeconds: visits[0]?.average || 0, visits: visits[0]?.count || 0, feedback: feedback[0] || { count: 0, ease: 0, accuracy: 0 }, recent: await db.collection('events').find({}, { projection: { _id: 0, type: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(20).toArray(), measuredAt: Date.now() });
  });
  app.get('/api/admin/users', async (req, res) => res.json((await db.collection('users').find({}, { projection: { password: 0, favourites: 0 } }).limit(500).toArray()).map(u => ({ ...publicUser(u), disabled: !!u.disabled, createdAt: u.createdAt, designs: u.projectCount }))));
  app.post('/api/admin/users/:id', async (req, res) => {
    const { disabled } = req.body || {}; if (typeof disabled !== 'boolean') fail(400, 'Choose an account status.');
    const target = await db.collection('users').findOne({ _id: req.params.id }); if (!target) fail(404, 'Account not found.');
    if (target.role === 'admin') fail(400, 'Administrator accounts cannot be disabled here.');
    await db.collection('users').updateOne({ _id: target._id }, { $set: { disabled }, $inc: { authVersion: 1 } });
    await db.collection('sessions').deleteMany({ userId: target._id }); await audit(req, disabled ? 'disable-user' : 'enable-user', target._id); res.json({ ok: true });
  });
  app.get('/api/admin/projects', async (req, res) => res.json((await db.collection('projects').find({}, { projection: { photoId: 0, previewId: 0, state: 0 } }).sort({ savedAt: -1 }).limit(500).toArray()).map(p => ({ ...summary(p), userId: p.userId }))));
  // Explicit, audited access: administrators do not receive photo URLs from the list.
  app.post('/api/admin/projects/:owner/:id/review', async (req, res) => {
    if (!text(req.body?.reason, 300)) fail(400, 'Give a reason for reviewing this private design.');
    const p = await db.collection('projects').findOne({ userId: req.params.owner, id: req.params.id }); if (!p) fail(404, 'Design not found.');
    await audit(req, 'review-private-design', { owner: p.userId, id: p.id, reason: req.body.reason.trim() });
    res.json({ ...summary(p), photoType: p.photoType, photo: (await store.file(p.photoId)).toString('base64'), preview: (await store.file(p.previewId)).toString('base64') });
  });
  app.get('/api/admin/feedback', async (req, res) => res.json(await db.collection('feedback').find().sort({ createdAt: -1 }).limit(500).toArray()));
  app.get('/api/admin/audit', async (req, res) => res.json(await db.collection('audit').find().sort({ createdAt: -1 }).limit(100).toArray()));
  app.get('/api/admin/catalog', async (req, res) => res.json({ colours: (await db.collection('colours').find().toArray()).map(c => ({ ...c, id: c._id })), patterns: (await db.collection('patterns').find().limit(500).toArray()).map(patternPublic) }));
  app.post('/api/admin/colours', async (req, res) => {
    const v = req.body; if (!v || !text(v.name) || !hex(v.hex) || !text(v.family) || !text(v.brand) || !Array.isArray(v.finishes) || !v.finishes.length || !v.finishes.every(f => ['Matte','Satin','Gloss'].includes(f))) fail(400, 'Provide name, HEX, family, brand and valid finishes.');
    const id = v.id || randomUUID(); if (!idOK(id)) fail(400, 'Invalid colour ID.');
    await db.collection('colours').updateOne({ _id: id }, { $set: { name: v.name.trim(), hex: v.hex, family: v.family.trim(), brand: v.brand.trim(), finishes: [...new Set(v.finishes)], tags: [v.family.trim()], active: v.active !== false } }, { upsert: true }); await audit(req, 'save-colour', id); res.json({ id });
  });
  app.post('/api/admin/patterns', async (req, res) => {
    const p = validatePattern({ ...req.body, author: 'Palettè' }); if (!p) fail(400, 'Invalid pattern.'); const id = req.body.id || randomUUID(); if (!idOK(id)) fail(400, 'Invalid pattern ID.');
    await db.collection('patterns').updateOne({ _id: id }, { $set: { ...p, description: String(req.body.description || '').slice(0,500), category: p.style, active: req.body.active !== false }, $setOnInsert: { starter: true, ownerId: null, createdAt: Date.now() } }, { upsert: true }); await audit(req, 'save-pattern', id); res.json({ id });
  });
  for (const collection of ['colours','patterns']) app.delete('/api/admin/' + collection + '/:id', async (req, res) => { if (!idOK(req.params.id)) fail(400, 'Invalid ID.'); await db.collection(collection).updateOne({ _id: req.params.id }, { $set: { active: false } }); await audit(req, 'archive-' + collection, req.params.id); res.json({ ok: true }); });
  app.post('/api/admin/settings', async (req, res) => {
    const v = req.body; if (!text(v?.siteName,60) || typeof v.maintenance !== 'boolean' || typeof v.allowPublishing !== 'boolean') fail(400, 'Invalid settings.');
    await db.collection('settings').updateOne({ _id: 'system' }, { $set: { siteName: v.siteName.trim(), maintenance: v.maintenance, allowPublishing: v.allowPublishing } }); await audit(req, 'update-settings', 'system'); res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  if (frontend) { const serve = staticFrontend(resolve(frontend)); app.use((req,res) => serve(req,res,req.path)); }
  app.use((error, req, res, next) => {
    const status = error.code === 11000 ? 409 : error.status || 500;
    if (status >= 500) console.error('API request failed:', error.message);
    res.status(status).json({ error: error.code === 11000 ? 'This item already exists.' : status >= 500 ? 'The server could not complete this request.' : error.message });
  });
  const server = createServer(app); server.mail = mail; server.store = store;
  server.resourcesClosed = new Promise(resolve => server.on('close', () => { void mail.stop().then(() => resolve()); }));
  return server;
}

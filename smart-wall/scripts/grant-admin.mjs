import './local-env.mjs';
import { MongoClient } from 'mongodb';
// Local operator command only: public signup never accepts roles.
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) throw new Error('Usage: npm run admin:grant -- existing-account@example.com');
const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/?replicaSet=smartwall');
try {
  await client.connect(); const users = client.db(process.env.MONGODB_DATABASE || 'smartwall').collection('users');
  const db=client.db(process.env.MONGODB_DATABASE || 'smartwall');
  await db.collection('admin_invitations').updateOne({_id:email},{$set:{approvedAt:Date.now()}},{upsert:true});
  const result = await users.updateOne({ email, disabled: { $ne: true }, ...(process.env.ENABLE_EMAIL_FEATURES === 'true' ? { verifiedAt: { $ne: null } } : {}) }, { $set: { role: 'admin' } });
  console.log(result.matchedCount ? 'Administrator role granted. Reload SmartWall.' : 'Administrator invitation reserved. Register this address, then rerun this local operator command. No password has been created.');
} finally { await client.close(); }

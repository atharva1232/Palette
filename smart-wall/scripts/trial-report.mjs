import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.env.DATABASE_PATH || '.data/smartwall.sqlite', { readOnly: true });
try {
  const summary = db.prepare('SELECT count(*) AS responses, round(avg(ease),2) AS ease, round(avg(accuracy),2) AS accuracy FROM trial_feedback').get();
  console.log(JSON.stringify({ summary, feedback: db.prepare('SELECT * FROM trial_feedback ORDER BY created_at DESC').all() }, null, 2));
} finally { db.close(); }

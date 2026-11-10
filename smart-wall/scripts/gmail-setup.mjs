import './local-env.mjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gmailTransport } from '../server/mail-delivery.mjs';

async function hiddenPassword() {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Run this command in an interactive terminal.');
  stdout.write('Google app password (hidden; not your Google password): ');
  return new Promise((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const done = () => { stdin.off('data', input); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const input = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { done(); reject(new Error('Setup cancelled.')); return; }
        if (char === '\r' || char === '\n') { done(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (/[a-zA-Z ]/.test(char)) value += char;
      }
    };
    stdin.on('data', input);
  });
}

try {
  let gmailUser = process.env.GMAIL_USER;
  let gmailPassword = process.env.GMAIL_APP_PASSWORD;
  const check = process.argv.includes('--check');
  if (!check) {
    if (!stdin.isTTY) throw new Error('Run npm run mail:setup:gmail in an interactive terminal.');
    const prompt = createInterface({ input: stdin, output: stdout });
    gmailUser = (await prompt.question('Sender Gmail [atharvap3212@gmail.com]: ')).trim() || 'atharvap3212@gmail.com';
    prompt.close();
    gmailPassword = await hiddenPassword();
  }
  gmailPassword = (gmailPassword || '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9._%+-]+@gmail\.com$/i.test(gmailUser || '') || !/^[A-Za-z]{16}$/.test(gmailPassword)) throw new Error('A Gmail address and 16-letter Google app password are required.');
  const smtp = gmailTransport({ gmailUser, gmailPassword });
  try { await smtp.verify(); }
  catch { throw new Error('Gmail connection failed. Check internet access, 2-Step Verification and the Google app password. No settings were saved.'); }
  finally { smtp.close(); }
  if (!check) {
    const file = fileURLToPath(new URL('../.env.local', import.meta.url));
    let existing = '';
    try { existing = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const keys = /^(?:export\s+)?(?:MAIL_MODE|GMAIL_USER|GMAIL_APP_PASSWORD)\s*=/;
    const kept = existing.split(/\r?\n/).filter(line => !keys.test(line.trim())).join('\n').trimEnd();
    const content = `${kept}\nMAIL_MODE=gmail\nGMAIL_USER=${gmailUser}\nGMAIL_APP_PASSWORD=${gmailPassword}\n`;
    await writeFile(file + '.tmp', content, { mode: 0o600 });
    await rename(file + '.tmp', file); await chmod(file, 0o600);
    console.log('Gmail authenticated. Private settings saved to ignored .env.local. Restart npm start, then use Resend verification or Forgot password in Palettè.');
  } else console.log('Gmail authenticated successfully. No email was sent.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}

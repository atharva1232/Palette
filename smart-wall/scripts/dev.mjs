import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const api = spawn(process.execPath, ['scripts/mean-server.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
const frontend = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', '127.0.0.1', '--poll', '1000', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', windowsHide: true });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  frontend.kill();
  process.exitCode = code;
}
for (const child of [api, frontend]) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

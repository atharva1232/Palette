import { createReadStream, statSync, realpathSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
export function staticFrontend(directory) {
  const root = realpathSync(directory);
  if (!statSync(resolve(root, 'index.html')).isFile()) throw new Error('Build the frontend before starting production.');
  return (request, response, pathname) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end(); return; }
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); response.end(); return; }
    let file = resolve(root, '.' + decoded);
    if (relative(root, file).startsWith('..')) { response.writeHead(404); response.end(); return; }
    try {
      if (!statSync(file).isFile()) throw new Error();
    } catch {
      if (extname(decoded)) { response.writeHead(404); response.end(); return; }
      file = resolve(root, 'index.html');
    }
    if (!realpathSync(file).startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    const extension = extname(file);
    response.writeHead(200, {
      'Content-Type': types[extension] || 'application/octet-stream',
      'Content-Length': statSync(file).size,
      'Cache-Control': extension === '.html' ? 'no-store' : /-[a-z0-9]{8}\./i.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  };
}

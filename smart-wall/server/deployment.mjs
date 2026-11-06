export function deploymentSettings(env = process.env, production = false) {
  let origin = env.APP_ORIGIN || (production ? env.RENDER_EXTERNAL_URL : 'http://127.0.0.1:4200');
  if (origin) {
    let parsed; try { parsed = new URL(origin); } catch { throw new Error('APP_ORIGIN must be a valid website origin.'); }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !['http:', 'https:'].includes(parsed.protocol) || production && parsed.protocol !== 'https:') throw new Error('APP_ORIGIN must be an HTTPS origin without a path or credentials.');
    origin = parsed.origin;
  }
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5 matching the hosting proxy.');
  return { origin, proxyHops };
}

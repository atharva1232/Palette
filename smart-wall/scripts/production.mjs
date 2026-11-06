// Compatibility entrypoint: the active production stack is MongoDB/Express/JWT.
process.argv.push('--production');
await import('./mean-server.mjs');

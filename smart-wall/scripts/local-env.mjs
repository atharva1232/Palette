import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../.env.local', import.meta.url));
// Explicit service environment wins; production uses its secret manager.
if (process.env.NODE_ENV !== 'production' && !process.argv.includes('--production') && existsSync(file)) process.loadEnvFile(file);

# Free Render + MongoDB Atlas deployment

Status: source prepared and locally tested; not yet deployed. No SmartWall GitHub repository or Atlas cluster was available when preparation began. Render is connected to the owner account. Stay on free plans; do not add a card, paid disk, cron, Redis or Render Postgres.

## Owner setup

1. In your existing GitHub account, create a repository named smart-wall. Private is suitable while preparing. Initialise it with a README so it has a main branch. Share its normal repository URL, not a token. Give the GitHub connection and Render's GitHub integration access to that repository if requested. The code is ready to upload; do not upload .data, .backups, review, tmp, .env files or node_modules.
2. Register/sign in at https://www.mongodb.com/cloud/atlas/register. Select the Free/M0 tier, not Flex or Dedicated, and a nearby supported region. Create a database user with a strong unique password and readWrite privileges limited to the smartwall database. Keep that password private.
3. The Render service's outbound IP ranges are available on its dashboard. Allow those ranges in Atlas Network Access. Do not open Atlas to all IP addresses merely for convenience. Add your current IP temporarily only if doing a local connection/backup check.
4. In Atlas Connect > Drivers, obtain the mongodb+srv connection string and replace its password placeholder locally. Paste it directly into the Render service's secret MONGODB_URI environment variable. Do not post it to chat, GitHub or a screenshot. Select database smartwall or let MONGODB_DATABASE supply the name. Database authentication credentials differ from the Atlas website account.

## Exact deployment configuration

The repository-root render.yaml defines ONE service, explicitly plan: free, in Singapore. It uses root directory smart-wall, builds with npm ci --include=dev && npm run build && npm prune --omit=dev, and starts npm run start:production. The API serves the compiled Angular app and its private API on the same HTTPS origin. MongoDB/GridFS persist the rooms and accounts in Atlas, never on Render's disk.

When creating via the Render connector instead of a Blueprint (which needs a public repository), use build command `cd smart-wall && npm ci --include=dev && npm run build && npm prune --omit=dev` and start command `cd smart-wall && npm run start:production`. Confirm plan free, region singapore, one instance and no paid resources.

Required service environment:

| Variable | Value |
| --- | --- |
| NODE_VERSION | 24.16.0 |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| MONGODB_URI | Owner's Atlas secret, entered directly in Render |
| MONGODB_DATABASE | smartwall |
| JWT_SECRET | Generate a stable random secret, at least 32 characters; keep it in Render |
| ENABLE_EMAIL_FEATURES | false |
| PASSWORD_HASH_CONCURRENCY | 1 |
| TRUST_PROXY_HOPS | 1 initially; verify actual proxy topology before acceptance |
| MONGOMS_DISABLE_POSTINSTALL | 1 |
| LOCAL_BACKUPS_ENABLED | false on ephemeral Render Free disk |

Do not set APP_ORIGIN to a guessed URL: startup automatically reads RENDER_EXTERNAL_URL. Set APP_ORIGIN explicitly only if using a custom HTTPS origin. PORT comes from Render. Never run npm start on Render: that is the local development launcher.

Local filesystem backups are disabled on Render because they vanish on restart and copying the whole media collection at every cold start wastes memory and bandwidth. Configure an appropriate free Atlas backup option if offered without charges, or perform private off-host exports and a restore drill. Replication is not a substitute for a recoverable backup. Do not claim durable automated backups are complete until verified.

## After the deployment

Open the actual returned HTTPS URL and /api/health. Create a fresh account, save a disposable room, reopen it after a redeploy, and download the result. Check that ordinary accounts cannot access Admin or another user's designs. Verify forwarded client identity before relying on proxy-based rate limits: trust one verified proxy hop, not arbitrary leftmost headers; adjust only after inspecting the actual provider chain. The connector configuration alone is not proof of that topology.

The cloud database starts empty; local accounts/photos have not been uploaded automatically. No default admin or password is created. After the owner registers a cloud account, grant that existing account through the local operator command pointed securely at the cloud database, or a controlled Atlas data edit. Never auto-grant admin merely because public signup uses a nominated email address.

Render Free sleeps after 15 idle minutes and wakes on a request; waking can take about a minute. Free hours, bandwidth and builds have monthly quotas. Atlas Free has limited storage, so use a small demo dataset. Keep the service and cluster available throughout evaluation and check the link periodically. No guarantee of uninterrupted availability is claimed.

## Preparation validation

The 53 backend tests cover complete image decoding, rejection of truncated original/preview content before media writes, matching photo/preview dimensions, explicit proxy trust and independent client rate limits. Existing password hashes are unchanged. Runtime image decoding and password hashing use conservative concurrency settings for the small free instance. Production dependencies were checked with npm audit --omit=dev; zero reported advisories at preparation time. A real cloud deploy, Atlas connection, proxy-chain check and restart/persistence checks remain pending until the owner account setup is complete.

References checked 6 November 2026: https://render.com/docs/free, https://render.com/docs/environment-variables, https://render.com/docs/deploy-node-express-app, https://www.mongodb.com/docs/atlas/connect-to-database-deployment/.

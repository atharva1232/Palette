# Deploy Palettè on Render

The [live Palettè demo](https://smart-wall-atharva1232.onrender.com/) runs on Render Free with MongoDB Atlas. Use the [existing Render service](https://dashboard.render.com/web/srv-dbmt4d3rjlhs73cdtmm0) to manage that deployment. The following steps also apply to a new installation.

## Owner setup

1. Connect Render to the Git repository and branch that contain the application.
2. Register/sign in at https://www.mongodb.com/cloud/atlas/register. Select the Free/M0 tier, not Flex or Dedicated, and a nearby supported region. Create a database user with a strong unique password and readWrite privileges limited to the smartwall database. Keep that password private.
3. The Render service's outbound IP ranges are available on its dashboard. Allow those ranges in Atlas Network Access. Do not open Atlas to all IP addresses merely for convenience. Add your current IP temporarily only if doing a local connection/backup check.
4. In Atlas Connect > Drivers, obtain the mongodb+srv connection string and replace its password placeholder locally. Paste it directly into the Render service's secret MONGODB_URI environment variable. Do not post it to chat, GitHub or a screenshot. Select database smartwall or let MONGODB_DATABASE supply the name. Database authentication credentials differ from the Atlas website account.

## Exact deployment configuration

The repository-root render.yaml defines ONE service, explicitly plan: free, in Singapore. It uses root directory smart-wall, builds with npm ci --include=dev && npm run build && npm prune --omit=dev, and starts npm run start:production. The API serves the compiled Angular app and its private API on the same HTTPS origin. MongoDB/GridFS persist the rooms and accounts in Atlas, never on Render's disk.

For a manually configured service, set the root directory to `smart-wall` and use the build and start commands above. If the root directory is the repository root, prefix both commands with `cd smart-wall &&`.

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
| ENABLE_PASSWORD_RESET | Set to `true` after configuring email delivery below |
| PASSWORD_HASH_CONCURRENCY | 1 |
| TRUST_PROXY_HOPS | 1 initially; verify actual proxy topology before acceptance |
| MONGOMS_DISABLE_POSTINSTALL | 1 |
| LOCAL_BACKUPS_ENABLED | false on ephemeral Render Free disk |

Do not set APP_ORIGIN to a guessed URL: startup automatically reads RENDER_EXTERNAL_URL. Set APP_ORIGIN explicitly only if using a custom HTTPS origin. PORT comes from Render. Never run npm start on Render: that is the local development launcher.

## Password reset emails

Render Free blocks the usual SMTP ports, including Gmail SMTP on port 465. Use an HTTPS email API on this service. For Brevo, verify the sender in Brevo, enable transactional sending, and create an API key. Set these variables in the Render service’s Environment page together:

| Variable | Value |
| --- | --- |
| `ENABLE_PASSWORD_RESET` | `true` |
| `MAIL_MODE` | `brevo` |
| `BREVO_SENDER_EMAIL` | Sender email verified in Brevo |
| `BREVO_API_KEY` | API key entered directly in Render |
| `MAIL_ENCRYPTION_KEY` | Stable, separate random secret of at least 32 characters for the mail queue |

Keep `ENABLE_EMAIL_FEATURES=false` if signup should work without email verification. After deploying, request a reset from **Log in → Forgot your password?** with a test account whose inbox you control. Verify receipt, open the link, and sign in with the new password. Links expire in 30 minutes and work once.

Local filesystem backups are disabled on Render because they vanish on restart and copying the whole media collection at every cold start wastes memory and bandwidth. Configure an appropriate free Atlas backup option if offered without charges, or perform private off-host exports and a restore drill. Replication is not a substitute for a recoverable backup. Do not claim durable automated backups are complete until verified.

## After the deployment

Open the actual returned HTTPS URL and /api/health. Create a fresh account, save a disposable room, reopen it after a redeploy, and download the result. Check that ordinary accounts cannot access Admin or another user's designs. Verify forwarded client identity before relying on proxy-based rate limits: trust one verified proxy hop, not arbitrary leftmost headers; adjust only after inspecting the actual provider chain. The connector configuration alone is not proof of that topology.

The cloud database starts empty; local accounts/photos have not been uploaded automatically. No default admin or password is created. After the owner registers a cloud account, grant that existing account through the local operator command pointed securely at the cloud database, or a controlled Atlas data edit. Never auto-grant admin merely because public signup uses a nominated email address.

Render Free sleeps after 15 idle minutes and wakes on a request; waking can take about a minute. Free hours, bandwidth and builds have monthly quotas. Atlas Free has limited storage, so use a small demo dataset. Keep the service and cluster available throughout evaluation and check the link periodically. No guarantee of uninterrupted availability is claimed.

Startup reuses matching MongoDB validators. Changes to the schema require an operator migration. See the [database guide](DATABASE.md) for backup and restore procedures.

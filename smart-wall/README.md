# SmartWall — MEAN wall paint visualizer

Angular 22, Express 5, MongoDB and Node.js 24 with JWT authentication.

## Run locally

```powershell
npm ci
npm start
```

Requires Node 24.16+ within 24.x. Open http://127.0.0.1:4200. API: 3001. Use one hostname consistently.

First startup downloads a MongoDB Community binary from the official MongoDB distribution. Windows ARM uses Windows x64 emulation. The development harness starts a REAL single-node replica set on loopback port 27019 with persistent WiredTiger files in `.data/mongo`. Despite the package name mongodb-memory-server, the configured project database is persisted to disk. Do not expose this unauthenticated development database to a network. Alternatively set MONGODB_URI to an authenticated replica set/Atlas connection. Production never falls back to the development database.

SQLite accounts, projects/photos, patterns, recovery records and feedback import once without deleting the SQLite source. Browser guest saves remain unchanged. Migrated opaque sessions are accepted in development only; new logins use JWTs.

## Features

- Home, Visualize, Shades, Patterns, Login, Signup, Dashboard, Help, Feedback and authorised Admin screens.
- Real room upload, polygon/edge-aware selection, erase/restore, undo, opacity, comparison and PNG export.
- Solid paint, horizontal/vertical dual tone, 11 generated motif styles, scale/custom colours and illustrative Matte/Satin/Gloss finishes. Saved/reopened projects preserve these settings.
- Private account originals/previews/masks; up to 50 projects/256 MB. Guests save in IndexedDB and may explicitly import copies. Individual/selected/all deletion has confirmation.
- Database-managed shade/pattern catalogues, community patterns and persistent favourites.
- Admin colour/pattern add/edit/archive, account disable/enable, saved-project metadata, reasoned/audited private room review, system settings, feedback and KPI refresh every 15 seconds.
- Salted scrypt hashes, signed/revocable JWT cookies, server-enforced roles and ownership, verification/recovery and encrypted durable mail retries.

Editing happens in the browser; account saving uploads photos. Admin private-design reviews require a reason and are logged. Use photos you own or may use. Lighting/screens/texture/finish affect real results: try a physical sample. No AI segmentation is required for Phase 1.

## Administrator and development email

```powershell
npm run admin:grant -- your-account@example.com
```

Operator-only command: grants an already verified account or reserves an invitation until the named email is registered and verified. No password is created. The owner's chosen admin email has been reserved locally; registration is still required.

Development emails go to private `.data/mail` files, not actual inboxes. Request verification/reset, wait up to 10 seconds, then run `npm run mail:inbox`. Do not share/commit these single-use links. Production requires a verified real sender and secrets.

## Checks and operations

```powershell
npm run build
npm test -- --watch=false
npm run test:api
npm run check:release
npm run backup
npm run trial:report
```

Tests use disposable databases/accounts. test:api includes real-MongoDB integration plus retained SQLite migration regressions. Startup/daily snapshots include GridFS and verified checksums; see DATABASE.md. Public deployment, real email delivery, off-host backups and participant evaluation remain external launch tasks.

## Documentation

- [Product requirements](PRD.md)
- [Requirement evidence and remaining tasks](REQUIREMENTS.md)
- [Schema, migration and restore](DATABASE.md)
- [API/architecture](BACKEND.md)
- [AWS deployment](DEPLOYMENT-AWS.md)
- [Participant trial](USER_TRIAL.md)
- [Photo credits](public/images/CREDITS.md)

End-user guidance is available through How to use SmartWall in the footer.

## Applying patterns to your own photo

Open Visualize, upload your room, and choose **Explore patterns & upload your own**. Outline the wall and use Smart select; alternatively use **Apply to my outlined wall** and Erase to protect objects. Choose a built-in pattern tile, or **Upload pattern image** (JPG/PNG/WebP, up to 5 MB). Adjust repeat size and paint strength. Pattern changes automatically return to the painted view. Patterns also has a **Try on my photo** shortcut.

Uploaded textures are optimised to a tile of at most 256 pixels on either side, with aspect ratio/transparency preserved. They repeat inside the same wall mask as paint and are stored with saved designs, including guest saves and account imports. Account saving requires verification. Uploading a pattern does not publish it to the community.

## Gmail verification and password-reset emails

Optional extra, disabled by default for the internship submission. Enable only with `ENABLE_EMAIL_FEATURES=true`. See [GMAIL_SETUP.md](GMAIL_SETUP.md). Run `npm run mail:setup:gmail` in a local terminal to authenticate and save private Gmail settings; then restart the API. `npm run mail:check` verifies authentication without sending mail.

## Free internship hosting

See [DEPLOYMENT-RENDER.md](DEPLOYMENT-RENDER.md) and the repository-root render.yaml for Render Free + Atlas Free. Account setup is pending; no public SmartWall URL is live yet.

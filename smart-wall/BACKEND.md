# Active backend: Express + MongoDB + JWT

`server/mean-api.mjs` is the active Express API, started by `scripts/mean-server.mjs`. MongoDB connections/migration are in mongo.mjs; schema guards in schema.mjs; mail/recovery in mongo-mail.mjs and mongo-recovery.mjs. The earlier SQLite API remains only for migration/regression evidence and is not used by normal startup.

## Authentication

JWT HS256 with fixed issuer/audience, JTI, expiry and user authVersion. Tokens stay in HttpOnly SameSite cookies (Secure in production), never localStorage. The hashed session record and current database role/status are checked on each request. Logout/reset/disable revoke sessions. Public signup ignores role input. Admin invitations are operator-controlled and require email verification.

Writes require application/json and X-SmartWall-Request: 1; cross-origin and cross-site requests fail. Validation restricts lengths, types, images, dimensions, masks, patterns, colours and quotas. Error responses use {error:message} with 4xx/5xx status. Private image reads check ownership; admin private review requires a reason/audit.

## REST routes

| Endpoint | Purpose/access |
| --- | --- |
| GET /api/health | MongoDB ping/stack status |
| GET /api/auth/me | Current public account or null |
| POST /api/auth/signup, /login, /logout | Credentials/session lifecycle |
| POST /api/auth/forgot-password | Generic email response |
| POST /api/auth/reset-password | Single-use token/password; session revocation |
| POST /api/auth/resend-verification, /verify-email | Email proof and nominated-admin activation |
| GET /api/catalog | Active colours, starter patterns and published patterns |
| GET/POST /api/patterns | Browse; verified account publishes name/style/base/ink/scale |
| DELETE /api/patterns/:id | Owner only |
| GET /api/account/stats | Own project/pattern counts |
| GET/POST /api/account/favourites | Own list; write kind(colour/pattern), id, selected |
| GET/POST /api/designs | Own summaries; verified account saves original/preview/state |
| POST /api/designs/delete | Own IDs, at most 50 |
| GET /api/designs/:id | Own full editable project |
| GET /api/designs/:id/photo or /preview | Owner-checked private image |
| POST /api/activity | Anonymous visit ID + upload/heartbeat |
| POST /api/trial/feedback | Ratings/device/tasks/comment; private storage |
| GET /api/settings | Public name/maintenance notice/publishing setting |
| GET /api/admin/overview | Admin KPIs and recent events |
| GET /api/admin/users | Admin account metadata, no hashes |
| POST /api/admin/users/:id | Disable/enable non-admin; revoke sessions |
| GET /api/admin/projects | Metadata only, no automatic room access |
| POST /api/admin/projects/:owner/:id/review | Reasoned/audited photo and preview review |
| GET /api/admin/catalog | Active/archived items |
| POST /api/admin/colours | id/name/hex/family/brand/finishes/active |
| POST /api/admin/patterns | id/name/description/style/base/ink/scale/active |
| DELETE /api/admin/colours/:id or /patterns/:id | Archive item, preserve existing project appearance |
| POST /api/admin/settings | siteName/maintenance/allowPublishing |
| GET /api/admin/feedback or /audit | Private reports |

Saved appearance includes mode, secondary HEX, division percentage/direction, finish and a validated complete pattern snapshot. Legacy saves without appearance open in solid mode. Each save is a separate version. GridFS stores photos/PNGs beyond the BSON document size limit. Transactional quota reservation prevents concurrent saves exceeding limits. See DATABASE.md.

## Analytics definitions and operating limits

Uploads are successful client photo loads (including samples/reopens), not independently verified unique rooms. Save events are committed server inserts. Counts cover 90 days starting when instrumentation was added; historical imported saves are counted only as current projects. Active duration estimates visible-page heartbeat intervals capped at 30 seconds; it is not exact attention tracking. Ease/accuracy are 1-5 ratings with response counts. No photos/passwords enter analytics. Client events are rate-limited, not billing-grade metrics.

Use one API/mail worker for the internship trial. Rate limits are per-process; multi-instance production needs distributed limits and leased mail/backup jobs. Local MongoDB is loopback-only; cloud must use authenticated TLS connections. Logical backups target the internship dataset; use managed backup capacity for larger workloads.

Environment variables are documented in .env.example. Development also loads ignored .env.local without overriding explicit process environment. Production uses service environment only. Gmail SMTP setup and delivery checks are documented in GMAIL_SETUP.md. Tests use isolated databases. npm run check:release checks the actual production launcher without provisioning hosting or delivering real email.

## Internship scope

Email flows are optional and disabled by default. The API reports emailEnabled in /api/auth/me; the UI hides email actions and account registration/saving/publishing do not require verification. Disabled email endpoints return 404 and no signup messages are queued. Password hashing, JWT session revocation, owner checks and explicit operator/admin roles remain enforced. To restore email features, set ENABLE_EMAIL_FEATURES=true and configure a sender.

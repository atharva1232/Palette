# AWS deployment — prepared, not deployed

The internship lists AWS/Vercel/Netlify. This application is prepared for an AWS container deployment with MongoDB Atlas, keeping the compiled Angular frontend and Express API on one HTTPS origin. No AWS/Atlas/email accounts, paid resources or public domain have been provisioned. Docker is not installed on the current laptop, so the Dockerfile has not been built here. Local production-mode checks validate Node startup/static serving separately.

## Accounts and cost review

Create AWS and MongoDB Atlas accounts; choose a region and review ECS/Fargate, load balancer, networking, logs, registry, Secrets Manager and database/backup costs before provisioning. Use a budget alert. Do not use the local development MongoDB process in the cloud. Use a managed replica-set database with authentication, TLS and an appropriate network access policy. Database permissions must allow this application's read/write, indexes and collection validators on its own database.

AWS App Runner is closed to new customers. AWS currently recommends ECS Express Mode, which accepts a container image, task execution/infrastructure roles and service configuration and creates the service/network/load balancer. A provider domain is sufficient for the demo unless the mentor requires a custom domain.

## Prepare the image

From `smart-wall`, on a machine with Docker:

```powershell
docker build --platform linux/amd64 -t smartwall:internship .
```

Push the image to a private Amazon ECR repository using the login/push instructions shown in that repository. The Docker build installs locked dependencies, builds Angular, removes development dependencies and runs as a non-root user. `.dockerignore` excludes photos, databases, secrets, backups and review screenshots. Never copy `.data` or `.env` into an image.

## Service configuration

In the ECS console, create an Express Mode service using the ECR image, required IAM roles, container port **8080** and health check **/api/health**. Configure at least 1 vCPU/2 GB initially; validate actual workload before changing resources. Start with one task for the internship trial. Multiple API instances need a shared rate limiter and a coordinated mail worker/backup job before scaling beyond one.

Set these values through service configuration/Secrets Manager; do not put credentials in source control:

| Variable | Value |
| --- | --- |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| MONGODB_URI | Atlas TLS connection string (secret) |
| MONGODB_DATABASE | smartwall |
| JWT_SECRET | Stable random secret, at least 32 characters |
| ENABLE_EMAIL_FEATURES | false for internship scope; true only if optional email is enabled |
| MAIL_MODE | Optional: resend or gmail when email features are enabled |
| RESEND_API_KEY | Sending API key (secret) |
| MAIL_FROM | Optional Resend sender on your verified email domain |
| MAIL_ENCRYPTION_KEY | Stable random secret, at least 32 characters |
| APP_ORIGIN | Exact HTTPS website origin, no trailing path |

Set the origin to your chosen domain before launch. If using the generated ECS domain, an initial HTTPS placeholder can allow the first health check, then immediately update APP_ORIGIN to the actual returned origin and redeploy before accepting users or sending verification/reset mail. Confirm exact origin/cookies using the launch checks below. Do not publish a placeholder link to participants.

Alternatively, use MAIL_MODE=gmail with GMAIL_USER and GMAIL_APP_PASSWORD from the hosting secret manager (see GMAIL_SETUP.md). Resend requires a verified sending domain for arbitrary real recipients. Add its DNS verification records and test delivery/spam/bounces. A website provider domain does not give you ownership of its email DNS zone.

## Persistence, migration and recovery

All permanent application data and GridFS photos live in Atlas. Container-local snapshots are ephemeral and are **not** the off-host backup solution. Enable an appropriate managed backup plan or export the verified BSON snapshots to encrypted private off-host storage with a retention policy. Preserve mail/JWT secrets separately. Complete a restore drill against a new database before launch.

To transfer existing local accounts, use `npm run backup`, transfer the snapshot privately, then use the documented empty-database restore procedure with the destination MongoDB connection. Do not put backups in ECR, public Git or web assets. Recreate validators/indexes by starting the application after restore. Old development sessions are not valid production credentials; users log in again.

## Launch acceptance

1. Provider HTTPS domain responds; `/api/health` returns `200` and `stack: MEAN`.
2. Source files, `.data`, backups and unauthorised private images return errors.
3. Register, log in and save a disposable design; restart/redeploy and reopen its original photo, pattern/dual-tone settings and selection.
4. Test login/logout, expired or revoked sessions and account ownership. Test email recovery only if the optional email feature is enabled.
5. Grant the nominated existing administrator through the local operator command, then test role restrictions and catalogue changes from separate admin/user accounts.
6. Confirm upload/save/active-time/feedback metrics and audited private review.
7. Observe backup, restore in a new database and verify media/account state.
8. Run the participant plan on desktop and tablet; record issues and fixes.
9. Set up health/5xx alerts, log review, cost alerts and backup ownership. Record the deployed URL/date in REQUIREMENTS.md.

Official references checked 2026-10-23:
- [ECS Express Mode creation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-create-full.html)
- [ECS Express Mode CLI walkthrough](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html)
- [App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)

Email provider credentials and MAIL_ENCRYPTION_KEY are only required if ENABLE_EMAIL_FEATURES=true. They are not required for the default internship build. JWT_SECRET, HTTPS APP_ORIGIN and production MongoDB configuration remain required.

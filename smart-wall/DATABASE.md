# MongoDB schema and relationships

Runtime validation lives in `server/schema.mjs`; unique/expiry indexes and connection setup live in `server/mongo.mjs`. REST validation additionally restricts field lengths, colours, styles, image types, dimensions and quotas. MongoDB must support transactions (a replica set or Atlas).

| Collection | Main fields | Relationship/index |
| --- | --- | --- |
| users | `_id`, name, email, scrypt password hash, role(user/admin), verifiedAt, disabled, authVersion, createdAt, favourites, projectCount, storageBytes | Unique email; project/session/token owner |
| projects | `_id=owner:id`, id, userId, name, fileName, photoId, previewId, photoType, state, bytes, createdAt, updatedAt, savedAt | Indexed owner/save date; original/preview in GridFS |
| colours | `_id`, name, hex, family, brand, finishes, tags, active | Admin CRUD; soft archive preserves old projects |
| patterns | `_id`, ownerId, name, description, category/style, base, ink, scale, author, starter, active, createdAt | Generated repeating motif, no arbitrary executable markup |
| sessions | hash of JWT, userId, jti, authVersion, createdAt, expiresAt | TTL expiry; checked on every authenticated request |
| tokens | userId, purpose, hash, expires, createdAt | Unique owner/purpose; expiring, single-use verification/reset |
| outbox | encrypted payload, userId, purpose, attempts, nextAttempt, expires | Durable mail retries; AES-256-GCM |
| media.files / media.chunks | GridFS file metadata and binary chunks | Holds original room images and painted PNGs beyond the BSON document size limit |
| settings | `_id=system`, siteName, maintenance, allowPublishing | Admin-only writes |
| admin_invitations | `_id=email`, approvedAt | Operator-nominated admin; local grant activates an existing account (email proof required only when optional email features are enabled) |
| events | type(upload/save), createdAt, userId or anonymous visit, expiresAt | 90-day TTL; no photos, room names or passwords |
| visits | anonymous random visit ID, createdAt, lastSeen, activeSeconds, expiresAt | 90-day TTL; visible-page heartbeat estimate |
| feedback | ease, accuracy, device, task flags, comment, createdAt | Private admin/CLI reports |
| audit | actor, action, target, createdAt | Logs admin edits and reasoned private-design reviews |
| migrations | import identifier, completedAt | Resumable import marker |

`state` holds colour strength, tolerance, wall boundary/safety/protection masks, seed points, polygons and optional `appearance`. Appearance includes mode(solid/dual/pattern), secondary colour, split percent/direction, illustrative finish and a complete pattern snapshot. This snapshot keeps projects editable even if a catalogue item is later changed or archived. Each save creates a new project/version; createdAt and updatedAt therefore initially match. Related projects may share the same original photo content but have independent saved versions.

Colours are a concept palette, not manufacturer-certified colour matches. Brand metadata can be supplied by the administrator; the app does not imply a commercial paint-brand affiliation. Catalogue patterns use generated motifs; custom raster textures can also be uploaded privately into a saved project appearance snapshot. `scale` records the repeat size in preview pixels.

## Security and atomicity

JWTs are signed HS256 with fixed issuer/audience, expiry and JTI; HttpOnly/SameSite cookies keep them outside JavaScript. Production requires Secure cookies and a configured JWT secret. MongoDB stores only the JWT hash. Session records and user authVersion allow immediate revocation. Public signup cannot choose a role. Admin authority comes from the database, not untrusted JWT/UI claims.

Quota reservation + project metadata inserts and project deletion + quota release use transactions. Media is written first with unique attempt IDs; failed saves remove their own uncommitted media. Private image reads always check project ownership. Administrative image access requires a reason and writes an audit entry. Admin account disabling invalidates sessions.

## Migration and backups

Startup imports `.data/smartwall.sqlite` once without deleting or modifying it. Stable owner/project IDs, password hashes, photos, masks, patterns, recovery tokens, pending mail and feedback are copied. Imported legacy opaque sessions are accepted in development only; production requires JWT login. Re-running an interrupted migration skips existing destination records; it does not overwrite newer MongoDB data.

`npm run backup` creates a consistent snapshot transaction, serialises each collection as BSON (including GridFS), records SHA-256/count manifests and verifies it. Startup/scheduled snapshots run by default every 24 hours with seven verified copies. These are logical backups for the internship-sized dataset and use memory proportional to one collection. Local disk copies do not provide disaster recovery: arrange encrypted off-host storage/Atlas backup before public launch.

Restore into a NEW EMPTY database:

```powershell
$env:MONGODB_DATABASE='smartwall_restore_check'
npm run backup -- restore C:\PrivateBackups\mongo-TIMESTAMP-UUID
```

Restore refuses any nonempty destination. Start the app against the restored database to reapply validators/indexes. Preserve JWT/mail secrets separately. Check credentials, original photos, editable style/masks and patterns before switching traffic. Never restore over a live database.

### Uploaded room-pattern tiles

Project `state.appearance` can additionally store `patternSource` (built-in/upload) and `texture` (name, width, height, base64 RGBA pixels, repeat scale). Uploads accept raster JPG/PNG/WebP up to 5 MB and are decoded/re-rasterised locally to at most 256×256, stripping source metadata. Server validation restricts dimensions, exact pixel byte counts, visible alpha and repeat range (16–512 px). The validated tile stays in the private project snapshot and survives reopen, guest import and backups. No SVG/HTML or arbitrary executable texture payload is accepted.

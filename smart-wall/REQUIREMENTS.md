# Internship implementation and evidence

The [product requirements](PRD.md) capture the supplied internship brief. The [public demo](https://smart-wall-atharva1232.onrender.com/) runs on Render with MongoDB Atlas.

| Requirement | Implementation/evidence | State |
| --- | --- | --- |
| MEAN stack | Angular 22, Express 5, MongoDB replica set/GridFS, Node 24; active mean-api.mjs entrypoint | Implemented locally |
| REST + JWT | Fixed algorithm/issuer/audience, HttpOnly cookies, hashed revocable sessions; API tests | Implemented/tested |
| Registration/login/user/admin roles | Password hashes, login/logout, server role checks and operator-only admin grants | Implemented/tested |
| Real room JPG/PNG upload | JPG/PNG/WebP up to 15 MB; image/header/size/mask validation; original photo retained | Implemented |
| Manual selection | Polygon boundary plus edge-aware surface selection, erase/restore, tolerance, undo and keyboard controls | Implemented |
| Paint and basic designs | Solid colours, built-in motifs and uploaded textures clipped to each selected wall | Implemented/tested |
| Dual-tone walls | Horizontal/vertical two-colour division and adjustable split, clipped to selected wall | Implemented/tested |
| Opacity/realistic impression | Paint strength, retained source shading and illustrative Matte/Satin/Gloss response | Implemented; not physical simulation |
| Before/after | Original/painted comparison in editor | Implemented |
| Save/download/edit/multiple trials | Original + PNG + masks/style snapshot; refresh/reopen; separate named versions; PNG download | Implemented; browser save/reopen checked |
| Saved design management | Owner-scoped gallery; individual/selected/all confirmed deletion; explicit guest import | Implemented/tested |
| Palette management | MongoDB colours with name/HEX/brand/family/finishes/tags; admin add/edit/archive | Implemented; browser admin-to-public update checked |
| Pattern management | Starter/shared patterns, name/description/category/style/base/ink/scale; admin update/archive and owner publication/deletion | Implemented with generated motifs |
| Favourites | Account colour/pattern references; favourite controls, shade filter and dashboard list | Implemented |
| Admin content/users | Catalogue editors, user disable/enable/session revocation | Implemented/tested |
| Admin activity/saved designs | KPI overview, metadata list, explicit reasoned private-photo review and audit trail | Implemented; browser review checked |
| System configuration | Website name, maintenance notice, community-publishing setting | Implemented |
| Secure user data | Validation, hashes, JWT revocation, role/owner checks, same-origin writes, private media, encrypted mail queue, backup manifests | Automated checks pass; not an independent security audit |
| Fast processing | Synthetic 1600×1067 Node CPU benchmark: median solid 18.73 ms, dual 19.96 ms, crosshatch 33.09 ms | Measured locally; excludes decode/selection/canvas/network |
| Desktop/tablet responsive UI | Browser desktop view and 768×1024 tablet checks for admin/editor; tablet document width matched viewport without horizontal overflow | Checked on this browser; physical-device participant testing pending |
| Simple/intuitive UI | In-app user guide, labelled controls, FAQs, selection instructions, error/retry states | Implemented; ease/confidence outcomes need real-user evidence |
| Image ownership/result limitations | Upload ownership guidance and lighting/screen/texture/finish disclaimer | Implemented |
| 6–7 interconnected functional pages | Home, Visualize, Shades, Patterns, Login, Signup, Dashboard, Help, Feedback, role-restricted Admin | Implemented |
| Database schema | DATABASE.md; actual schema validators/indexes and collection relationships | Delivered |
| PRD | PRD.md | Delivered |
| User documentation | How to use Palettè page in footer; task instructions and FAQ | Delivered |
| Developer documentation | [README](../README.md), [API](BACKEND.md), [database](DATABASE.md), [deployment](DEPLOYMENT-RENDER.md) and [environment template](.env.example) | Delivered |
| Upload/save/session/satisfaction KPIs | Admin overview refreshes every 15s; 90-day events, active-visit estimate, private ratings | Implemented; metric definitions disclosed |
| Cloud deployment with domain | Render Free web service with public HTTPS and MongoDB Atlas | Deployed |
| Password recovery email | Brevo sends reset links independently of signup verification | Deployed and confirmed by the project owner on 12 November 2026 |
| Service availability | Public health endpoint and free hosting | Extended availability and production recovery testing remain unverified |

## Acceptance evidence

- Production Angular build passes.
- Release checks on 10 November 2026 passed 39 frontend and 58 backend tests, including MongoDB integration and SQLite migration regressions.
- Production launcher smoke check: compiled app/CSS, private paths, unauthorised photo routes, cross-origin writes and initial backup pass. No actual email is sent by this check.
- MongoDB backup/empty-database restore drill checks accounts, saved appearance and original-photo GridFS chunks. The production off-host recovery drill remains a launch task.
- Browser QA used a disposable administrator/database on localhost, separate from the owner's 127.0.0.1 cookies. Created a shade through admin, saw it in the public catalogue, saved a patterned room, refreshed/reopened it, reviewed it through reasoned admin access and checked tablet layouts. Disposable database/account removed afterwards.
- Migration verification preserved the one existing account/password hash. The legacy SQLite database contained zero account-saved projects; two browser guest saves remain in IndexedDB and were not deleted/imported automatically. SQLite source retained.
- Screenshots and benchmark/migration diagnostics are private ignored files under review/. They are engineering evidence, not participant feedback.

## Remaining evaluation

- Verify that disposable saved designs survive a cloud redeploy and document an off-host backup and restore drill.
- Record participant outcomes if running the optional desktop and tablet evaluation described in the [project report](../PROJECT_REPORT.md#limitations-and-future-work).

## Explicitly not missing from Phase 1

Automatic AI wall detection, AR/VR, a native mobile application, purchasing/payments, advanced 3D/textures and day/night simulation are excluded/future enhancements in the supplied brief. Generated 2D motifs satisfy the basic-design implementation; custom raster pattern tiles can now be uploaded and saved privately. Perspective-aware texture mapping and certified manufacturer colour matching are not claimed.

## Known production limits

Use one API/mail worker for the trial. Multiple instances require distributed rate limiting and a leased mail worker/coordinated backups. The development replica set is loopback-only and not a production database. Container-local backups are ephemeral; off-host/managed backups are mandatory before public acceptance. Benchmark values apply only to this machine and measured CPU stage. Intended reductions in repaint costs and improvements in confidence are objectives, not measured achievements.

## Pattern upload follow-up

Added visible built-in tiles, a Patterns-page “Try on my photo” shortcut, explicit wall-selection guidance and a manual outlined-wall fill option. Pattern choices now leave Original comparison mode automatically. Custom raster uploads repeat within the wall mask with adjustable repeat size/transparency and persist in saved projects. Browser verification used a room uploaded through the file chooser (not the guided sample) and a generated QA tile. No real user designs were deleted or published.

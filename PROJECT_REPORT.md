# Palettè | Internship project report

- **Project** — Smart Wall Paint Visualizer
- **Technology** — MongoDB, Express, Angular and Node.js
- **Deliverables** — [Source repository](https://github.com/atharva1232/Palette) · [Live application](https://smart-wall-atharva1232.onrender.com/) · [Local setup](README.md#run-locally)

## Abstract

Palettè is a web application for previewing paint on a photo of a real room. Users select a wall, try solid colours, two-tone combinations or repeating patterns, and compare the result with the original photo. They can save an editable design or export a PNG. An administrative interface manages the colour and pattern catalogues and provides activity and feedback summaries. The public demo runs on Render with MongoDB Atlas.

## Problem and objectives

A colour chip shows paint in isolation. Wall geometry, nearby furniture and room lighting make it difficult to judge how the same colour will look at home. Palettè lets users compare several options on the same photo before choosing a physical sample. The internship brief also calls for an editable project workflow, user and administrator roles, catalogue management and a public cloud demo. The [product requirements](smart-wall/PRD.md) describe the full scope.

## User workflow

1. Open **Visualize** and upload a JPG, PNG or WebP room photo, or load the sample room.
2. Mark the corners of a wall and lock its outline. Use edge-aware selection or fill the outlined area. Refine the selection with erase and restore tools.
3. Choose a solid colour, a horizontal or vertical two-tone split, a built-in pattern or a custom image texture. Adjust paint strength, finish and pattern scale as needed.
4. Compare the preview with the original. Add another wall for a separate treatment or save another version to compare design options.
5. Save in the browser as a guest or sign in to save to an account. Reopen saved designs for further editing, or download a PNG for sharing.

The **Shades** and **Patterns** pages offer browsable catalogues. Signed-in users can save favourites and publish supported patterns to the community catalogue. The account interface provides registration, sign-in, sign-out and email password recovery. The Visualize page includes a quick guide, and the footer links to fuller user help.

## Architecture and implementation

| Layer | Implementation |
| --- | --- |
| Frontend | Angular 22 and TypeScript provide the editor, catalogues, account pages and administrator views. Canvas renders the photo and paint preview. |
| API | Express 5 on Node.js 24 serves REST endpoints for authentication, saved designs, catalogues, feedback and administration. The deployed API serves the Angular build on the same origin. |
| Data and media | MongoDB stores accounts, projects, catalogue entries, favourites and activity. GridFS stores original room photos and painted previews. |
| Local storage | IndexedDB stores guest designs on the current browser. A signed-in user can explicitly import local designs into their account. |
| Hosting and mail | Render hosts the web service, Atlas provides persistent storage and Brevo sends password reset emails over HTTPS. |

The renderer uses a mask to limit paint to each wall. Source shading remains visible through the paint effect, while the original photo stays available for comparison. For a two-tone design, the selected direction and split position determine which colour applies inside the mask. Pattern rendering repeats a built-in motif or a user-provided texture inside the same boundary. Custom uploads are resized locally into repeatable tiles.

An account save associates the original photo and rendered preview with the owner and records the masks and appearance settings needed to reopen the design. A saved project includes an appearance snapshot so a catalogue edit or archive does not remove its styling. The [API guide](smart-wall/BACKEND.md) and [database guide](smart-wall/DATABASE.md) provide implementation details.

## Security and administration

The backend hashes passwords with scrypt and uses signed JWT sessions in HttpOnly cookies. It checks roles and project ownership on the server. Password resets invalidate existing sessions, and reset links expire after 30 minutes and can be used once. The API validates uploaded images, checks storage limits and restricts access to saved photos.

Administrators can add, edit or archive catalogue entries, manage eligible user accounts and review feedback. Reviewing a private design requires a reason and creates an audit record. The activity dashboard reports photo loads, saved designs, estimated active time and feedback ratings. Photo load totals include samples and reopened designs, and active time is estimated from activity signals.

## Testing and results

| Check | Recorded result |
| --- | --- |
| Build and automated tests | The release checks on 10 November 2026 passed the production Angular build, 39 frontend tests and 58 backend tests. Backend coverage included MongoDB integration, access controls and migration regressions. |
| Editor and administration | Browser checks covered saving and reopening a patterned design, publishing catalogue changes through Admin and reviewing a disposable saved design with an audit reason. |
| Responsive layout | The editor and Admin views were checked at desktop and tablet browser widths, including 768 × 1024. |
| Rendering performance | A synthetic 1600 × 1067 local CPU benchmark recorded medians of 18.73 ms for solid paint, 19.96 ms for two-tone paint and 33.09 ms for a crosshatch pattern. The benchmark measured the paint calculation and excluded image decoding, selection, browser drawing and network time. |
| Public deployment and recovery | The live service responded to its health check, and the project owner confirmed receiving and using the deployed password reset flow on 12 November 2026. |

The [implementation checklist](smart-wall/REQUIREMENTS.md) maps features and evidence to the internship brief.

## Deployment and demonstration

The live demo uses a public HTTPS address. Render serves the frontend and API, while MongoDB Atlas stores account and design data. The [deployment guide](smart-wall/DEPLOYMENT-RENDER.md) describes runtime configuration, the health check and email settings.

To demonstrate the core workflow, open **Visualize**, load the sample room, outline a wall, apply a colour or pattern, compare it with the original and download the preview. To demonstrate persistence, sign in with a test account, save a disposable design, reload and reopen it from the gallery.

## Limitations and future work

- Manual outlines and edge-aware selection can need refinement around furniture, shadows and objects with similar colours. Actual paint appearance varies with room lighting, surface texture and display settings.
- Render Free can sleep when idle. Long-term availability, saved-project persistence across a cloud redeploy and an off-host production restore still need documented verification.
- A structured desktop and tablet participant evaluation remains pending. It can measure completion of the upload, selection, save and reopen tasks, along with ease and perceived preview accuracy. The current evidence does not measure changes in buying confidence or repainting costs.
- Source and permission records for two bundled room photos remain pending. The [photo credits](smart-wall/public/images/CREDITS.md) identify the assets.

## Conclusion

Palettè delivers the internship’s core workflow from photo upload and wall selection through preview, saving and export. The live application also demonstrates account recovery, administrative catalogue management and activity reporting. The recorded checks support the implemented functionality, with participant evaluation and production recovery verification remaining open.

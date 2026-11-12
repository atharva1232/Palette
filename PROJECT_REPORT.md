# Palettè | Internship project report

- **Project** — Smart Wall Paint Visualizer
- **Technology** — MongoDB, Express, Angular and Node.js
- **Deliverables** — [Source repository](https://github.com/atharva1232/Palette) · [Live application](https://smart-wall-atharva1232.onrender.com/) · [Local setup](README.md#run-locally)

## Abstract

Palettè is a web application for previewing paint on a photo of a real room. Users select a wall, try solid colours, two-tone combinations or repeating patterns, and compare the result with the original photo. They can save an editable design or export a PNG. An administrative interface manages the colour and pattern catalogues and provides activity and feedback summaries. The public demo runs on Render with MongoDB Atlas.

## Problem and objectives

A colour chip shows paint in isolation. Wall geometry, nearby furniture and room lighting make it difficult to judge how the same colour will look at home. Palettè lets users compare several options on the same photo before choosing a physical sample. Homeowners and renters are the primary users. Interior designers and painters can also use the preview to discuss options with clients.

The project focused on three outcomes:

- Let users recolour individual walls while preserving the rest of the room photo.
- Make comparisons repeatable by saving editable versions and exporting a preview.
- Deliver an end-to-end web application with account access, catalogue administration and a public cloud demo.

Automatic wall detection, live camera previews and paint purchasing were outside the internship scope. The [product requirements](smart-wall/PRD.md) describe the full brief.

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

### Wall selection and rendering

1. **Set the boundary.** The editor converts the user's outline into a pixel mask. Pointer coordinates are mapped from the displayed canvas to image pixels, so the same selection works when the preview is resized.
2. **Refine the region.** Smart select starts from a point on the wall and checks neighbouring pixels for colour similarity and strong brightness changes. It stays inside the outline. The erase tool protects selected areas, such as a picture frame, from being painted again when the user adjusts the tolerance.
3. **Render the preview.** The paint is blended with the original pixels according to paint strength and local brightness, which preserves visible shadows. Two-tone paint divides the wall along the selected direction and position. Patterns repeat inside the same wall mask. The browser resizes uploaded pattern images into tiles up to 256 pixels on either side.
4. **Compare and export.** The editor keeps the original photo available for before-and-after comparison. The PNG export uses the painted result with the same wall boundaries and protected areas.

### Saving and reopening designs

Guest designs stay in IndexedDB. For an account save, the API validates the design and image data, then stores the original photo and painted PNG in GridFS. The project record links those files to the owner and stores the wall masks, paint settings and pattern choices. When a project is reopened, the editor uses this saved state to reconstruct the design. Saving a snapshot of the appearance lets users reopen it after a catalogue item is edited or archived.

The server checks ownership when listing, opening or deleting saved designs. An account can store up to 50 designs or 256 MB. A database transaction records the project and updates the account quota together, and the API recognises a repeated save with the same design ID. The [API guide](smart-wall/BACKEND.md) and [database guide](smart-wall/DATABASE.md) provide implementation details.

## Security and administration

The backend hashes passwords with scrypt and uses signed JWT sessions in HttpOnly cookies. It checks roles and project ownership on the server. Password resets invalidate existing sessions, and reset links expire after 30 minutes and can be used once. The API validates uploaded images, checks storage limits and restricts access to saved photos.

Administrators can add, edit or archive catalogue entries, manage eligible user accounts and review feedback. Reviewing a private design requires a reason and creates an audit record. The activity dashboard reports photo loads, saved designs, estimated active time and feedback ratings. Photo load totals include samples and reopened designs, and active time is estimated from activity signals.

Password recovery is enabled on the live demo independently of signup verification. A reset request returns the same generic response for registered and unregistered addresses to protect account privacy. Brevo delivers the link for registered accounts.

## Testing and results

| Check | Recorded result |
| --- | --- |
| Build and automated tests | The release checks on 10 November 2026 passed the production Angular build, 39 frontend tests and 58 backend tests. Backend coverage included MongoDB integration, access controls and migration regressions. |
| Editor and administration | Browser checks covered saving and reopening a patterned design, publishing catalogue changes through Admin and reviewing a disposable saved design with an audit reason. |
| Responsive layout | The editor and Admin views were checked at desktop and tablet browser widths, including 768 × 1024. |
| Rendering performance | A synthetic 1600 × 1067 local CPU benchmark recorded medians of 18.73 ms for solid paint, 19.96 ms for two-tone paint and 33.09 ms for a crosshatch pattern. The benchmark measured the paint calculation and excluded image decoding, selection, browser drawing and network time. |
| Public deployment and recovery | The live service responded to its health check, and the project owner confirmed receiving and using the deployed password reset flow on 12 November 2026. |

The [implementation checklist](smart-wall/REQUIREMENTS.md) maps features and evidence to the internship brief.

The browser checks used disposable accounts and sample data. They show that the tested workflows could be completed, but provide no participant satisfaction scores. A follow-up evaluation can record which steps users complete without help and where they have difficulty, particularly around wall boundaries and reopening a design.

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

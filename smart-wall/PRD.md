# Palettè — wall paint visualizer product requirements

Source: the eight internship brief screenshots supplied by the project owner. This document records requirements; implementation evidence and remaining external tasks are in REQUIREMENTS.md.

## Problem and objectives

Customers struggle to imagine paint in their own rooms; showroom cards do not reproduce their lighting. Provide an interactive browser application for real room photos, manual wall selection, paint colours and simple designs. The intended benefits are better confidence and fewer unsuitable paint choices/repainting costs. These benefits require participant evidence and must not be claimed as measured outcomes yet. Secondary users are interior designers, painters and paint retailers.

## Scope

Phase 1 includes image upload, manual brush/polygon selection, virtual colours/basic designs, paint opacity, before/after preview, editable selections, multiple trials, saving/downloading, user/admin roles and colour palette management. Solid and dual-tone walls are required.

Out of scope: automatic AI wall segmentation, AR/VR/live-camera preview, a native mobile app, paint purchasing and payments. Future extensions include advanced textures, 3D, day/night simulation and retailer/brand integrations.

## Required stack and architecture

MongoDB, Express.js, Angular 15+ and Node.js; REST endpoints with JWT authentication. Frontend uses TypeScript, CSS and HTML Canvas/SVG. MongoDB collections hold users, projects, colours, patterns and administration/settings data. Images may use references to a dedicated media store. Public demonstration is to run in the cloud (AWS/Vercel/Netlify were listed in the brief) with a domain.

## User flows and functional requirements

1. Register/log in; upload an original JPG/PNG room photo.
2. Manually select walls with polygon or brush tools; refine selections.
3. Apply solid colours, dual-tone colours or basic designs; adjust opacity.
4. Preview before/after and try multiple versions of the same image.
5. Save an editable project with its original image; download the final result.
6. Browse clearly named shades/codes and designs. Preserve favourite colours/patterns.
7. An administrator manages paint colours/shade details, adds/updates/removes designs, reviews user activity/saved designs and maintains system configuration.

## Data expectations

Projects: unique ID, owner, original-image reference, wall coordinates/polygons/masks, colour/design reference and settings, creation/modification dates.

Colours: unique ID, name, HEX/RGB, brand/manufacturer, finish options, categories/tags and displayed swatch.

Patterns: unique ID, name, description, style/category, generated motif or texture/image, dimensions/scaling information.

Users: ID, name, email, password hash, role, creation date, owned project references and favourite colour/pattern list. Admins use the same identity model with permissions and system configuration.

## Quality and measurement

Simple nontechnical UI; responsive desktop/tablet layouts; responsive image processing; secure handling of uploaded images and account data; cloud availability. Explain that real paint varies with lighting, screens and wall texture. Ask users to upload only images they own or may use.

KPIs: room uploads, saved designs, average session duration and satisfaction feedback. Define measurement windows and limitations, show usage in an admin dashboard, and keep private photos out of analytics.

## Deliverables and acceptance

- This PRD and a working web app covering all in-scope features.
- Admin dashboard for content/user management and usage analytics.
- Defined MongoDB schema/collections, end-user help and developer/setup/API/deployment documentation.
- Cloud deployment with a public domain for demonstration.
- At least 6–7 interconnected functional screens/areas (the brief gives login, upload, selection, preview, saves and admin as examples).
- Demonstrable frontend/API/database integration and evidence for security, accuracy, responsive layouts and rendering performance.

The PRD does not prescribe a numerical latency or availability SLA. Record actual measurements and deployment state rather than inventing compliance percentages.

# Palettè

Palettè is a wall paint visualizer that lets you try colours and patterns on a photo of your room. Outline each wall, compare the result with the original, and save or export your design.

[Open the live demo](https://smart-wall-atharva1232.onrender.com/)

[Read the detailed internship project report](PROJECT_REPORT.md)

## Features

- Preview solid colours, dual tones, built-in patterns, or an uploaded texture on selected walls.
- Refine the wall selection with edge-aware tools, adjust paint strength and finish, and export a PNG.
- Save designs in the browser as a guest or sign in to save editable designs to your account.
- Browse shades, save favourites, and share patterns. Administrators can manage the catalogues and review feedback.

Photo editing runs in the browser. Saving to an account uploads the original photo and preview. Lighting, texture, and screen settings affect how colours appear, so use a physical sample before buying paint.

## Run locally

Use Node.js 24.16 or later within the 24.x release line and npm. From the repository root, run:

```powershell
cd smart-wall
npm ci
npm start
```

Open [the local app](http://127.0.0.1:4200/). The first run downloads a MongoDB binary and starts a local replica set with data stored under `smart-wall/.data/mongo`. You can also supply an authenticated MongoDB connection in an ignored `smart-wall/.env.local` file. [Environment template](smart-wall/.env.example)

## Architecture and checks

Angular 22 provides the interface. Node.js and Express 5 serve the API, MongoDB stores application data, and GridFS stores saved photos and previews. Authentication uses revocable JWT sessions in HttpOnly cookies.

From `smart-wall`, run the build and test suites:

```powershell
npm run build
npm test -- --watch=false
npm run test:api
```

## Documentation

| Guide | What it covers |
| --- | --- |
| [Deployment on Render](smart-wall/DEPLOYMENT-RENDER.md) | Atlas, production configuration, and Brevo password resets |
| [Backend and API](smart-wall/BACKEND.md) | Routes, authentication, and local operations |
| [Database](smart-wall/DATABASE.md) | Schema, migration, backups, and restores |
| [Product requirements](smart-wall/PRD.md) · [Implementation status](smart-wall/REQUIREMENTS.md) | Internship scope and supporting evidence |
| [Photo credits](smart-wall/public/images/CREDITS.md) | Image attribution |

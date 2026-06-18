# NYORIA Tools

All-in-one browser tools for images and PDFs.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

The terminal prints two URLs:

```text
Local URL: http://localhost:5001
Mobile URL: http://YOUR_LAN_IP:5001
```

Use the local URL on the computer running the app. Use the mobile URL on phones or tablets connected to the same Wi-Fi network.

If mobile cannot open the app:

- Make sure the phone and computer are on the same Wi-Fi.
- Allow Node/network access if macOS asks.
- Turn off VPN or private relay temporarily.
- Use the printed `Mobile URL`, not `localhost`.

## Production Build

```bash
npm run build
npm run server
```

The production server also runs on one port and serves both:

- Frontend: `/`
- Backend API: `/api/*`

## Vercel Deploy

This repo includes `vercel.json` and `api/index.js` for Vercel.

Use these Vercel settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

API routes are handled by the serverless Express adapter:

```text
/api/* -> api/index.js
```

All frontend routes load the Vite app:

```text
/* -> dist/index.html
```

## Important Hosting Note

Large uploads, OCR, PDF editing, and image processing can exceed Vercel serverless limits. If those tools fail on large files after deployment, use a Node server host such as Render, Railway, Fly.io, or a VPS.

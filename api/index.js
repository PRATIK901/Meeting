import { createApp } from '../server/app.js';

/**
 * The Vercel entry point.
 *
 * Vercel builds `dist/` and serves it from its CDN, then routes only `/api/*`
 * here (see `vercel.json`). So this function handles the API and nothing else
 * — `serveStatic: false` keeps it from duplicating what the CDN already does,
 * and keeps the function small.
 *
 * An Express app is itself a `(req, res)` handler, which is exactly the shape
 * Vercel expects, so it can be exported directly. There is no `listen` here:
 * the platform invokes this per request rather than running a server.
 *
 * Required environment variables (Project Settings -> Environment Variables):
 *
 *   TURSO_DATABASE_URL    libsql://<name>-<org>.turso.io
 *   TURSO_AUTH_TOKEN      from `turso db tokens create <name>`
 *   ATTENDANCE_TIMEZONE   the office's zone, e.g. Asia/Kolkata — without it
 *                         the attendance date is UTC, which rolls over
 *                         mid-evening for most of the world
 */
export default createApp({ serveStatic: false });

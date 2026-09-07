import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dbPath } from './db.js';
import { HttpError, translate } from './errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { requireAdmin } from './auth.js';
import { seedIfEmpty } from './seed.js';

/**
 * The whole backend: one Node process, one SQLite file, no network calls out.
 *
 * In production it also serves the built frontend from `dist/`, so `npm start`
 * on the office machine is the entire deployment — one command, no services to
 * sign into, and nothing that stops working when the internet does. In
 * development Vite serves the frontend on 5173 and proxies `/api` here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

seedIfEmpty();

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
// The one gate on everything behind the sign-in wall. It replaces the RLS
// policies: the rule now lives here rather than being re-checked per row.
app.use('/api/admin', requireAdmin, adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

/**
 * The built app, when there is one.
 *
 * `index.html` answers any unmatched path because the router uses real URLs —
 * a phone opening `/attendance/A` straight from a QR code must get the app,
 * not a 404 from the file server.
 */
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*splat', (_req, res) => {
    res.sendFile(join(dist, 'index.html'));
  });
}

/** Constraint failures become sentences; anything else is a real 500. */
app.use((error, _req, res, _next) => {
  const known = error instanceof HttpError ? error : translate(error);
  if (known) {
    res.status(known.status).json({ error: known.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = Number(process.env.PORT ?? 3000);

// `0.0.0.0`, not localhost: the phones that scan the posters are other devices
// on the same office network and have to be able to reach this.
app.listen(port, '0.0.0.0', () => {
  console.log(`  Attendance server on http://localhost:${port}`);
  console.log(`  Data file: ${dbPath}`);
  if (!existsSync(dist)) {
    console.log('  No dist/ yet — run `npm run build`, or `npm run dev` for the UI.');
  }
});

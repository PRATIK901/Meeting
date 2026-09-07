import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HttpError, translate } from './errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { requireAdmin } from './auth.js';

/**
 * The Express app, with no opinion about how it is served.
 *
 * `server/index.js` gives it a port for local use; `api/index.js` hands it to
 * Vercel as a serverless function. Keeping `app.listen` out of this file is
 * what lets both work from one definition — on Vercel nothing ever listens,
 * the platform invokes the exported handler per request.
 */

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

export function createApp({ serveStatic = true } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  // The one gate on everything behind the sign-in wall.
  app.use('/api/admin', requireAdmin, adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  /**
   * The built app, when this process is the one serving it.
   *
   * On Vercel it is not: the CDN serves `dist/` and only `/api/*` reaches this
   * function, so the static handling below is skipped.
   */
  if (serveStatic && existsSync(dist)) {
    app.use(express.static(dist));
    // `index.html` answers any unmatched path because the router uses real
    // URLs — a phone opening `/attendance/A` straight from a QR code must get
    // the app, not a 404 from the file server.
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

  return app;
}

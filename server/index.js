import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { dbUrl, isRemote } from './db.js';

/**
 * Running the app on a machine you own.
 *
 * Serves both the API and the built frontend from one process, so `npm start`
 * is the whole deployment. By default the data is the same local SQLite file
 * as always; set `TURSO_DATABASE_URL` to point this at the hosted database
 * instead, which is useful for reproducing something the deployment is doing.
 */

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 3000);

// `0.0.0.0`, not localhost: the phones that scan the posters are other devices
// on the same office network and have to be able to reach this.
createApp().listen(port, '0.0.0.0', () => {
  console.log(`  Attendance server on http://localhost:${port}`);
  console.log(`  Database: ${isRemote ? 'hosted Turso' : dbUrl.replace('file:', '')}`);
  if (!existsSync(dist)) {
    console.log('  No dist/ yet — run `npm run build`, or `npm run dev` for the UI.');
  }
});

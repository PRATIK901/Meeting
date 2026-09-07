import { dbUrl, isRemote } from '../server/db.js';
import { setup } from '../server/seed.js';

/**
 * Apply the schema and the starting data to whichever database the environment
 * points at.
 *
 *   npm run db:push                          # the local file
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:push    # hosted
 *
 * Safe to re-run: the schema is `if not exists`, the trial data only loads
 * into a database with no meetings, and the admin only into one with no
 * administrators.
 */

console.log(`\n  Target: ${isRemote ? dbUrl : dbUrl.replace('file:', '')}\n`);

await setup();

console.log('\n  Done.\n');
process.exit(0);

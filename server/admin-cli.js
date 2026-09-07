import { isRemote, row, rows, run } from './db.js';
import { createAdmin, hashPassword } from './auth.js';

/**
 * Manage administrator accounts from the terminal.
 *
 *   npm run admin -- <email> <password>   create, or reset the password
 *   npm run admin -- --list               who can sign in
 *   npm run admin -- --remove <email>     revoke access
 *
 * Acts on whichever database the environment points at — the local file by
 * default, or the hosted one when `TURSO_DATABASE_URL` is set, which is how
 * you create the deployment's first administrator.
 *
 * Removing an account drops its sessions with it (`on delete cascade`), which
 * signs that person out of every browser immediately rather than whenever
 * their token happens to expire.
 */

const args = process.argv.slice(2);

function usage() {
  console.log(
    'Usage:\n' +
      '  npm run admin -- <email> <password>   create or reset an administrator\n' +
      '  npm run admin -- --list               list administrators\n' +
      '  npm run admin -- --remove <email>     remove an administrator',
  );
}

console.log(`  (${isRemote ? 'hosted database' : 'local database'})`);

if (args[0] === '--list') {
  const admins = await rows('select email, created_at from admin_users order by email');
  if (admins.length === 0) console.log('No administrators yet.');
  for (const admin of admins) console.log(`${admin.email}\t${admin.created_at}`);
} else if (args[0] === '--remove') {
  const email = String(args[1] ?? '').trim().toLowerCase();
  if (!email) {
    usage();
    process.exit(1);
  }
  const { changes } = await run('delete from admin_users where email = ?', email);
  console.log(changes > 0 ? `Removed ${email}.` : `No administrator named ${email}.`);
} else if (args.length === 2) {
  const email = args[0].trim().toLowerCase();
  const password = args[1];
  if (password.length < 8) {
    console.error('Pick a password of at least 8 characters.');
    process.exit(1);
  }

  const existing = await row('select id from admin_users where email = ?', email);
  if (existing) {
    // Old sessions stay valid on purpose: a password reset by the same person
    // should not sign them out of the tab they are typing it in.
    await run(
      'update admin_users set password_hash = ? where id = ?',
      hashPassword(password),
      existing.id,
    );
    console.log(`Reset the password for ${email}.`);
  } else {
    await createAdmin(email, password);
    console.log(`Created ${email}.`);
  }
} else {
  usage();
  process.exit(args.length === 0 ? 0 : 1);
}

process.exit(0);

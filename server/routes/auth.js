import { Router } from 'express';

import { db, row } from '../db.js';
import {
  adminForToken,
  clearSessionCookie,
  createSession,
  destroySession,
  readCookie,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';

export const authRouter = Router();

/**
 * Sign-in for the admin screens.
 *
 * This replaces Supabase Auth. An account is a row in `admin_users` with a
 * scrypt hash; a session is a random 32-byte token in `sessions`, handed back
 * as an httpOnly cookie. Nothing leaves this machine, and there is no JWT for a
 * browser extension to read out of localStorage.
 *
 * The old two-step check — "signed in" *and* "in admin_users" — collapses into
 * one here, because `admin_users` is now the only account table there is.
 */

const byEmail = db.prepare(
  'select id, email, password_hash from admin_users where email = ?',
);

authRouter.post('/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  const admin = row(byEmail, email);
  // One message and one code for "no such account" and "wrong password":
  // telling them apart tells an attacker which emails are real.
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    res.status(401).json({ error: 'Wrong email or password.' });
    return;
  }

  const { token, expires } = createSession(admin.id);
  setSessionCookie(res, token, expires);
  res.json({ id: admin.id, email: admin.email });
});

authRouter.post('/logout', (req, res) => {
  destroySession(readCookie(req));
  clearSessionCookie(res);
  res.status(204).end();
});

/**
 * Who am I, if anyone? Called once on load to decide whether to render the
 * admin nav.
 *
 * Answers 200 with `{ admin: null }` when nobody is signed in, rather than 401.
 * Being signed out is not a failed request — it is the answer to the question,
 * and the only one this route is asked. Returning 401 made every anonymous page
 * load log `Failed to load resource` in the browser console, which buries a
 * real error among expected ones.
 *
 * This grants nothing. It is the only route that answers an anonymous caller
 * with 200, it discloses only whether *that caller's own* cookie is valid, and
 * every route that touches data still sits behind `requireAdmin` and still
 * answers 401. Compare `/api/admin/*`, which is where authorisation actually
 * lives.
 */
authRouter.get('/me', (req, res) => {
  res.json({ admin: adminForToken(readCookie(req)) });
});

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { row, run, uuid } from './db.js';

const SESSION_DAYS = 14;

/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * scrypt is deliberately slow and memory-hard, which is what you want for
 * passwords. Using the built-in avoids a native bcrypt dependency — this
 * project installs nothing that needs a compiler.
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, key] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  // Constant-time: a plain === leaks how much of the hash matched.
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

export async function createAdmin(email, password) {
  const id = uuid();
  await run(
    'insert into admin_users (id, email, password_hash) values (?, ?, ?)',
    id,
    email.trim().toLowerCase(),
    hashPassword(password),
  );
  return id;
}

export async function createSession(adminId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await run(
    'insert into sessions (token, admin_id, expires_at) values (?, ?, ?)',
    token,
    adminId,
    expires,
  );
  return { token, expires };
}

export async function adminForToken(token) {
  if (!token) return null;
  const found = await row(
    `select a.id, a.email, s.expires_at
       from sessions s join admin_users a on a.id = s.admin_id
      where s.token = ?`,
    token,
  );
  if (!found) return null;
  if (new Date(found.expires_at) < new Date()) {
    await run('delete from sessions where token = ?', token);
    return null;
  }
  return { id: found.id, email: found.email };
}

export async function destroySession(token) {
  if (token) await run('delete from sessions where token = ?', token);
}

const COOKIE = 'attendance_session';

export function readCookie(req) {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * `secure` is set whenever the app is served over HTTPS, which on Vercel it
 * always is. Locally it must stay off: a `Secure` cookie is discarded by the
 * browser over plain http, which would make sign-in silently fail on the LAN.
 */
const secureCookies = process.env.VERCEL === '1' || process.env.SECURE_COOKIES === '1';

export function setSessionCookie(res, token, expires) {
  // httpOnly so page scripts cannot read it; sameSite=Lax so it rides along on
  // normal navigation but not on cross-site form posts.
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax;` +
      `${secureCookies ? ' Secure;' : ''} Expires=${new Date(expires).toUTCString()}`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${secureCookies ? ' Secure;' : ''} Max-Age=0`,
  );
}

/** Attaches `req.admin`, or 401s. The single gate on every admin route. */
export async function requireAdmin(req, res, next) {
  try {
    const admin = await adminForToken(readCookie(req));
    if (!admin) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

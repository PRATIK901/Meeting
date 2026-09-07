import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { db, uuid } from './db.js';

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

export function createAdmin(email, password) {
  const id = uuid();
  db.prepare(
    'insert into admin_users (id, email, password_hash) values (?, ?, ?)',
  ).run(id, email.trim().toLowerCase(), hashPassword(password));
  return id;
}

export function createSession(adminId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare(
    'insert into sessions (token, admin_id, expires_at) values (?, ?, ?)',
  ).run(token, adminId, expires);
  return { token, expires };
}

export function adminForToken(token) {
  if (!token) return null;
  const found = db
    .prepare(
      `select a.id, a.email, s.expires_at
         from sessions s join admin_users a on a.id = s.admin_id
        where s.token = ?`,
    )
    .get(token);
  if (!found) return null;
  if (new Date(found.expires_at) < new Date()) {
    db.prepare('delete from sessions where token = ?').run(token);
    return null;
  }
  return { id: found.id, email: found.email };
}

export function destroySession(token) {
  if (token) db.prepare('delete from sessions where token = ?').run(token);
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

export function setSessionCookie(res, token, expires) {
  // httpOnly so page scripts cannot read it; sameSite=Lax so it rides along on
  // normal navigation but not on cross-site form posts. Not `secure`, because
  // this runs over plain http on an office LAN with no certificate.
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

/** Attaches `req.admin`, or 401s. The single gate on every admin route. */
export function requireAdmin(req, res, next) {
  const admin = adminForToken(readCookie(req));
  if (!admin) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  req.admin = admin;
  next();
}

import { useState } from 'react';

import { describeError } from '../lib/errors';
import { useSession } from '../hooks/useSession';

/**
 * Admin sign-in.
 *
 * Only the admin screens need this — the QR codes and the attendance form stay
 * public, because a person scanning a code in a corridor cannot be expected to
 * hold an account. What sign-in unlocks is *reading* the log, which is exactly
 * the boundary the server draws.
 *
 * Accounts are local: they live in `admin_users` on this machine and are
 * created with `npm run admin -- <email> <password>`.
 */
export function SignInPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      // No navigation on success: the session change propagates through
      // `useSession`, and the guard swaps this page for the dashboard.
      await signIn(email.trim(), password);
    } catch (signInError) {
      setError(signInError);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in</h1>
      <p className="mt-1 text-sm text-slate-600">
        The attendance log is readable only by a signed-in administrator.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />
        </div>

        {error != null && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {describeError(error)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

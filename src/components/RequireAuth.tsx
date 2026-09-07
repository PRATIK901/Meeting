import type { ReactNode } from 'react';

import { SignInPage } from '../pages/SignInPage';
import { Spinner } from './Spinner';
import { useSession } from '../hooks/useSession';

/**
 * Gate for the admin screens.
 *
 * There used to be two questions here — is there a session, and is that session
 * an administrator — because Supabase Auth would sign in anyone with an
 * account. Locally there is only one kind of account: a row in `admin_users`,
 * created from the terminal. Holding a session *is* being an administrator.
 *
 * This component only decides what to render. The enforcement is `requireAdmin`
 * on the server, which re-checks the cookie on every single request, so nothing
 * here can be bypassed by editing the client.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { admin, loading } = useSession();

  if (loading) return <Spinner />;
  if (!admin) return <SignInPage />;
  return <>{children}</>;
}

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '../lib/api';
import type { AdminUser } from '../types/database';

/**
 * Who is signed in, shared across the app.
 *
 * The session itself is an httpOnly cookie the browser cannot read, so "am I
 * signed in?" is a question only the server can answer — `GET /api/auth/me`,
 * asked once on load. That is also what makes it worth putting in a context:
 * the header and the route guard both need the answer, and neither should
 * trigger its own request for it.
 *
 * `loading` is true only until the first answer arrives. Rendering the sign-in
 * page during that moment would flash a login form at an admin who is already
 * authenticated.
 */

interface SessionValue {
  admin: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<{ admin: AdminUser | null }>('/auth/me')
      // `{ admin: null }` is the ordinary signed-out answer, not a failure.
      // The catch is for a genuinely unreachable server, which should leave the
      // app signed out rather than stuck on a spinner.
      .catch(() => ({ admin: null }))
      .then(({ admin: found }) => {
        if (!active) return;
        setAdmin(found);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Errors propagate: the sign-in form is what shows them.
    setAdmin(await api.post<AdminUser>('/auth/login', { email, password }));
  }, []);

  const signOut = useCallback(async () => {
    await api.post<void>('/auth/logout');
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, loading, signIn, signOut }),
    [admin, loading, signIn, signOut],
  );

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

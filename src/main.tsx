import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionProvider } from './hooks/useSession';
import { ToastProvider } from './components/Toast';

import './index.css';

/**
 * A plain synchronous mount.
 *
 * This used to import the app lazily inside a try/catch, because the Supabase
 * client was built at module scope from environment variables and threw when
 * they were missing — so a fresh clone needed a setup screen instead of a blank
 * page. There is nothing left to configure, so there is nothing left to catch.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
);

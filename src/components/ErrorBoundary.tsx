import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Last resort for a render-time crash.
 *
 * Without this a thrown error unmounts the whole tree and leaves a white page
 * — the worst possible outcome for someone standing in a corridor trying to
 * check in. Data-fetch failures are handled by `ErrorState` much closer to
 * where they happen; this only catches the unexpected.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The page failed to load. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Reload
        </button>
      </div>
    );
  }
}

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ToastContext } from '../hooks/useToast';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

/**
 * Transient success/error notifications.
 *
 * Deliberately tiny — a queue, a timer and a fixed corner. Anything an admin
 * must act on belongs in an inline error next to the control that failed; this
 * is only for "that worked", which otherwise leaves a destructive action
 * looking like it did nothing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'success') => {
      const id = Date.now() + Math.random();
      setMessages((prev) => [...prev, { id, text, tone }]);
      setTimeout(
        () => setMessages((prev) => prev.filter((m) => m.id !== id)),
        4000,
      );
    },
    [],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // `aria-live` so a screen reader announces the confirmation; pointer
        // events off so the stack never blocks a click underneath.
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={[
              'pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg',
              message.tone === 'success'
                ? 'bg-slate-900 text-white'
                : 'bg-red-600 text-white',
            ].join(' ')}
          >
            {message.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

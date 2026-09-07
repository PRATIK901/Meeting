import { createContext, useContext } from 'react';

export interface ToastApi {
  notify: (text: string, tone?: 'success' | 'error') => void;
}

/** Split from `Toast.tsx` so that file exports only a component (fast refresh). */
export const ToastContext = createContext<ToastApi>({ notify: () => {} });

/** Fire a short confirmation: `notify('Meeting saved.')`. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

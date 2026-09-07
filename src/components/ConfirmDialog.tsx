import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  /** Destructive actions get the red treatment. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A confirmation dialog for destructive actions.
 *
 * Uses the native `<dialog>` element rather than a hand-rolled overlay: it
 * gives focus trapping, Escape-to-close and the top layer for free, which a
 * div-with-a-backdrop has to reimplement badly.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Escape fires `cancel`; let the parent unmount us rather than leaving
        // a closed dialog in the tree.
        event.preventDefault();
        onCancel();
      }}
      className="max-w-sm rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-semibold text-white',
              destructive
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-slate-900 hover:bg-slate-700',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

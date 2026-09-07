import { useEffect, useState } from 'react';

interface CopyButtonProps {
  value: string;
  label?: string;
}

/** Copy a short string to the clipboard, with a two-second confirmation. */
export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is denied outside a secure context; the URL is
      // visible next to this button, so there is nothing to recover from.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * Typed access to the one environment variable the frontend still has.
 *
 * There used to be two required ones — a Supabase URL and an anon key — and
 * importing this module threw without them, which is why `main.tsx` rendered a
 * setup screen. There is nothing to configure now: the data lives in a file on
 * this machine and the app talks to `/api` on its own origin. A fresh clone
 * runs with no setup at all.
 */

function read(): { publicSiteUrl: string } {
  // Optional. Only needed when the URL baked into a QR code must differ from
  // the origin the page is served on — printing production posters from a
  // laptop running `npm run dev`, for instance. Trailing slash trimmed so
  // callers can concatenate a path without doubling it.
  const publicSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ?? '').replace(
    /\/$/,
    '',
  );

  return { publicSiteUrl };
}

export const env = read();

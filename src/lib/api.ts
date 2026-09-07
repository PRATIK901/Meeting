/**
 * The one way the app talks to its data.
 *
 * This replaces the Supabase client. Everything goes to `/api` on the same
 * origin — same-origin means the session cookie rides along on its own, there
 * is no key to configure and none to leak, and the app works on a machine with
 * no internet connection at all.
 *
 * The server has already turned every failure into a sentence meant for a
 * person (see `server/errors.js`), so there is nothing to translate here: a
 * failed request throws an `ApiError` whose `message` is what the UI shows.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Drops empty values, so `?meetingCode=&from=` never reaches the server. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

/**
 * Shown whenever nothing answered. In development the API is a second process
 * (`npm run server`) that Vite proxies to, so this is the message you get when
 * only `npm run dev` is running.
 */
const UNREACHABLE =
  'Cannot reach the attendance server. Is it running? Start it with `npm run server`.';

/** Every error this server sends is `{ error: "<sentence for a person>" }`. */
function isApiPayload(payload: unknown): payload is { error: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === 'string'
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      // The session cookie is httpOnly; `same-origin` is what sends it.
      credentials: 'same-origin',
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // fetch only rejects when the request never got an answer at all, which is
    // what a dead server looks like in production, where one process serves
    // both the app and the API.
    throw new ApiError(0, UNREACHABLE);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // A gateway code with a body that is not ours means nothing answered
    // *behind* whatever did. In development that is the Vite proxy reporting
    // it cannot reach `npm run server` — and because the proxy replies with a
    // real 502, the fetch above succeeds and the branch there never runs. Say
    // the same thing here, or a stopped backend reads as an unknown bug.
    if (response.status >= 502 && response.status <= 504 && !isApiPayload(payload)) {
      throw new ApiError(response.status, UNREACHABLE);
    }

    throw new ApiError(
      response.status,
      isApiPayload(payload) ? payload.error : 'Something went wrong.',
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

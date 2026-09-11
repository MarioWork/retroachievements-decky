/**
 * Mirrors the Python `Result` envelope in `py_modules/ra/result.py`.
 *
 * Errors cross the RPC boundary as data rather than as a rejected promise, so
 * every view can branch on `kind` and show something specific instead of a
 * blank panel.
 */

export type AppErrorKind =
  "config" | "auth" | "notFound" | "rateLimit" | "network" | "parse" | "unexpected";

export interface AppError {
  readonly kind: AppErrorKind;
  readonly message: string;
}

export type Result<T> =
  | {
      readonly ok: true;
      readonly data: T;
      /** Age in seconds when served from expired cache after the network
       * failed; null on a live response. */
      readonly staleSeconds: number | null;
      /** Set when only part of a paged collection could be fetched: the count
       * that actually exists, so the UI can say what is missing. */
      readonly partialTotal: number | null;
    }
  | { readonly ok: false; readonly error: AppError };

export const ok = <T>(
  data: T,
  staleSeconds: number | null = null,
  partialTotal: number | null = null,
): Result<T> => ({
  ok: true,
  data,
  staleSeconds,
  partialTotal,
});

/** "12m ago" / "3h ago" / "2d ago" -- short enough for a one-line banner. */
export function formatAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  return `${String(Math.floor(hours / 24))}d ago`;
}

export const fail = <T = never>(error: AppError): Result<T> => ({ ok: false, error });

export const appError = (kind: AppErrorKind, message: string): AppError => ({ kind, message });

/** Appends the backend's own wording when it says more than the headline does. */
function withDetail(headline: string, detail: string): string {
  const trimmed = detail.trim();
  return trimmed && trimmed !== headline ? `${headline} (${trimmed})` : headline;
}

/** Wording the user sees. The backend's message is a fallback, not the headline. */
export function describeError(error: AppError): string {
  switch (error.kind) {
    case "config":
      return "No RetroAchievements account configured yet.";
    case "auth":
      // The likeliest cause by far: RA lets you regenerate keys, and doing so
      // silently invalidates the one saved here.
      return "RetroAchievements rejected your API key. If you regenerated it, enter the new one.";
    case "notFound":
      return "RetroAchievements has no data for that.";
    case "rateLimit":
      return "RetroAchievements is rate limiting us. Try again shortly.";
    case "network":
      // The backend distinguishes a timeout from a DNS failure from a TLS trust
      // problem from an RA outage, and a bare "check your connection" throws all
      // of that away -- leaving the Deck's logs as the only way to tell them
      // apart. Keep the headline, append what actually happened.
      return withDetail("Could not reach RetroAchievements. Check your connection.", error.message);
    case "parse":
      return "RetroAchievements sent something unexpected.";
    case "unexpected":
      return error.message || "Something went wrong.";
  }
}

/** Auth and config failures mean the stored credentials can no longer be used. */
export const isCredentialProblem = (error: AppError): boolean =>
  error.kind === "auth" || error.kind === "config";

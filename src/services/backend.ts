/**
 * The only module that talks to the Python backend.
 *
 * Each route returns the `{ok, data|error}` envelope defined in
 * `py_modules/ra/result.py`. `invoke` unwraps it into a `Result<T>` and runs the
 * payload through a parser, so nothing downstream ever handles `unknown`.
 */

import { callable } from "@decky/api";

import type { Credentials, GameProgress, Profile, Rank, RecentAchievement } from "../types/ra";
import type { GameSummary } from "../types/ra";
import { appError, fail, ok, type AppError, type Result } from "../types/result";
import { clearInFlight, dedupe } from "./dedupe";
import {
  isRecord,
  parseCredentials,
  parseGameProgress,
  parseMyGames,
  parseProfile,
  parseRank,
  parseRecentAchievements,
  parseRecentlyPlayed,
  str,
  type MyGamesPage,
} from "./parsers";

const rpc = <Args extends unknown[]>(route: string) => callable<Args, unknown>(route);

const routes = {
  getSettings: rpc<[]>("get_settings"),
  saveSettings: rpc<[username: string, apiKey: string]>("save_settings"),
  clearSettings: rpc<[]>("clear_settings"),
  setNotifyUnlocks: rpc<[enabled: boolean]>("set_notify_unlocks"),
  getProfile: rpc<[force: boolean]>("get_profile"),
  getUserSummary: rpc<[force: boolean]>("get_user_summary"),
  getRecentAchievements: rpc<[minutes: number, force: boolean]>("get_recent_achievements"),
  getRecentlyPlayed: rpc<[count: number, offset: number, force: boolean]>("get_recently_played"),
  getMyGames: rpc<[force: boolean]>("get_my_games"),
  getGameProgress: rpc<[gameId: number, force: boolean]>("get_game_progress"),
} as const;

const ERROR_KINDS = new Set([
  "config",
  "auth",
  "notFound",
  "rateLimit",
  "network",
  "parse",
  "unexpected",
]);

function parseAppError(raw: unknown): AppError {
  if (!isRecord(raw)) return appError("unexpected", "The backend returned an unreadable error.");
  const kind = str(raw.kind);
  const message = str(raw.message);
  return ERROR_KINDS.has(kind)
    ? appError(kind as AppError["kind"], message)
    : appError("unexpected", message || "The backend returned an unknown error.");
}

/** The backend sends null when the field does not apply. */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Unwraps the envelope. A malformed envelope is itself a parse failure. */
function unwrap(raw: unknown): Result<unknown> {
  if (!isRecord(raw)) {
    return fail(appError("parse", "The backend returned an unexpected value."));
  }
  if (raw.ok === true)
    return ok(raw.data, numberOrNull(raw.stale_seconds), numberOrNull(raw.partial_total));
  if (raw.ok === false) return fail(parseAppError(raw.error));
  return fail(appError("parse", "The backend returned a malformed response."));
}

async function invoke<T>(
  call: () => Promise<unknown>,
  parse: (raw: unknown) => T,
): Promise<Result<T>> {
  let raw: unknown;
  try {
    raw = await call();
  } catch (cause) {
    // A rejected RPC means the backend process is gone or the socket broke --
    // never a RetroAchievements problem.
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(appError("unexpected", `Could not reach the plugin backend: ${detail}`));
  }

  const envelope = unwrap(raw);
  if (!envelope.ok) return envelope;

  try {
    return ok(parse(envelope.data), envelope.staleSeconds, envelope.partialTotal);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(appError("parse", `Could not read the RetroAchievements response: ${detail}`));
  }
}

/** Reads are de-duplicated; mutations never are. */
const read = <T>(key: string, call: () => Promise<unknown>, parse: (raw: unknown) => T) =>
  dedupe(key, () => invoke(call, parse));

// ------------------------------------------------------------------ mutations

export const getCredentials = (): Promise<Result<Credentials>> =>
  read("credentials", () => routes.getSettings(), parseCredentials);

export async function saveCredentials(
  username: string,
  apiKey: string,
): Promise<Result<Credentials>> {
  const result = await invoke(() => routes.saveSettings(username, apiKey), parseCredentials);
  clearInFlight();
  return result;
}

export async function setNotifyUnlocks(enabled: boolean): Promise<Result<Credentials>> {
  const result = await invoke(() => routes.setNotifyUnlocks(enabled), parseCredentials);
  clearInFlight();
  return result;
}

export async function clearCredentials(): Promise<Result<Credentials>> {
  const result = await invoke(() => routes.clearSettings(), parseCredentials);
  clearInFlight();
  return result;
}

// ---------------------------------------------------------------------- reads

export const getProfile = (force = false): Promise<Result<Profile>> =>
  read(`profile:${String(force)}`, () => routes.getProfile(force), parseProfile);

export const getRank = (force = false): Promise<Result<Rank>> =>
  read(`rank:${String(force)}`, () => routes.getUserSummary(force), parseRank);

export const getRecentAchievements = (
  minutes: number,
  force = false,
): Promise<Result<readonly RecentAchievement[]>> =>
  read(
    `recent:${String(minutes)}:${String(force)}`,
    () => routes.getRecentAchievements(minutes, force),
    parseRecentAchievements,
  );

export const getRecentlyPlayed = (
  count: number,
  force = false,
): Promise<Result<readonly GameSummary[]>> =>
  read(
    `played:${String(count)}:${String(force)}`,
    () => routes.getRecentlyPlayed(count, 0, force),
    parseRecentlyPlayed,
  );

/** The backend follows RA's paging internally and returns the whole library. */
export const getMyGames = (force = false): Promise<Result<MyGamesPage>> =>
  read(`mygames:${String(force)}`, () => routes.getMyGames(force), parseMyGames);

export const getGameProgress = (gameId: number, force = false): Promise<Result<GameProgress>> =>
  read(
    `game:${String(gameId)}:${String(force)}`,
    () => routes.getGameProgress(gameId, force),
    parseGameProgress,
  );

/**
 * `unknown` in, domain types out.
 *
 * Everything arriving over the RPC boundary is untrusted at the type level, so
 * it enters as `unknown` and leaves here as one of the types in `types/ra.ts`.
 * Hand-written rather than zod: this ships inside Steam's process, and we
 * control every shape consumed.
 *
 * RA's PHP API is inconsistent about types -- the same field can be 34 or "34",
 * and casing differs per endpoint -- which is what num() and pick() absorb.
 */

import type {
  Achievement,
  AwardKind,
  Credentials,
  GameProgress,
  GameSummary,
  Profile,
  Rank,
  RecentAchievement,
} from "../types/ra";
import { DEFAULT_SORT_MODE, sortAchievements } from "./sortAchievements";

type UnknownRecord = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads the first key that is present, so one parser handles both casings. */
function pick(source: UnknownRecord, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

export function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function numOrNull(value: unknown): number | null {
  const parsed = num(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

const array = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** RA returns some collections as an object keyed by id instead of an array. */
const values = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
};

// ---------------------------------------------------------------- credentials

export function parseCredentials(raw: unknown): Credentials {
  const source = isRecord(raw) ? raw : {};
  return {
    username: str(pick(source, "username", "User")),
    hasKey: bool(pick(source, "has_key", "hasKey")),
    notifyUnlocks: bool(pick(source, "notify_unlocks", "notifyUnlocks")),
  };
}

// -------------------------------------------------------------------- profile

export function parseProfile(raw: unknown): Profile {
  const source = isRecord(raw) ? raw : {};
  return {
    username: str(pick(source, "User", "user")),
    avatarPath: str(pick(source, "UserPic", "userPic")),
    totalPoints: num(pick(source, "TotalPoints", "totalPoints")),
    totalTruePoints: num(pick(source, "TotalTruePoints", "totalTruePoints")),
    memberSince: str(pick(source, "MemberSince", "memberSince")),
    motto: str(pick(source, "Motto", "motto")),
  };
}

export function parseRank(raw: unknown): Rank {
  const source = isRecord(raw) ? raw : {};
  return {
    rank: numOrNull(pick(source, "Rank", "rank")),
    totalRanked: numOrNull(pick(source, "TotalRanked", "totalRanked")),
  };
}

// ------------------------------------------------------------------- unlocks

function parseRecentAchievement(raw: unknown): RecentAchievement | null {
  if (!isRecord(raw)) return null;
  const id = num(pick(raw, "AchievementID", "achievementId"), -1);
  if (id < 0) return null;

  return {
    id,
    title: str(pick(raw, "Title", "title")),
    description: str(pick(raw, "Description", "description")),
    points: num(pick(raw, "Points", "points")),
    badgeName: str(pick(raw, "BadgeName", "badgeName")),
    gameId: num(pick(raw, "GameID", "gameId")),
    gameTitle: str(pick(raw, "GameTitle", "gameTitle")),
    consoleName: str(pick(raw, "ConsoleName", "consoleName")),
    hardcore: bool(pick(raw, "HardcoreMode", "hardcoreMode")),
    unlockedAt: str(pick(raw, "Date", "date")),
  };
}

export function parseRecentAchievements(raw: unknown): readonly RecentAchievement[] {
  return array(raw)
    .map(parseRecentAchievement)
    .filter((entry): entry is RecentAchievement => entry !== null);
}

const AWARD_KINDS: readonly AwardKind[] = [
  "beaten-softcore",
  "beaten-hardcore",
  "completed",
  "mastered",
];

function parseAward(value: unknown): AwardKind {
  const raw = str(value);
  return AWARD_KINDS.find((kind) => kind === raw) ?? "";
}

// --------------------------------------------------------------------- games

function parseRecentlyPlayedGame(raw: unknown): GameSummary | null {
  if (!isRecord(raw)) return null;
  const gameId = num(pick(raw, "GameID", "gameId"), -1);
  if (gameId < 0) return null;

  return {
    gameId,
    title: str(pick(raw, "Title", "title")),
    consoleName: str(pick(raw, "ConsoleName", "consoleName")),
    iconPath: str(pick(raw, "ImageIcon", "imageIcon")),
    numAwarded: num(pick(raw, "NumAchieved", "numAchieved")),
    maxPossible: num(pick(raw, "NumPossibleAchievements", "numPossibleAchievements")),
    lastPlayed: str(pick(raw, "LastPlayed", "lastPlayed")),
    highestAward: parseAward(pick(raw, "HighestAwardKind", "highestAwardKind")),
  };
}

export function parseRecentlyPlayed(raw: unknown): readonly GameSummary[] {
  return array(raw)
    .map(parseRecentlyPlayedGame)
    .filter((entry): entry is GameSummary => entry !== null);
}

function parseCompletionEntry(raw: unknown): GameSummary | null {
  if (!isRecord(raw)) return null;
  const gameId = num(pick(raw, "GameID", "gameId"), -1);
  if (gameId < 0) return null;

  return {
    gameId,
    title: str(pick(raw, "Title", "title")),
    consoleName: str(pick(raw, "ConsoleName", "consoleName")),
    iconPath: str(pick(raw, "ImageIcon", "imageIcon")),
    numAwarded: num(pick(raw, "NumAwarded", "numAwarded")),
    maxPossible: num(pick(raw, "MaxPossible", "maxPossible")),
    lastPlayed: str(pick(raw, "MostRecentAwardedDate", "mostRecentAwardedDate")),
    highestAward: parseAward(pick(raw, "HighestAwardKind", "highestAwardKind")),
  };
}

export interface MyGamesPage {
  readonly total: number;
  readonly games: readonly GameSummary[];
}

export function parseMyGames(raw: unknown): MyGamesPage {
  const source = isRecord(raw) ? raw : {};
  const games = array(pick(source, "Results", "results"))
    .map(parseCompletionEntry)
    .filter((entry): entry is GameSummary => entry !== null);

  return { total: num(pick(source, "Total", "total"), games.length), games };
}

// ------------------------------------------------------------- game progress

function parseAchievement(raw: unknown): Achievement | null {
  if (!isRecord(raw)) return null;
  const id = num(pick(raw, "ID", "id"), -1);
  if (id < 0) return null;

  // Presence of a date -- not a boolean flag -- is how RA reports an unlock.
  const unlockedAt = str(pick(raw, "DateEarned", "dateEarned"));
  const unlockedAtHardcore = str(pick(raw, "DateEarnedHardcore", "dateEarnedHardcore"));

  return {
    id,
    title: str(pick(raw, "Title", "title")),
    description: str(pick(raw, "Description", "description")),
    points: num(pick(raw, "Points", "points")),
    badgeName: str(pick(raw, "BadgeName", "badgeName")),
    displayOrder: num(pick(raw, "DisplayOrder", "displayOrder")),
    unlocked: unlockedAt !== "" || unlockedAtHardcore !== "",
    unlockedHardcore: unlockedAtHardcore !== "",
    unlockedAt: unlockedAtHardcore || unlockedAt,
  };
}

export function parseGameProgress(raw: unknown): GameProgress {
  const source = isRecord(raw) ? raw : {};

  const parsed = values(pick(source, "Achievements", "achievements"))
    .map(parseAchievement)
    .filter((entry): entry is Achievement => entry !== null);

  // The view can re-sort; this is only the order it starts in.
  const achievements = sortAchievements(parsed, DEFAULT_SORT_MODE);

  return {
    gameId: num(pick(source, "ID", "id")),
    title: str(pick(source, "Title", "title")),
    consoleName: str(pick(source, "ConsoleName", "consoleName")),
    iconPath: str(pick(source, "ImageIcon", "imageIcon")),
    numAwarded: num(pick(source, "NumAwardedToUser", "numAwardedToUser")),
    numAwardedHardcore: num(pick(source, "NumAwardedToUserHardcore", "numAwardedToUserHardcore")),
    total: num(pick(source, "NumAchievements", "numAchievements"), achievements.length),
    achievements,
  };
}

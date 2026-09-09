/**
 * The plugin's own domain types.
 *
 * Deliberately not the raw RetroAchievements payloads: those mix casing
 * conventions, return numbers as strings, and key achievements by id in an
 * object. `services/parsers.ts` flattens all of that here so components only
 * ever see one shape.
 */

export interface Profile {
  readonly username: string;
  readonly avatarPath: string;
  readonly totalPoints: number;
  readonly totalTruePoints: number;
  readonly memberSince: string;
  readonly motto: string;
}

export interface Rank {
  /** null when RA does not rank the account (e.g. untracked users). */
  readonly rank: number | null;
  readonly totalRanked: number | null;
}

export interface RecentAchievement {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly points: number;
  readonly badgeName: string;
  readonly gameId: number;
  readonly gameTitle: string;
  readonly consoleName: string;
  readonly hardcore: boolean;
  readonly unlockedAt: string;
}

/**
 * RA's highest award for a game. "" when the user has earned none.
 * mastered = 100% in hardcore; completed = 100% softcore.
 */
export type AwardKind = "" | "beaten-softcore" | "beaten-hardcore" | "completed" | "mastered";

export interface GameSummary {
  readonly gameId: number;
  readonly title: string;
  readonly consoleName: string;
  readonly iconPath: string;
  readonly numAwarded: number;
  readonly maxPossible: number;
  readonly lastPlayed: string;
  readonly highestAward: AwardKind;
}

export interface Achievement {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly points: number;
  readonly badgeName: string;
  readonly displayOrder: number;
  /** The whole point of the game view: set iff this user has earned it. */
  readonly unlocked: boolean;
  readonly unlockedHardcore: boolean;
  readonly unlockedAt: string;
}

export interface GameProgress {
  readonly gameId: number;
  readonly title: string;
  readonly consoleName: string;
  readonly iconPath: string;
  readonly numAwarded: number;
  readonly numAwardedHardcore: number;
  readonly total: number;
  /** Unlocked first, then by RA's display order. */
  readonly achievements: readonly Achievement[];
}

export interface Credentials {
  readonly username: string;
  readonly hasKey: boolean;
  readonly notifyUnlocks: boolean;
}

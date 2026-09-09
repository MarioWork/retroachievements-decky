/**
 * Ordering for a game's achievement list.
 *
 * Kept out of the components so the comparators are testable on their own, and
 * out of the parser so the parser has one job. `parseGameProgress` applies
 * DEFAULT_SORT_MODE through this same module, so the list has one ordering
 * implementation rather than two that can drift.
 */

import type { Achievement } from "../types/ra";

export type SortMode = "unlockedFirst" | "lockedFirst" | "recentFirst";

export const DEFAULT_SORT_MODE: SortMode = "unlockedFirst";

export const SORT_MODES: readonly { readonly mode: SortMode; readonly label: string }[] = [
  { mode: "unlockedFirst", label: "Unlocked first" },
  { mode: "lockedFirst", label: "Locked first" },
  { mode: "recentFirst", label: "Recently unlocked" },
];

export function isSortMode(value: unknown): value is SortMode {
  return SORT_MODES.some((entry) => entry.mode === value);
}

export function sortModeLabel(mode: SortMode): string {
  return SORT_MODES.find((entry) => entry.mode === mode)?.label ?? "";
}

/**
 * RA sends "2026-03-14 21:05:11" on this endpoint. Returns NaN for anything
 * unparseable so callers can decide where undated entries belong, rather than
 * silently treating them as the epoch.
 */
function unlockedTime(achievement: Achievement): number {
  if (achievement.unlockedAt === "") return Number.NaN;
  return new Date(achievement.unlockedAt.replace(" ", "T")).getTime();
}

/** Stable tiebreak so equal entries never shuffle between renders. */
function byDisplayOrder(a: Achievement, b: Achievement): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  return a.id - b.id;
}

function unlockedFirst(a: Achievement, b: Achievement): number {
  if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
  return byDisplayOrder(a, b);
}

function lockedFirst(a: Achievement, b: Achievement): number {
  if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
  return byDisplayOrder(a, b);
}

function recentFirst(a: Achievement, b: Achievement): number {
  // Locked achievements have no date at all, so they sink below every unlock
  // instead of clustering at whichever end a numeric fallback would put them.
  if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;

  const timeA = unlockedTime(a);
  const timeB = unlockedTime(b);
  const hasA = !Number.isNaN(timeA);
  const hasB = !Number.isNaN(timeB);

  if (hasA && hasB && timeA !== timeB) return timeB - timeA;
  if (hasA !== hasB) return hasA ? -1 : 1;
  return byDisplayOrder(a, b);
}

const COMPARATORS: Record<SortMode, (a: Achievement, b: Achievement) => number> = {
  unlockedFirst,
  lockedFirst,
  recentFirst,
};

/** Returns a new array; never mutates the input. */
export function sortAchievements(
  achievements: readonly Achievement[],
  mode: SortMode,
): readonly Achievement[] {
  return [...achievements].sort(COMPARATORS[mode]);
}

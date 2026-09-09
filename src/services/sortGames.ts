/**
 * Ordering for the "My games" list.
 *
 * "Closest to completion" is the point of this module: with a large library the
 * useful question is not what you played last, it is what you could finish
 * tonight. It costs no extra API calls -- NumAwarded and MaxPossible are already
 * in the completion-progress payload.
 */

import type { GameSummary } from "../types/ra";

export type GameSortMode = "recent" | "closest" | "completion" | "title";

export const DEFAULT_GAME_SORT: GameSortMode = "recent";

export const GAME_SORT_MODES: readonly {
  readonly mode: GameSortMode;
  readonly label: string;
}[] = [
  { mode: "recent", label: "Recently played" },
  { mode: "closest", label: "Closest to finish" },
  { mode: "completion", label: "Most complete" },
  { mode: "title", label: "Title (A-Z)" },
];

export function isGameSortMode(value: unknown): value is GameSortMode {
  return GAME_SORT_MODES.some((entry) => entry.mode === value);
}

export function gameSortLabel(mode: GameSortMode): string {
  return GAME_SORT_MODES.find((entry) => entry.mode === mode)?.label ?? "";
}

export const remaining = (game: GameSummary): number =>
  Math.max(0, game.maxPossible - game.numAwarded);

export const isComplete = (game: GameSummary): boolean =>
  game.maxPossible > 0 && game.numAwarded >= game.maxPossible;

export function completionRatio(game: GameSummary): number {
  if (game.maxPossible <= 0) return 0;
  return game.numAwarded / game.maxPossible;
}

const byTitle = (a: GameSummary, b: GameSummary): number =>
  a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || a.gameId - b.gameId;

function closestToFinish(a: GameSummary, b: GameSummary): number {
  // Finished games sink: "1 left" is actionable, "0 left" is not.
  const doneA = isComplete(a);
  const doneB = isComplete(b);
  if (doneA !== doneB) return doneA ? 1 : -1;

  // Games with no achievements at all are noise here, not "0 remaining".
  const startedA = a.maxPossible > 0;
  const startedB = b.maxPossible > 0;
  if (startedA !== startedB) return startedA ? -1 : 1;

  const diff = remaining(a) - remaining(b);
  if (diff !== 0) return diff;

  // Same number left: prefer the one that is further along proportionally.
  const ratio = completionRatio(b) - completionRatio(a);
  if (ratio !== 0) return ratio;
  return byTitle(a, b);
}

function mostComplete(a: GameSummary, b: GameSummary): number {
  const ratio = completionRatio(b) - completionRatio(a);
  if (ratio !== 0) return ratio;
  return byTitle(a, b);
}

const COMPARATORS: Record<GameSortMode, ((a: GameSummary, b: GameSummary) => number) | null> = {
  // RA already returns these most-recent-first; re-sorting would lose that.
  recent: null,
  closest: closestToFinish,
  completion: mostComplete,
  title: byTitle,
};

/** Returns a new array; never mutates the input. */
export function sortGames(
  games: readonly GameSummary[],
  mode: GameSortMode,
): readonly GameSummary[] {
  const comparator = COMPARATORS[mode];
  return comparator === null ? games : [...games].sort(comparator);
}

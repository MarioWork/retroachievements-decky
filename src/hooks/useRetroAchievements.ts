/**
 * One thin hook per resource. Each memoises its loader so `useAsyncResource`
 * re-runs exactly when its inputs change and never on an unrelated re-render.
 */

import { useCallback } from "react";

import {
  getGameProgress,
  getMyGames,
  getProfile,
  getRank,
  getRecentAchievements,
  getRecentlyPlayed,
} from "../services/backend";
import type { MyGamesPage } from "../services/parsers";
import type { GameProgress, GameSummary, Profile, Rank, RecentAchievement } from "../types/ra";
import { useAsyncResource, type AsyncResource } from "./useAsyncResource";

/** How far back the "recent unlocks" feed looks. 30 days keeps it useful for
 * someone who plays a few times a month rather than daily. */
export const RECENT_WINDOW_MINUTES = 60 * 24 * 30;

export const RECENTLY_PLAYED_COUNT = 10;

export function useProfile(): AsyncResource<Profile> {
  return useAsyncResource(useCallback((force: boolean) => getProfile(force), []));
}

export function useRank(): AsyncResource<Rank> {
  return useAsyncResource(useCallback((force: boolean) => getRank(force), []));
}

export function useRecentAchievements(): AsyncResource<readonly RecentAchievement[]> {
  return useAsyncResource(
    useCallback((force: boolean) => getRecentAchievements(RECENT_WINDOW_MINUTES, force), []),
  );
}

export function useRecentlyPlayed(): AsyncResource<readonly GameSummary[]> {
  return useAsyncResource(
    useCallback((force: boolean) => getRecentlyPlayed(RECENTLY_PLAYED_COUNT, force), []),
  );
}

export function useMyGames(): AsyncResource<MyGamesPage> {
  return useAsyncResource(useCallback((force: boolean) => getMyGames(force), []));
}

export function useGameProgress(gameId: number): AsyncResource<GameProgress> {
  return useAsyncResource(
    useCallback((force: boolean) => getGameProgress(gameId, force), [gameId]),
  );
}

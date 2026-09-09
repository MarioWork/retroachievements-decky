import { describe, expect, it } from "vitest";

import type { GameSummary } from "../types/ra";
import {
  completionRatio,
  DEFAULT_GAME_SORT,
  GAME_SORT_MODES,
  gameSortLabel,
  isComplete,
  isGameSortMode,
  remaining,
  sortGames,
} from "./sortGames";

function game(overrides: Partial<GameSummary> & Pick<GameSummary, "gameId">): GameSummary {
  return {
    title: `Game ${String(overrides.gameId)}`,
    consoleName: "Test",
    iconPath: "",
    numAwarded: 0,
    maxPossible: 10,
    lastPlayed: "",
    highestAward: "",
    ...overrides,
  };
}

const ids = (list: readonly GameSummary[]): number[] => list.map((g) => g.gameId);

describe("mode metadata", () => {
  it("labels every mode", () => {
    for (const { mode, label } of GAME_SORT_MODES) {
      expect(gameSortLabel(mode)).toBe(label);
    }
  });

  it("validates modes", () => {
    expect(isGameSortMode("closest")).toBe(true);
    expect(isGameSortMode("nope")).toBe(false);
    expect(isGameSortMode(null)).toBe(false);
  });

  it("defaults to the API's own order", () => {
    expect(DEFAULT_GAME_SORT).toBe("recent");
  });
});

describe("helpers", () => {
  it("computes remaining, never negative", () => {
    expect(remaining(game({ gameId: 1, numAwarded: 3, maxPossible: 10 }))).toBe(7);
    // RA has been known to report more awarded than possible after a set revision.
    expect(remaining(game({ gameId: 1, numAwarded: 12, maxPossible: 10 }))).toBe(0);
  });

  it("treats a game with no achievements as 0% rather than dividing by zero", () => {
    expect(completionRatio(game({ gameId: 1, maxPossible: 0 }))).toBe(0);
    expect(isComplete(game({ gameId: 1, numAwarded: 0, maxPossible: 0 }))).toBe(false);
  });
});

describe("recent", () => {
  it("preserves the order RA returned", () => {
    const list = [game({ gameId: 3 }), game({ gameId: 1 }), game({ gameId: 2 })];
    expect(ids(sortGames(list, "recent"))).toEqual([3, 1, 2]);
  });
});

describe("closest to finish", () => {
  it("puts the fewest-remaining game first", () => {
    const list = [
      game({ gameId: 1, numAwarded: 2, maxPossible: 10 }), // 8 left
      game({ gameId: 2, numAwarded: 9, maxPossible: 10 }), // 1 left
      game({ gameId: 3, numAwarded: 5, maxPossible: 10 }), // 5 left
    ];
    expect(ids(sortGames(list, "closest"))).toEqual([2, 3, 1]);
  });

  it("sinks finished games below unfinished ones", () => {
    // "0 left" is not actionable; the whole point of this sort is what to play next.
    const list = [
      game({ gameId: 1, numAwarded: 10, maxPossible: 10 }),
      game({ gameId: 2, numAwarded: 1, maxPossible: 10 }),
    ];
    expect(ids(sortGames(list, "closest"))).toEqual([2, 1]);
  });

  it("sinks games that have no achievements at all", () => {
    const list = [
      game({ gameId: 1, numAwarded: 0, maxPossible: 0 }),
      game({ gameId: 2, numAwarded: 4, maxPossible: 10 }),
    ];
    expect(ids(sortGames(list, "closest"))).toEqual([2, 1]);
  });

  it("breaks a tie on remaining by proportional progress", () => {
    const list = [
      game({ gameId: 1, numAwarded: 90, maxPossible: 100 }), // 10 left, 90%
      game({ gameId: 2, numAwarded: 10, maxPossible: 20 }), // 10 left, 50%
    ];
    expect(ids(sortGames(list, "closest"))).toEqual([1, 2]);
  });
});

describe("most complete", () => {
  it("orders by percentage, highest first", () => {
    const list = [
      game({ gameId: 1, numAwarded: 1, maxPossible: 10 }),
      game({ gameId: 2, numAwarded: 9, maxPossible: 10 }),
    ];
    expect(ids(sortGames(list, "completion"))).toEqual([2, 1]);
  });
});

describe("title", () => {
  it("sorts case-insensitively", () => {
    const list = [
      game({ gameId: 1, title: "zelda" }),
      game({ gameId: 2, title: "Metroid" }),
      game({ gameId: 3, title: "castlevania" }),
    ];
    expect(ids(sortGames(list, "title"))).toEqual([3, 2, 1]);
  });
});

describe("sortGames", () => {
  it("does not mutate the input", () => {
    const list = [game({ gameId: 2 }), game({ gameId: 1 })];
    const before = ids(list);
    sortGames(list, "title");
    expect(ids(list)).toEqual(before);
  });

  it("handles an empty list in every mode", () => {
    for (const { mode } of GAME_SORT_MODES) {
      expect(sortGames([], mode)).toEqual([]);
    }
  });
});

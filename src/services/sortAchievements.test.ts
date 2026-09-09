import { describe, expect, it } from "vitest";

import type { Achievement } from "../types/ra";
import {
  DEFAULT_SORT_MODE,
  isSortMode,
  SORT_MODES,
  sortAchievements,
  sortModeLabel,
} from "./sortAchievements";

function achievement(overrides: Partial<Achievement> & Pick<Achievement, "id">): Achievement {
  return {
    title: `Achievement ${String(overrides.id)}`,
    description: "",
    points: 10,
    badgeName: "000",
    displayOrder: overrides.id,
    unlocked: false,
    unlockedHardcore: false,
    unlockedAt: "",
    ...overrides,
  };
}

/** 1 and 3 unlocked (3 more recently), 2 and 4 still locked. */
const list: readonly Achievement[] = [
  achievement({ id: 4, displayOrder: 4 }),
  achievement({ id: 3, displayOrder: 3, unlocked: true, unlockedAt: "2026-03-14 21:00:00" }),
  achievement({ id: 2, displayOrder: 2 }),
  achievement({ id: 1, displayOrder: 1, unlocked: true, unlockedAt: "2026-01-05 08:30:00" }),
];

const ids = (sorted: readonly Achievement[]): number[] => sorted.map((a) => a.id);

describe("sort modes", () => {
  it("exposes a label for every mode", () => {
    for (const { mode, label } of SORT_MODES) {
      expect(sortModeLabel(mode)).toBe(label);
      expect(label).not.toBe("");
    }
  });

  it("recognises valid modes and rejects anything else", () => {
    expect(isSortMode("unlockedFirst")).toBe(true);
    expect(isSortMode("recentFirst")).toBe(true);
    expect(isSortMode("nonsense")).toBe(false);
    expect(isSortMode(undefined)).toBe(false);
    expect(isSortMode(3)).toBe(false);
  });

  it("defaults to unlocked first", () => {
    expect(DEFAULT_SORT_MODE).toBe("unlockedFirst");
  });
});

describe("unlockedFirst", () => {
  it("puts unlocked above locked, then follows display order", () => {
    expect(ids(sortAchievements(list, "unlockedFirst"))).toEqual([1, 3, 2, 4]);
  });
});

describe("lockedFirst", () => {
  it("puts locked above unlocked, then follows display order", () => {
    expect(ids(sortAchievements(list, "lockedFirst"))).toEqual([2, 4, 1, 3]);
  });
});

describe("recentFirst", () => {
  it("orders unlocked by newest unlock date", () => {
    expect(ids(sortAchievements(list, "recentFirst"))).toEqual([3, 1, 2, 4]);
  });

  it("keeps locked achievements below every unlock", () => {
    const sorted = sortAchievements(list, "recentFirst");
    const firstLocked = sorted.findIndex((a) => !a.unlocked);
    const lastUnlocked = sorted.map((a) => a.unlocked).lastIndexOf(true);
    expect(firstLocked).toBeGreaterThan(lastUnlocked);
  });

  it("sinks an unlocked achievement with an unusable date below dated ones", () => {
    // Rather than letting a NaN timestamp land it arbitrarily.
    const withBadDate = [achievement({ id: 9, unlocked: true, unlockedAt: "not a date" }), ...list];
    const sorted = ids(sortAchievements(withBadDate, "recentFirst"));
    expect(sorted.indexOf(9)).toBeGreaterThan(sorted.indexOf(1));
    expect(sorted.indexOf(9)).toBeLessThan(sorted.indexOf(2));
  });
});

describe("sortAchievements", () => {
  it("does not mutate the input", () => {
    const original = ids(list);
    sortAchievements(list, "lockedFirst");
    expect(ids(list)).toEqual(original);
  });

  it("is stable for entries that tie", () => {
    const tied = [achievement({ id: 2, displayOrder: 1 }), achievement({ id: 1, displayOrder: 1 })];
    // Same displayOrder, so id breaks the tie -- no render-to-render shuffling.
    expect(ids(sortAchievements(tied, "unlockedFirst"))).toEqual([1, 2]);
  });

  it("handles an empty list", () => {
    expect(sortAchievements([], "recentFirst")).toEqual([]);
  });
});

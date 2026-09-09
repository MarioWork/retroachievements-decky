/**
 * The riskiest code in the plugin: RA's API is inconsistent about casing and
 * about whether numbers arrive as numbers or strings, and the per-game endpoint
 * returns achievements as an object keyed by id rather than an array.
 *
 * The payload fixtures below are shaped like real RA responses.
 */

import { describe, expect, it } from "vitest";

import {
  bool,
  num,
  parseCredentials,
  parseGameProgress,
  parseMyGames,
  parseProfile,
  parseRank,
  parseRecentAchievements,
  parseRecentlyPlayed,
  str,
} from "./parsers";

describe("scalar coercion", () => {
  it("reads numbers that RA sent as strings", () => {
    expect(num("34")).toBe(34);
    expect(num(34)).toBe(34);
  });

  it("falls back rather than producing NaN", () => {
    expect(num("not a number")).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(null, -1)).toBe(-1);
    expect(num(Number.NaN)).toBe(0);
    expect(num("")).toBe(0);
  });

  it("stringifies numbers and defends against non-strings", () => {
    expect(str("hello")).toBe("hello");
    expect(str(42)).toBe("42");
    expect(str(null)).toBe("");
    expect(str({}, "fallback")).toBe("fallback");
  });

  it("treats RA's 1/0 and '1'/'0' as booleans", () => {
    expect(bool(1)).toBe(true);
    expect(bool("1")).toBe(true);
    expect(bool(true)).toBe(true);
    expect(bool(0)).toBe(false);
    expect(bool("0")).toBe(false);
    expect(bool(undefined)).toBe(false);
  });
});

describe("parseCredentials", () => {
  it("reads the backend's snake_case payload", () => {
    expect(parseCredentials({ username: "Mario", has_key: true })).toEqual({
      username: "Mario",
      hasKey: true,
      notifyUnlocks: false,
    });
  });

  it("reports no key for an unconfigured account", () => {
    expect(parseCredentials({ username: "", has_key: false })).toEqual({
      username: "",
      hasKey: false,
      notifyUnlocks: false,
    });
  });

  it("survives a non-object", () => {
    expect(parseCredentials(null)).toEqual({ username: "", hasKey: false, notifyUnlocks: false });
  });
});

describe("parseProfile", () => {
  it("reads a PascalCase response", () => {
    const profile = parseProfile({
      User: "Mario",
      UserPic: "/UserPic/Mario.png",
      TotalPoints: "12345",
      TotalTruePoints: 20000,
      MemberSince: "2019-03-01 12:00:00",
      Motto: "one more run",
    });

    expect(profile.username).toBe("Mario");
    expect(profile.avatarPath).toBe("/UserPic/Mario.png");
    expect(profile.totalPoints).toBe(12345);
    expect(profile.totalTruePoints).toBe(20000);
  });

  it("reads the camelCase variant of the same fields", () => {
    expect(parseProfile({ user: "Mario", totalPoints: 10 }).username).toBe("Mario");
    expect(parseProfile({ user: "Mario", totalPoints: 10 }).totalPoints).toBe(10);
  });

  it("degrades to empty values rather than throwing", () => {
    expect(parseProfile(undefined)).toEqual({
      username: "",
      avatarPath: "",
      totalPoints: 0,
      totalTruePoints: 0,
      memberSince: "",
      motto: "",
    });
  });
});

describe("parseRank", () => {
  it("reads rank and total", () => {
    expect(parseRank({ Rank: 4201, TotalRanked: 90000 })).toEqual({
      rank: 4201,
      totalRanked: 90000,
    });
  });

  it("uses null, not 0, when RA omits the rank", () => {
    // 0 would render as "Rank #0"; null lets the header say "unavailable".
    expect(parseRank({})).toEqual({ rank: null, totalRanked: null });
    expect(parseRank({ Rank: null })).toEqual({ rank: null, totalRanked: null });
  });
});

describe("parseRecentAchievements", () => {
  const payload = [
    {
      Date: "2026-03-14 21:05:11",
      HardcoreMode: "1",
      AchievementID: 9001,
      Title: "Charge Beam",
      Description: "Obtain the Charge Beam",
      Points: "10",
      BadgeName: "112233",
      GameID: 504,
      GameTitle: "Metroid Fusion",
      ConsoleName: "Game Boy Advance",
    },
  ];

  it("maps a real unlock", () => {
    const [unlock] = parseRecentAchievements(payload);
    expect(unlock).toMatchObject({
      id: 9001,
      title: "Charge Beam",
      points: 10,
      gameId: 504,
      gameTitle: "Metroid Fusion",
      hardcore: true,
      unlockedAt: "2026-03-14 21:05:11",
    });
  });

  it("drops entries with no achievement id instead of rendering blanks", () => {
    expect(parseRecentAchievements([{ Title: "orphan" }, ...payload])).toHaveLength(1);
  });

  it("returns an empty list for a non-array", () => {
    expect(parseRecentAchievements({ nope: true })).toEqual([]);
  });
});

describe("parseRecentlyPlayed", () => {
  it("uses NumAchieved / NumPossibleAchievements for this endpoint", () => {
    const [game] = parseRecentlyPlayed([
      {
        GameID: 504,
        Title: "Metroid Fusion",
        ConsoleName: "Game Boy Advance",
        ImageIcon: "/Images/012345.png",
        NumAchieved: "34",
        NumPossibleAchievements: "56",
        LastPlayed: "2026-03-14 21:00:00",
      },
    ]);

    expect(game).toMatchObject({ gameId: 504, numAwarded: 34, maxPossible: 56 });
  });
});

describe("parseMyGames", () => {
  it("reads the paged Results envelope and NumAwarded / MaxPossible", () => {
    const page = parseMyGames({
      Count: 1,
      Total: 137,
      Results: [
        {
          GameID: 504,
          Title: "Metroid Fusion",
          ConsoleName: "Game Boy Advance",
          ImageIcon: "/Images/012345.png",
          NumAwarded: 34,
          MaxPossible: 56,
          MostRecentAwardedDate: "2026-03-14T21:00:00+00:00",
        },
      ],
    });

    expect(page.total).toBe(137);
    expect(page.games).toHaveLength(1);
    expect(page.games[0]).toMatchObject({ numAwarded: 34, maxPossible: 56 });
  });

  it("falls back to the row count when Total is absent", () => {
    expect(parseMyGames({ Results: [{ GameID: 1 }, { GameID: 2 }] }).total).toBe(2);
  });

  it("handles an empty library", () => {
    expect(parseMyGames({ Total: 0, Results: [] })).toEqual({ total: 0, games: [] });
  });
});

describe("parseGameProgress", () => {
  // RA keys Achievements by achievement id, and sends DateEarned only for
  // achievements this user has actually unlocked.
  const payload = {
    ID: 504,
    Title: "Metroid Fusion",
    ConsoleName: "Game Boy Advance",
    ImageIcon: "/Images/012345.png",
    NumAchievements: 3,
    NumAwardedToUser: 2,
    NumAwardedToUserHardcore: 1,
    Achievements: {
      "9003": {
        ID: 9003,
        Title: "Hard Mode Clear",
        Description: "Finish on hard",
        Points: 50,
        BadgeName: "333",
        DisplayOrder: 3,
      },
      "9001": {
        ID: 9001,
        Title: "Welcome to SR388",
        Description: "Arrive",
        Points: 5,
        BadgeName: "111",
        DisplayOrder: 1,
        DateEarned: "2026-03-14 20:00:00",
      },
      "9002": {
        ID: 9002,
        Title: "Charge Beam",
        Description: "Obtain the Charge Beam",
        Points: 10,
        BadgeName: "222",
        DisplayOrder: 2,
        DateEarned: "2026-03-14 21:00:00",
        DateEarnedHardcore: "2026-03-14 21:00:00",
      },
    },
  };

  it("turns the id-keyed object into an array of every achievement", () => {
    const game = parseGameProgress(payload);
    // Locked ones must be present too -- that is the whole point of the view.
    expect(game.achievements).toHaveLength(3);
    expect(game.achievements.map((a) => a.id).sort()).toEqual([9001, 9002, 9003]);
  });

  it("marks an achievement unlocked from the presence of DateEarned", () => {
    const byId = new Map(parseGameProgress(payload).achievements.map((a) => [a.id, a]));

    expect(byId.get(9001)?.unlocked).toBe(true);
    expect(byId.get(9002)?.unlocked).toBe(true);
    expect(byId.get(9003)?.unlocked).toBe(false);
  });

  it("distinguishes hardcore from softcore unlocks", () => {
    const byId = new Map(parseGameProgress(payload).achievements.map((a) => [a.id, a]));

    expect(byId.get(9001)?.unlockedHardcore).toBe(false);
    expect(byId.get(9002)?.unlockedHardcore).toBe(true);
    expect(byId.get(9003)?.unlockedHardcore).toBe(false);
  });

  it("prefers the hardcore date when both are present", () => {
    const byId = new Map(parseGameProgress(payload).achievements.map((a) => [a.id, a]));
    expect(byId.get(9002)?.unlockedAt).toBe("2026-03-14 21:00:00");
  });

  it("leaves no unlock date on a locked achievement", () => {
    const byId = new Map(parseGameProgress(payload).achievements.map((a) => [a.id, a]));
    expect(byId.get(9003)?.unlockedAt).toBe("");
  });

  it("sorts unlocked first, then by display order", () => {
    expect(parseGameProgress(payload).achievements.map((a) => a.id)).toEqual([9001, 9002, 9003]);
  });

  it("reads the game header fields", () => {
    const game = parseGameProgress(payload);
    expect(game).toMatchObject({
      gameId: 504,
      title: "Metroid Fusion",
      consoleName: "Game Boy Advance",
      numAwarded: 2,
      numAwardedHardcore: 1,
      total: 3,
    });
  });

  it("accepts Achievements as an array too", () => {
    const game = parseGameProgress({
      ID: 1,
      Achievements: [{ ID: 7, Title: "Solo", DisplayOrder: 1 }],
    });
    expect(game.achievements).toHaveLength(1);
    expect(game.achievements[0]?.unlocked).toBe(false);
  });

  it("falls back to the parsed count when NumAchievements is missing", () => {
    const game = parseGameProgress({ ID: 1, Achievements: { "7": { ID: 7 }, "8": { ID: 8 } } });
    expect(game.total).toBe(2);
  });

  it("returns an empty game rather than throwing on junk", () => {
    const game = parseGameProgress("not a game");
    expect(game.achievements).toEqual([]);
    expect(game.total).toBe(0);
  });
});

describe("award parsing", () => {
  it("reads RA's award kinds", () => {
    const page = parseMyGames({
      Results: [
        { GameID: 1, HighestAwardKind: "mastered" },
        { GameID: 2, HighestAwardKind: "beaten-hardcore" },
        { GameID: 3, HighestAwardKind: "completed" },
        { GameID: 4, HighestAwardKind: "beaten-softcore" },
      ],
    });

    expect(page.games.map((g) => g.highestAward)).toEqual([
      "mastered",
      "beaten-hardcore",
      "completed",
      "beaten-softcore",
    ]);
  });

  it("uses an empty award when RA sends none or something unknown", () => {
    const page = parseMyGames({
      Results: [{ GameID: 1 }, { GameID: 2, HighestAwardKind: "invented-award" }],
    });
    expect(page.games.map((g) => g.highestAward)).toEqual(["", ""]);
  });

  it("reads the award from recently-played entries too", () => {
    const [entry] = parseRecentlyPlayed([{ GameID: 1, HighestAwardKind: "mastered" }]);
    expect(entry?.highestAward).toBe("mastered");
  });
});

describe("notification preference", () => {
  it("reads notify_unlocks from the backend", () => {
    expect(parseCredentials({ username: "Mario", has_key: true, notify_unlocks: true })).toEqual({
      username: "Mario",
      hasKey: true,
      notifyUnlocks: true,
    });
  });

  it("defaults to off when the backend omits it", () => {
    // Opt-in matters: this is the only feature with an ongoing battery cost.
    expect(parseCredentials({ username: "Mario", has_key: true }).notifyUnlocks).toBe(false);
  });
});

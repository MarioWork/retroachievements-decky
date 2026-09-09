/**
 * The RPC boundary: unwrapping the Python `{ok, data|error}` envelope.
 *
 * The rule this protects is that a backend failure must arrive as data the UI
 * can branch on, never as a rejected promise or a blank panel.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factory (which runs before imports) can see it.
const { stubs } = vi.hoisted(() => ({
  stubs: new Map<string, (args: readonly unknown[]) => Promise<unknown>>(),
}));

vi.mock("@decky/api", () => ({
  callable:
    (route: string) =>
    (...args: unknown[]): Promise<unknown> => {
      const stub = stubs.get(route);
      if (stub === undefined) return Promise.reject(new Error(`no stub for ${route}`));
      return stub(args);
    },
}));

const { clearInFlight } = await import("./dedupe");
const { getCredentials, getGameProgress, getProfile, saveCredentials } = await import("./backend");

/** Replies to `route` with a raw value, exactly as the RPC layer would. */
function reply(route: string, value: unknown): void {
  stubs.set(route, () => Promise.resolve(value));
}

beforeEach(() => {
  stubs.clear();
  clearInFlight();
});

describe("successful envelopes", () => {
  it("unwraps ok and runs the payload through the parser", async () => {
    reply("get_profile", { ok: true, data: { User: "Mario", TotalPoints: "12345" } });

    const result = await getProfile();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.username).toBe("Mario");
    expect(result.data.totalPoints).toBe(12345);
  });

  it("parses a game's achievements through the boundary", async () => {
    reply("get_game_progress", {
      ok: true,
      data: {
        ID: 504,
        NumAchievements: 2,
        Achievements: {
          "1": { ID: 1, DisplayOrder: 1, DateEarned: "2026-01-01 00:00:00" },
          "2": { ID: 2, DisplayOrder: 2 },
        },
      },
    });

    const result = await getGameProgress(504);

    if (!result.ok) throw new Error("expected success");
    expect(result.data.achievements.map((a) => a.unlocked)).toEqual([true, false]);
  });
});

describe("error envelopes", () => {
  it("passes a tagged backend error straight through", async () => {
    reply("get_profile", {
      ok: false,
      error: { kind: "auth", message: "RetroAchievements rejected your API key." },
    });

    const result = await getProfile();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("auth");
  });

  it("maps an unrecognised kind to unexpected rather than trusting it", async () => {
    reply("get_profile", { ok: false, error: { kind: "wat", message: "something" } });

    const result = await getProfile();

    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("unexpected");
    expect(result.error.message).toBe("something");
  });

  it("handles an error field that is not an object", async () => {
    reply("get_profile", { ok: false, error: "just a string" });

    const result = await getProfile();

    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("unexpected");
  });
});

describe("malformed responses", () => {
  it("treats a non-object reply as a parse failure", async () => {
    reply("get_profile", "not an envelope");

    const result = await getProfile();

    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("parse");
  });

  it("treats a missing ok field as a parse failure", async () => {
    reply("get_profile", { data: { User: "Mario" } });

    const result = await getProfile();

    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("parse");
  });
});

describe("transport failures", () => {
  it("turns a rejected RPC into a Result instead of throwing", async () => {
    // This is what a dead or restarting backend process looks like.
    stubs.set("get_profile", () => Promise.reject(new Error("socket closed")));

    const result = await getProfile();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("unexpected");
    expect(result.error.message).toContain("socket closed");
  });
});

describe("credentials", () => {
  it("reads the backend's has_key without ever seeing the key", async () => {
    reply("get_settings", { ok: true, data: { username: "Mario", has_key: true } });

    const result = await getCredentials();

    if (!result.ok) throw new Error("expected success");
    expect(result.data).toEqual({ username: "Mario", hasKey: true, notifyUnlocks: false });
    expect(JSON.stringify(result.data)).not.toContain("api_key");
  });

  it("forwards username and key to the backend on save", async () => {
    const seen: unknown[][] = [];
    stubs.set("save_settings", (args) => {
      seen.push([...args]);
      return Promise.resolve({ ok: true, data: { username: "Mario", has_key: true } });
    });

    const result = await saveCredentials("Mario", "SECRETKEY");

    expect(seen).toEqual([["Mario", "SECRETKEY"]]);
    expect(result.ok).toBe(true);
  });

  it("surfaces a rejected key as an auth error", async () => {
    reply("save_settings", {
      ok: false,
      error: { kind: "auth", message: "Those credentials did not work." },
    });

    const result = await saveCredentials("Mario", "WRONG");

    if (result.ok) throw new Error("expected failure");
    expect(result.error.kind).toBe("auth");
  });
});

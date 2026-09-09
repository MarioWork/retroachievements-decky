import { beforeEach, describe, expect, it, vi } from "vitest";

const { toasts, listeners } = vi.hoisted(() => ({
  toasts: [] as { title?: unknown; body?: unknown }[],
  listeners: new Map<string, (payload: unknown) => unknown>(),
}));

vi.mock("@decky/api", () => ({
  toaster: {
    toast: (data: { title?: unknown; body?: unknown }) => {
      toasts.push(data);
    },
  },
  addEventListener: (event: string, handler: (payload: unknown) => unknown) => {
    listeners.set(event, handler);
    return handler;
  },
  removeEventListener: (event: string) => {
    listeners.delete(event);
  },
}));

const { parseUnlockEvent, subscribeToUnlocks, unlockToastBody, UNLOCK_EVENT } =
  await import("./notifications");

const payload = {
  id: 9002,
  title: "Charge Beam",
  description: "Obtain the Charge Beam",
  points: 10,
  badgeName: "112233",
  gameTitle: "Metroid Fusion",
  hardcore: true,
};

beforeEach(() => {
  toasts.length = 0;
  listeners.clear();
});

describe("parseUnlockEvent", () => {
  it("reads the backend payload", () => {
    expect(parseUnlockEvent(payload)).toEqual({
      id: 9002,
      title: "Charge Beam",
      description: "Obtain the Charge Beam",
      points: 10,
      badgeName: "112233",
      gameTitle: "Metroid Fusion",
      hardcore: true,
    });
  });

  it("rejects an event with no title rather than toasting a blank", () => {
    expect(parseUnlockEvent({ ...payload, title: "" })).toBeNull();
    expect(parseUnlockEvent({ ...payload, title: undefined })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseUnlockEvent(null)).toBeNull();
    expect(parseUnlockEvent("unlocked!")).toBeNull();
    expect(parseUnlockEvent([payload])).toBeNull();
  });

  it("coerces points sent as a string", () => {
    expect(parseUnlockEvent({ ...payload, points: "25" })?.points).toBe(25);
  });

  it("treats a missing hardcore flag as softcore", () => {
    expect(parseUnlockEvent({ ...payload, hardcore: undefined })?.hardcore).toBe(false);
  });
});

describe("unlockToastBody", () => {
  it("includes the game and the hardcore marker", () => {
    const unlock = parseUnlockEvent(payload);
    expect(unlock).not.toBeNull();
    expect(unlockToastBody(unlock!)).toBe("Metroid Fusion · 10 pts · hardcore");
  });

  it("omits the game when RA did not send one", () => {
    const unlock = parseUnlockEvent({ ...payload, gameTitle: "", hardcore: false });
    expect(unlockToastBody(unlock!)).toBe("10 pts");
  });
});

describe("subscribeToUnlocks", () => {
  it("toasts an incoming unlock", () => {
    subscribeToUnlocks();
    listeners.get(UNLOCK_EVENT)?.(payload);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.title).toContain("Charge Beam");
    expect(toasts[0]?.body).toContain("Metroid Fusion");
  });

  it("stays silent on a malformed event", () => {
    subscribeToUnlocks();
    listeners.get(UNLOCK_EVENT)?.({ nonsense: true });
    expect(toasts).toHaveLength(0);
  });

  it("unsubscribes so a reload cannot double-toast", () => {
    const unsubscribe = subscribeToUnlocks();
    expect(listeners.has(UNLOCK_EVENT)).toBe(true);

    unsubscribe();
    expect(listeners.has(UNLOCK_EVENT)).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearInFlight, dedupe } from "./dedupe";

beforeEach(() => {
  clearInFlight();
});

/** A promise this test controls the resolution of. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("dedupe", () => {
  it("collapses concurrent calls for the same key into one", () => {
    // The dashboard mounts several hooks at once; without this they would each
    // fire their own RPC before any response could reach the backend's cache.
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);

    const first = dedupe("profile", run);
    const second = dedupe("profile", run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    gate.resolve("data");
    return expect(Promise.all([first, second])).resolves.toEqual(["data", "data"]);
  });

  it("keeps different keys independent", async () => {
    const run = vi.fn(() => Promise.resolve("x"));
    await Promise.all([dedupe("profile", run), dedupe("rank", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs again once the first call has settled", async () => {
    const run = vi.fn(() => Promise.resolve("x"));

    await dedupe("profile", run);
    await dedupe("profile", run);

    // Not a cache -- the backend owns caching. This only merges in-flight calls.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not wedge the key after a rejection", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(dedupe("profile", failing)).rejects.toThrow("boom");

    const succeeding = vi.fn(() => Promise.resolve("recovered"));
    await expect(dedupe("profile", succeeding)).resolves.toBe("recovered");
  });

  it("propagates the rejection to every concurrent caller", async () => {
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);

    const first = dedupe("profile", run);
    const second = dedupe("profile", run);
    gate.reject(new Error("boom"));

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
  });
});

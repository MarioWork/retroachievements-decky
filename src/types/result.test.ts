import { describe, expect, it } from "vitest";

import { describeError, fail, formatAge, isCredentialProblem, ok } from "./result";

describe("ok", () => {
  it("defaults to a live (non-stale) response", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, data: 42, staleSeconds: null, partialTotal: null });
  });

  it("carries the age when served from expired cache", () => {
    const result = ok(42, 630);
    if (!result.ok) throw new Error("expected success");
    expect(result.staleSeconds).toBe(630);
  });
});

describe("fail", () => {
  it("has no data branch", () => {
    const result = fail({ kind: "network", message: "down" });
    expect(result.ok).toBe(false);
  });
});

describe("formatAge", () => {
  it("reads naturally at every scale", () => {
    expect(formatAge(0)).toBe("just now");
    expect(formatAge(59)).toBe("just now");
    expect(formatAge(60)).toBe("1m ago");
    expect(formatAge(630)).toBe("10m ago");
    expect(formatAge(3600)).toBe("1h ago");
    expect(formatAge(3600 * 25)).toBe("1d ago");
  });
});

describe("partial results", () => {
  it("carries the real total when only part could be fetched", () => {
    const result = ok([1, 2, 3], null, 400);
    if (!result.ok) throw new Error("expected success");
    // The UI needs the true total to say what is missing, rather than
    // presenting a short list as though it were complete.
    expect(result.partialTotal).toBe(400);
    expect(result.staleSeconds).toBeNull();
  });
});

describe("isCredentialProblem", () => {
  it("is true only for failures re-entering the key can fix", () => {
    expect(isCredentialProblem({ kind: "auth", message: "" })).toBe(true);
    expect(isCredentialProblem({ kind: "config", message: "" })).toBe(true);
  });

  it("is false for transient failures", () => {
    // These get a "Try again"; a credential problem gets "Update your API key".
    expect(isCredentialProblem({ kind: "network", message: "" })).toBe(false);
    expect(isCredentialProblem({ kind: "rateLimit", message: "" })).toBe(false);
    expect(isCredentialProblem({ kind: "notFound", message: "" })).toBe(false);
  });
});

describe("describeError", () => {
  it("names the likeliest cause of a rejected key", () => {
    expect(describeError({ kind: "auth", message: "" })).toContain("regenerated");
  });
});

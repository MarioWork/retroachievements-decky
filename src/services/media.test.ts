import { describe, expect, it, vi } from "vitest";

// The real module reaches into Decky's runtime on import. Identity is also what
// the dev harness uses, so URLs assert cleanly.
vi.mock("@decky/api", () => ({
  getExternalResourceURL: (url: string) => url,
}));

const { badgeUrl, mediaUrl } = await import("./media");

const MEDIA = "https://media.retroachievements.org";

describe("mediaUrl", () => {
  it("makes RA's leading-slash paths absolute", () => {
    expect(mediaUrl("/Images/012345.png")).toBe(`${MEDIA}/Images/012345.png`);
  });

  it("handles a path with no leading slash", () => {
    expect(mediaUrl("Images/012345.png")).toBe(`${MEDIA}/Images/012345.png`);
  });

  it("leaves an already-absolute URL alone", () => {
    expect(mediaUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("returns empty string for a missing image so BadgeImage can show a placeholder", () => {
    expect(mediaUrl("")).toBe("");
  });
});

describe("badgeUrl", () => {
  it("uses the plain badge when unlocked", () => {
    expect(badgeUrl("112233", true)).toBe(`${MEDIA}/Badge/112233.png`);
  });

  it("uses the _lock variant when locked", () => {
    // This suffix is what makes locked achievements read as locked at a glance.
    expect(badgeUrl("112233", false)).toBe(`${MEDIA}/Badge/112233_lock.png`);
  });

  it("returns empty string when RA gave no badge name", () => {
    expect(badgeUrl("", true)).toBe("");
    expect(badgeUrl("", false)).toBe("");
  });
});

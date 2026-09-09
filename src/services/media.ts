/**
 * RetroAchievements image URLs.
 *
 * Steam's CSP is restrictive about remote images, so every URL goes through
 * Decky's `getExternalResourceURL` rather than being set as a raw `src`.
 *
 * RA returns image fields as paths ("/Images/012345.png"), not absolute URLs.
 */

import { getExternalResourceURL } from "@decky/api";

const MEDIA_ORIGIN = "https://media.retroachievements.org";

function absolute(pathOrUrl: string): string {
  if (pathOrUrl === "") return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  return `${MEDIA_ORIGIN}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/** Game icons, box art, user avatars. Returns "" when RA gave us nothing. */
export function mediaUrl(pathOrUrl: string): string {
  const url = absolute(pathOrUrl);
  return url === "" ? "" : getExternalResourceURL(url);
}

/**
 * Achievement badge. RA stores the locked variant beside the unlocked one with
 * a `_lock` suffix -- that pair is what makes the game view readable at a glance.
 */
export function badgeUrl(badgeName: string, unlocked: boolean): string {
  if (badgeName === "") return "";
  const suffix = unlocked ? "" : "_lock";
  return getExternalResourceURL(`${MEDIA_ORIGIN}/Badge/${badgeName}${suffix}.png`);
}

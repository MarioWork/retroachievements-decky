/**
 * Turns backend unlock events into Steam toasts.
 *
 * Subscribed at plugin load (in `definePlugin`), NOT inside a component: the
 * plugin's content only mounts while the Quick Access panel is open, so a
 * component-level listener would miss every unlock earned during play.
 */

import { addEventListener, removeEventListener, toaster } from "@decky/api";

import { isRecord, num, str } from "./parsers";

/** Must match `EVENT_NAME` in py_modules/ra/unlockwatcher.py. */
export const UNLOCK_EVENT = "ra_unlock";

export interface UnlockNotification {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly points: number;
  readonly badgeName: string;
  readonly gameTitle: string;
  readonly hardcore: boolean;
}

/** Returns null for anything unusable, so a malformed event shows no toast
 * rather than an empty one. */
export function parseUnlockEvent(raw: unknown): UnlockNotification | null {
  if (!isRecord(raw)) return null;

  const title = str(raw.title);
  if (title === "") return null;

  return {
    id: num(raw.id, -1),
    title,
    description: str(raw.description),
    points: num(raw.points),
    badgeName: str(raw.badgeName),
    gameTitle: str(raw.gameTitle),
    hardcore: raw.hardcore === true,
  };
}

export function unlockToastBody(unlock: UnlockNotification): string {
  const points = `${String(unlock.points)} pts`;
  const mode = unlock.hardcore ? " · hardcore" : "";
  return unlock.gameTitle === "" ? `${points}${mode}` : `${unlock.gameTitle} · ${points}${mode}`;
}

/**
 * Starts listening. Returns an unsubscribe function for `onDismount` -- without
 * it, reloading the plugin would stack duplicate listeners and double-toast.
 */
export function subscribeToUnlocks(): () => void {
  const handler = (raw: unknown): void => {
    const unlock = parseUnlockEvent(raw);
    if (unlock === null) return;

    toaster.toast({
      title: `🏆 ${unlock.title}`,
      body: unlockToastBody(unlock),
      duration: 6000,
    });
  };

  addEventListener<[payload: unknown]>(UNLOCK_EVENT, handler);
  return () => {
    removeEventListener<[payload: unknown]>(UNLOCK_EVENT, handler);
  };
}

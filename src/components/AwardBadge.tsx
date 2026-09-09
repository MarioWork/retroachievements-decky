/**
 * RA's highest award for a game, as a compact marker for a list row.
 *
 * Shown inside this plugin's own lists -- it does not decorate Steam's library
 * tiles, which a Decky plugin cannot reach without patching Steam internals.
 */

import type { ReactNode } from "react";

import type { AwardKind } from "../types/ra";

const AWARDS: Record<Exclude<AwardKind, "">, { label: string; color: string; title: string }> = {
  mastered: { label: "★", color: "#e8b84b", title: "Mastered (100% hardcore)" },
  completed: { label: "★", color: "#9aa4ae", title: "Completed (100% softcore)" },
  "beaten-hardcore": { label: "✦", color: "#c88b4b", title: "Beaten (hardcore)" },
  "beaten-softcore": { label: "✦", color: "#7a838c", title: "Beaten (softcore)" },
};

interface Props {
  readonly award: AwardKind;
}

export function AwardBadge({ award }: Props): ReactNode {
  if (award === "") return null;
  const style = AWARDS[award];

  return (
    <span
      title={style.title}
      aria-label={style.title}
      style={{ color: style.color, fontSize: "12px", lineHeight: 1 }}
    >
      {style.label}
    </span>
  );
}

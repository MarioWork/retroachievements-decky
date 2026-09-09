/**
 * A selectable game in a list.
 *
 * Uses @decky/ui's Focusable rather than a div with onClick: on a Deck, a plain
 * div is invisible to the D-pad and the row would be unreachable without the
 * touchscreen.
 */

import { Focusable } from "@decky/ui";
import type { ReactNode } from "react";

import { mediaUrl } from "../services/media";
import type { GameSummary } from "../types/ra";
import { AwardBadge } from "./AwardBadge";
import { BadgeImage } from "./BadgeImage";

interface Props {
  readonly game: GameSummary;
  readonly onSelect: (gameId: number) => void;
}

export function GameRow({ game, onSelect }: Props): ReactNode {
  const { gameId, title, consoleName, iconPath, numAwarded, maxPossible } = game;
  const complete = maxPossible > 0 && numAwarded >= maxPossible;

  return (
    <Focusable
      onActivate={() => {
        onSelect(gameId);
      }}
      style={{
        display: "flex",
        gap: "10px",
        padding: "8px 4px",
        alignItems: "center",
        borderRadius: "4px",
      }}
    >
      <BadgeImage src={mediaUrl(iconPath)} alt="" size={32} />

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            color: "#ffffff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "11px", color: "#7a838c" }}>{consoleName}</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "12px",
          color: complete ? "#5ba85b" : "#c0c8d0",
          whiteSpace: "nowrap",
        }}
      >
        <AwardBadge award={game.highestAward} />
        {`${String(numAwarded)}/${String(maxPossible)}`}
      </div>
    </Focusable>
  );
}

/**
 * One achievement, unlocked or locked.
 *
 * Both states render in the same list -- that is the point of the game view --
 * so the difference has to be legible at a glance on a small screen: the locked
 * badge art, reduced opacity, and a check vs. a lock glyph.
 */

import type { ReactNode } from "react";
import { FaCheck, FaLock } from "react-icons/fa";

import { badgeUrl } from "../services/media";
import type { Achievement } from "../types/ra";
import { BadgeImage } from "./BadgeImage";

interface Props {
  readonly achievement: Achievement;
}

/** RA sends "2024-03-14 21:05:11"; Safari-era parsers want the T. */
function formatUnlockedAt(value: string): string {
  if (value === "") return "";
  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AchievementRow({ achievement }: Props): ReactNode {
  const { unlocked, unlockedHardcore, title, description, points, badgeName, unlockedAt } =
    achievement;

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        padding: "8px 4px",
        alignItems: "flex-start",
        opacity: unlocked ? 1 : 0.72,
      }}
    >
      <BadgeImage
        src={badgeUrl(badgeName, unlocked)}
        alt={unlocked ? `${title} (unlocked)` : `${title} (locked)`}
        size={40}
        dimmed={!unlocked}
      />

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {unlocked ? (
            <FaCheck size={11} color={unlockedHardcore ? "#e8b84b" : "#5ba85b"} />
          ) : (
            <FaLock size={11} color="#7a838c" />
          )}
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: unlocked ? "#ffffff" : "#c0c8d0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ fontSize: "12px", color: "#9aa4ae", lineHeight: 1.35, marginTop: "2px" }}>
          {description}
        </div>

        <div style={{ fontSize: "11px", color: "#7a838c", marginTop: "3px" }}>
          {`${String(points)} pts`}
          {unlocked && unlockedAt !== "" ? ` · ${formatUnlockedAt(unlockedAt)}` : ""}
          {unlockedHardcore ? " · hardcore" : ""}
        </div>
      </div>
    </div>
  );
}

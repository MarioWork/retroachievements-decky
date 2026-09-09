/**
 * Avatar, points and rank.
 *
 * Rank comes from a separate (and RA-documented-as-slow) endpoint, so it is
 * passed in as its own optional value: the header renders immediately from the
 * profile call and fills the rank in when it arrives, rather than blocking on it.
 */

import type { ReactNode } from "react";

import { mediaUrl } from "../services/media";
import type { Profile, Rank } from "../types/ra";
import { BadgeImage } from "./BadgeImage";

interface Props {
  readonly profile: Profile;
  readonly rank: Rank | null;
}

const formatNumber = (value: number): string => value.toLocaleString();

export function ProfileHeader({ profile, rank }: Props): ReactNode {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "6px 4px" }}>
      <BadgeImage src={mediaUrl(profile.avatarPath)} alt="" size={44} />

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#ffffff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {profile.username}
        </div>

        <div style={{ fontSize: "12px", color: "#c0c8d0", marginTop: "2px" }}>
          {`${formatNumber(profile.totalPoints)} pts`}
          {profile.totalTruePoints > 0 ? ` · ${formatNumber(profile.totalTruePoints)} true` : ""}
        </div>

        <div style={{ fontSize: "11px", color: "#7a838c", marginTop: "1px" }}>
          {rank?.rank != null
            ? `Rank #${formatNumber(rank.rank)}${
                rank.totalRanked != null ? ` of ${formatNumber(rank.totalRanked)}` : ""
              }`
            : "Rank unavailable"}
        </div>
      </div>
    </div>
  );
}

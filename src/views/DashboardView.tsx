/**
 * The panel's landing screen: who you are, what you just unlocked, what you were
 * just playing.
 *
 * Each section owns its own async state, so a slow or failing rank lookup cannot
 * stop the recent-unlocks feed from rendering.
 */

import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";
import type { ReactNode } from "react";

import { AchievementRow } from "../components/AchievementRow";
import { GameRow } from "../components/GameRow";
import { ProfileHeader } from "../components/ProfileHeader";
import { StateBoundary } from "../components/StateBoundary";
import {
  useProfile,
  useRank,
  useRecentAchievements,
  useRecentlyPlayed,
} from "../hooks/useRetroAchievements";

interface Props {
  readonly onSelectGame: (gameId: number) => void;
  readonly onBrowseAll: () => void;
  readonly onOpenSettings: () => void;
}

const RECENT_UNLOCKS_SHOWN = 2;

export function DashboardView({ onSelectGame, onBrowseAll, onOpenSettings }: Props): ReactNode {
  const profile = useProfile();
  const rank = useRank();
  const recent = useRecentAchievements();
  const played = useRecentlyPlayed();

  const refreshAll = (): void => {
    profile.refresh();
    rank.refresh();
    recent.refresh();
    played.refresh();
  };

  return (
    <>
      <PanelSection>
        <StateBoundary state={profile.state} onRetry={profile.refresh}>
          {(data) => (
            <ProfileHeader
              profile={data}
              rank={rank.state.status === "loaded" ? rank.state.data : null}
            />
          )}
        </StateBoundary>
      </PanelSection>

      <PanelSection title="Recent unlocks">
        <StateBoundary
          state={recent.state}
          onRetry={recent.refresh}
          isEmpty={(list) => list.length === 0}
          emptyMessage="No achievements unlocked in the last 30 days."
        >
          {(list) =>
            list.slice(0, RECENT_UNLOCKS_SHOWN).map((achievement) => (
              <div key={`${String(achievement.id)}-${achievement.unlockedAt}`}>
                <AchievementRow
                  achievement={{
                    id: achievement.id,
                    title: achievement.title,
                    description: `${achievement.gameTitle} · ${achievement.consoleName}`,
                    points: achievement.points,
                    badgeName: achievement.badgeName,
                    displayOrder: 0,
                    unlocked: true,
                    unlockedHardcore: achievement.hardcore,
                    unlockedAt: achievement.unlockedAt,
                  }}
                />
              </div>
            ))
          }
        </StateBoundary>
      </PanelSection>

      <PanelSection title="Recently played">
        <StateBoundary
          state={played.state}
          onRetry={played.refresh}
          isEmpty={(list) => list.length === 0}
          emptyMessage="No recently played games on RetroAchievements."
        >
          {(list) =>
            list.map((game) => <GameRow key={game.gameId} game={game} onSelect={onSelectGame} />)
          }
        </StateBoundary>

        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onBrowseAll}>
            All my games
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={refreshAll}>
            Refresh
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onOpenSettings}>
            Account settings
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

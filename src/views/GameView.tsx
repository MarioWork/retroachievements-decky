/**
 * The core feature: one game's complete achievement list.
 *
 * Unlocked and locked appear together in a single list -- RA's
 * GetGameInfoAndUserProgress returns every achievement for the game, and the
 * presence of a DateEarned field is what marks the ones you have. Nothing is
 * hidden; locked entries keep their description so they read as goals.
 *
 * Starts unlocked-first and can be re-ordered from the Sort control (see
 * services/sortAchievements.ts). Rendered in batches because a long set can run
 * past 200 rows; changing the sort resets to the first batch so the newly-top
 * entries are what you actually see.
 */

import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useMemo, useState, type ReactNode } from "react";

import { AchievementRow } from "../components/AchievementRow";
import { ProgressMeter } from "../components/ProgressMeter";
import { StateBoundary } from "../components/StateBoundary";
import { useGameProgress } from "../hooks/useRetroAchievements";
import {
  DEFAULT_SORT_MODE,
  isSortMode,
  SORT_MODES,
  sortAchievements,
  type SortMode,
} from "../services/sortAchievements";

interface Props {
  readonly gameId: number;
  readonly onBack: () => void;
}

const BATCH = 25;

export function GameView({ gameId, onBack }: Props): ReactNode {
  const progress = useGameProgress(gameId);
  const [shown, setShown] = useState(BATCH);
  const [sort, setSort] = useState<SortMode>(DEFAULT_SORT_MODE);
  const [hideUnlocked, setHideUnlocked] = useState(false);

  const loaded = progress.state.status === "loaded" ? progress.state.data : null;

  // Derived inside the memo so the `[]` fallback is not a fresh identity each render.
  const ordered = useMemo(() => {
    const all = loaded?.achievements ?? [];
    const visible = hideUnlocked ? all.filter((a) => !a.unlocked) : all;
    return sortAchievements(visible, sort);
  }, [loaded, sort, hideUnlocked]);

  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onBack}>
            ← Back
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <StateBoundary
        state={progress.state}
        onRetry={progress.refresh}
        isEmpty={(data) => data.achievements.length === 0}
        emptyMessage="This game has no achievements on RetroAchievements."
      >
        {(game) => {
          const visible = ordered.slice(0, shown);
          const remaining = ordered.length - visible.length;

          return (
            <PanelSection title={game.title === "" ? "Achievements" : game.title}>
              <PanelSectionRow>
                <div style={{ fontSize: "11px", color: "#7a838c" }}>{game.consoleName}</div>
              </PanelSectionRow>

              <PanelSectionRow>
                <ProgressMeter
                  current={game.numAwarded}
                  total={game.total}
                  label={`${String(game.numAwarded)} / ${String(game.total)} unlocked`}
                />
              </PanelSectionRow>

              {game.numAwardedHardcore > 0 ? (
                <PanelSectionRow>
                  <div style={{ fontSize: "11px", color: "#e8b84b" }}>
                    {`${String(game.numAwardedHardcore)} in hardcore`}
                  </div>
                </PanelSectionRow>
              ) : null}

              <PanelSectionRow>
                <DropdownItem
                  label="Sort"
                  rgOptions={SORT_MODES.map((entry) => ({
                    data: entry.mode,
                    label: entry.label,
                  }))}
                  selectedOption={sort}
                  onChange={(option) => {
                    // DropdownOption.data is typed `any` upstream; narrow it.
                    const next: unknown = option.data;
                    if (!isSortMode(next)) return;
                    setSort(next);
                    setShown(BATCH);
                  }}
                />
              </PanelSectionRow>

              <PanelSectionRow>
                <ToggleField
                  label="Only what's left"
                  checked={hideUnlocked}
                  onChange={(checked) => {
                    setHideUnlocked(checked);
                    setShown(BATCH);
                  }}
                />
              </PanelSectionRow>

              {ordered.length === 0 ? (
                <div style={{ padding: "8px 4px", fontSize: "13px", color: "#5ba85b" }}>
                  Everything unlocked. Nothing left here.
                </div>
              ) : null}

              {visible.map((achievement) => (
                <AchievementRow key={achievement.id} achievement={achievement} />
              ))}

              {remaining > 0 ? (
                <PanelSectionRow>
                  <ButtonItem
                    layout="below"
                    onClick={() => {
                      setShown((count) => count + BATCH);
                    }}
                  >
                    {`Show more (${String(remaining)} left)`}
                  </ButtonItem>
                </PanelSectionRow>
              ) : null}

              <PanelSectionRow>
                <ButtonItem layout="below" onClick={progress.refresh}>
                  {progress.refreshing ? "Refreshing…" : "Refresh"}
                </ButtonItem>
              </PanelSectionRow>
            </PanelSection>
          );
        }}
      </StateBoundary>
    </>
  );
}

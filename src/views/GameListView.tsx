/**
 * Every game you have RetroAchievements progress on, filterable by title.
 *
 * The filter is client-side by necessity: RA's public API has no global game
 * search (GetGameList requires a console id), so the searchable set is your own
 * completion progress. Finding a game you have never played is not possible.
 */

import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useMemo, useState, type ReactNode } from "react";

import { GameRow } from "../components/GameRow";
import { StateBoundary } from "../components/StateBoundary";
import { useMyGames } from "../hooks/useRetroAchievements";
import {
  DEFAULT_GAME_SORT,
  GAME_SORT_MODES,
  isGameSortMode,
  sortGames,
  type GameSortMode,
} from "../services/sortGames";
import type { GameSummary } from "../types/ra";

interface Props {
  readonly onSelectGame: (gameId: number) => void;
  readonly onBack: () => void;
}

/** Rendering 200+ rows at once visibly stalls the panel on a Deck. */
const PAGE = 25;

/** Sentinel for "no console filter". Not a real RA console name. */
const ALL_CONSOLES = "__all__";

export function GameListView({ onSelectGame, onBack }: Props): ReactNode {
  const games = useMyGames();
  const [filter, setFilter] = useState("");
  const [platform, setPlatform] = useState(ALL_CONSOLES);
  const [sort, setSort] = useState<GameSortMode>(DEFAULT_GAME_SORT);
  const [shown, setShown] = useState(PAGE);

  // Derived inside the memo: a `[]` fallback computed in the render body would be
  // a new array identity every render and defeat the memo entirely.
  const loaded = games.state.status === "loaded" ? games.state.data : null;

  // Built from the library itself rather than a hardcoded list, so it only ever
  // offers consoles the user actually has progress on.
  const consoles = useMemo<readonly string[]>(() => {
    const names = new Set<string>();
    for (const game of loaded?.games ?? []) {
      if (game.consoleName !== "") names.add(game.consoleName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [loaded]);

  const matches = useMemo<readonly GameSummary[]>(() => {
    const all: readonly GameSummary[] = loaded?.games ?? [];
    const needle = filter.trim().toLowerCase();
    const filtered = all.filter(
      (game) =>
        (platform === ALL_CONSOLES || game.consoleName === platform) &&
        (needle === "" || game.title.toLowerCase().includes(needle)),
    );
    return sortGames(filtered, sort);
  }, [loaded, filter, platform, sort]);

  const visible = matches.slice(0, shown);

  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onBack}>
            ← Back
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="My games">
        <PanelSectionRow>
          <TextField
            label="Filter by title"
            value={filter}
            bShowClearAction
            onChange={(event) => {
              setFilter(event.target.value);
              setShown(PAGE);
            }}
          />
        </PanelSectionRow>

        {consoles.length > 1 ? (
          <PanelSectionRow>
            <DropdownItem
              label="Console"
              rgOptions={[
                { data: ALL_CONSOLES, label: "All consoles" },
                ...consoles.map((name) => ({ data: name, label: name })),
              ]}
              selectedOption={platform}
              onChange={(option) => {
                const next: unknown = option.data;
                if (typeof next !== "string") return;
                setPlatform(next);
                setShown(PAGE);
              }}
            />
          </PanelSectionRow>
        ) : null}

        <PanelSectionRow>
          <DropdownItem
            label="Sort"
            rgOptions={GAME_SORT_MODES.map((entry) => ({ data: entry.mode, label: entry.label }))}
            selectedOption={sort}
            onChange={(option) => {
              // DropdownOption.data is typed `any` upstream; narrow it.
              const next: unknown = option.data;
              if (!isGameSortMode(next)) return;
              setSort(next);
              setShown(PAGE);
            }}
          />
        </PanelSectionRow>

        {loaded !== null ? (
          <PanelSectionRow>
            <div style={{ fontSize: "11px", color: "#7a838c", padding: "2px 0" }}>
              {filter.trim() === "" && platform === ALL_CONSOLES
                ? `${String(loaded.total)} games`
                : `${String(matches.length)} of ${String(loaded.total)} games`}
            </div>
          </PanelSectionRow>
        ) : null}

        <StateBoundary
          state={games.state}
          onRetry={games.refresh}
          isEmpty={() => matches.length === 0}
          emptyMessage={
            filter.trim() === "" && platform === ALL_CONSOLES
              ? "No games with RetroAchievements progress yet."
              : "No games match those filters."
          }
        >
          {() => (
            <>
              {visible.map((game) => (
                <GameRow key={game.gameId} game={game} onSelect={onSelectGame} />
              ))}

              {matches.length > visible.length ? (
                <PanelSectionRow>
                  <ButtonItem
                    layout="below"
                    onClick={() => {
                      setShown((count) => count + PAGE);
                    }}
                  >
                    {`Show more (${String(matches.length - visible.length)} left)`}
                  </ButtonItem>
                </PanelSectionRow>
              ) : null}
            </>
          )}
        </StateBoundary>
      </PanelSection>
    </>
  );
}

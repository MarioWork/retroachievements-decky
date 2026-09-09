/**
 * Plugin entry point and view routing.
 *
 * Navigation is an in-panel stack rather than a router page: on a Deck the Quick
 * Access panel is where this belongs, and a stack keeps every screen reachable
 * with the D-pad alone.
 */

import { definePlugin, useQuickAccessVisible } from "@decky/api";
import { PanelSection, staticClasses } from "@decky/ui";
import { useEffect, useState, type ReactNode } from "react";
import { FaTrophy } from "react-icons/fa";

import { AccountRecoveryProvider } from "./components/AccountRecovery";
import { StateBoundary } from "./components/StateBoundary";
import { useCredentials } from "./hooks/useCredentials";
import { subscribeToUnlocks } from "./services/notifications";
import { DashboardView } from "./views/DashboardView";
import { GameListView } from "./views/GameListView";
import { GameView } from "./views/GameView";
import { SetupView } from "./views/SetupView";

type View =
  | { readonly kind: "dashboard" }
  | { readonly kind: "games" }
  | { readonly kind: "game"; readonly gameId: number }
  | { readonly kind: "account" };

function Content(): ReactNode {
  const credentials = useCredentials();
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const visible = useQuickAccessVisible();

  // Coming back to the panel should not strand the user deep in a stale game
  // view from a previous session.
  useEffect(() => {
    if (!visible) setView({ kind: "dashboard" });
  }, [visible]);

  if (credentials.state.status === "loading") {
    return (
      <PanelSection>
        <StateBoundary state={{ status: "loading" }}>{() => null}</StateBoundary>
      </PanelSection>
    );
  }

  if (credentials.state.status === "error") {
    return (
      <PanelSection>
        <StateBoundary state={credentials.state} onRetry={credentials.reload}>
          {() => null}
        </StateBoundary>
      </PanelSection>
    );
  }

  if (!credentials.state.credentials.hasKey) {
    return <SetupView credentials={credentials} />;
  }

  const goToDashboard = (): void => {
    setView({ kind: "dashboard" });
  };
  const openAccount = (): void => {
    setView({ kind: "account" });
  };

  const screen = ((): ReactNode => {
    switch (view.kind) {
      case "account":
        return <SetupView credentials={credentials} onBack={goToDashboard} />;

      case "games":
        return (
          <GameListView
            onSelectGame={(gameId) => {
              setView({ kind: "game", gameId });
            }}
            onBack={goToDashboard}
          />
        );

      case "game":
        return <GameView gameId={view.gameId} onBack={goToDashboard} />;

      case "dashboard":
        return (
          <DashboardView
            onSelectGame={(gameId) => {
              setView({ kind: "game", gameId });
            }}
            onBrowseAll={() => {
              setView({ kind: "games" });
            }}
            onOpenSettings={openAccount}
          />
        );
    }
  })();

  return (
    // Null on the account screen itself -- offering "Update your API key" while
    // already looking at it would go nowhere.
    <AccountRecoveryProvider onOpenAccount={view.kind === "account" ? null : openAccount}>
      {screen}
    </AccountRecoveryProvider>
  );
}

export default definePlugin(() => {
  // Subscribed here rather than in Content: the panel's tree unmounts when the
  // user closes Quick Access, which is exactly when unlocks happen.
  const unsubscribeFromUnlocks = subscribeToUnlocks();

  return {
    name: "RetroAchievements",
    titleView: <div className={staticClasses.Title}>RetroAchievements</div>,
    content: <Content />,
    icon: <FaTrophy />,
    onDismount() {
      unsubscribeFromUnlocks();
    },
  };
});
